from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from dotenv import load_dotenv
from db import get_db_connection
import os
import base64
import time
import uuid
load_dotenv()
import certifi
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Database configuration - UPDATE YOUR PASSWORD HERE


# Store active users and their socket IDs
active_users = {}



# Routes
@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        connection = get_db_connection()
        if connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute('SELECT * FROM users WHERE username = %s', (username,))
            user = cursor.fetchone()
            cursor.close()
            connection.close()
            
            if user and check_password_hash(user['password_hash'], password):
                session['user_id'] = user['id']
                session['username'] = user['username']
                return jsonify({'success': True, 'message': 'Login successful'})
            else:
                return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        
        connection = get_db_connection()
        if connection:
            cursor = connection.cursor()
            try:
                password_hash = generate_password_hash(password)
                cursor.execute(
                    'INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)',
                    (username, email, password_hash)
                )
                connection.commit()
                cursor.close()
                connection.close()
                return jsonify({'success': True, 'message': 'Registration successful'})
            except Error as e:
                cursor.close()
                connection.close()
                return jsonify({'success': False, 'message': 'Username or email already exists'}), 400
    
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/api/friends')
def get_friends():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    connection = get_db_connection()
    if connection:
        cursor = connection.cursor(dictionary=True)
        
        # FIXED QUERY - Now handles empty active_users properly
        if active_users:
            online_ids = ','.join(str(uid) for uid in active_users.keys())
            query = f'''
                SELECT u.id, u.username, u.last_seen,
                    CASE WHEN u.id IN ({online_ids}) THEN TRUE ELSE FALSE END as is_online,
                MAX(m.created_at) as last_message_time
                FROM users u
                INNER JOIN friendships f ON 
                (
                    (f.user1_id = %s AND f.user2_id = u.id) OR 
                    (f.user2_id = %s AND f.user1_id = u.id)
                    )
                 LEFT JOIN messages m ON
        (
            (m.sender_id = u.id AND m.receiver_id = %s)
            OR
            (m.sender_id = %s AND m.receiver_id = u.id)
        )
                WHERE f.status = 'accepted' AND u.id != %s
                  GROUP BY u.id
                ORDER BY last_message_time DESC
            '''
        else:
            # Simpler query when no users are online
            query = '''
                SELECT u.id, u.username, u.last_seen, FALSE as is_online,
                MAX(m.created_at) as last_message_time
                FROM users u
                INNER JOIN friendships f ON 
                (
                    (f.user1_id = %s AND f.user2_id = u.id) OR 
                    (f.user2_id = %s AND f.user1_id = u.id)
                    )
                 LEFT JOIN messages m ON
        (
            (m.sender_id = u.id AND m.receiver_id = %s)
            OR
            (m.sender_id = %s AND m.receiver_id = u.id)
        )
                WHERE f.status = 'accepted' AND u.id != %s
                  GROUP BY u.id
                ORDER BY last_message_time DESC
            '''
        
        cursor.execute(query, (user_id, user_id, user_id,user_id,user_id))
        friends = cursor.fetchall()
        cursor.close()
        connection.close()
        
        # Convert datetime to string
        for friend in friends:
            if friend['last_seen']:
                friend['last_seen'] = friend['last_seen'].isoformat()
            # Ensure is_online is boolean
            friend['is_online'] = bool(friend['is_online'])
        
        return jsonify(friends)
    return jsonify([])

UPLOAD_FOLDER = 'static/uploads'
PHOTO_FOLDER = os.path.join(UPLOAD_FOLDER, 'photos')
VOICE_FOLDER = os.path.join(UPLOAD_FOLDER, 'voice')

os.makedirs(PHOTO_FOLDER, exist_ok=True)
os.makedirs(VOICE_FOLDER, exist_ok=True)

# ────────────────────────────────────────────────────────────────
# 1. SEND PHOTO (Base64 or Multipart)
# ────────────────────────────────────────────────────────────────
@app.route('/api/send_photo', methods=['POST'])

def send_photo():
    try:
        data = request.json
        receiver_id = data.get('receiver_id')
        photo_data = data.get('photo')  # Base64 string
        filename = data.get('filename', 'photo.jpg')
        
        if not photo_data:
            return jsonify({'error': 'No photo data'}), 400
        
        # Remove data URL prefix if present
        if ',' in photo_data:
            photo_data = photo_data.split(',')[1]
        
        # Generate unique filename
        unique_name = f"{session['user_id']}_{receiver_id}_{uuid.uuid4().hex[:8]}.jpg"
        photo_path = os.path.join(PHOTO_FOLDER, unique_name)
        
        # Save photo
        with open(photo_path, 'wb') as f:
            f.write(base64.b64decode(photo_data))
        
        photo_url = f"/static/uploads/photos/{unique_name}"
        
        # Save to database
        conn = get_db_connection
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO messages (sender_id, receiver_id, message, is_photo, photo_url, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (session['user_id'], receiver_id, '📸 Photo', True, photo_url))
        
        message_id = cursor.lastrowid
        conn.commit()
        
        # Emit via socket
        socketio.emit('receive_photo', {
            'message_id': message_id,
            'sender_id': session['user_id'],
            'sender_name': session['username'],
            'photo': photo_url,
            'created_at': datetime.now().isoformat()
        }, room=f"user_{receiver_id}")
        
        return jsonify({
            'success': True,
            'message_id': message_id,
            'photo_url': photo_url
        })
        
    except Exception as e:
        print(f"Photo error: {e}")
        return jsonify({'error': str(e)}), 500

# ────────────────────────────────────────────────────────────────
# 2. EDIT MESSAGE
# ────────────────────────────────────────────────────────────────
@app.route('/api/edit_message', methods=['POST'])

def edit_message():
    data = request.json
    message_id = data.get('message_id')
    new_text = data.get('new_text')
    
    if not message_id or not new_text:
        return jsonify({'error': 'Missing data'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if user owns this message
    cursor.execute('SELECT sender_id, receiver_id FROM messages WHERE id = ?', (message_id,))
    msg = cursor.fetchone()
    
    if not msg or msg['sender_id'] != session['user_id']:
        return jsonify({'error': 'Unauthorized'}), 403
    
    cursor.execute('''
        UPDATE messages 
        SET message = ?, edited = 1, edited_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (new_text, message_id))
    conn.commit()
    
    # Notify receiver
    socketio.emit('message_edited', {
        'message_id': message_id,
        'new_text': new_text
    }, room=f"user_{msg['receiver_id']}")
    
    return jsonify({'success': True})



# ────────────────────────────────────────────────────────────────
# 3. DELETE / UNSEND MESSAGE
# ────────────────────────────────────────────────────────────────
@app.route('/api/delete_message', methods=['POST'])

def delete_message():
    data = request.json
    message_id = data.get('message_id')
    scope = data.get('scope', 'me')  # 'me' or 'everyone'
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT sender_id, receiver_id FROM messages WHERE id = ?', (message_id,))
    msg = cursor.fetchone()
    
    if not msg:
        return jsonify({'error': 'Message not found'}), 404
    
    if scope == 'everyone' and msg['sender_id'] == session['user_id']:
        # Delete completely from DB
        cursor.execute('DELETE FROM messages WHERE id = ?', (message_id,))
        # Notify everyone
        socketio.emit('message_deleted', {
            'message_id': message_id,
            'scope': 'everyone'
        }, room=f"user_{msg['receiver_id']}")
    elif scope == 'me':
        # Hide only for current user (add deleted_for column or just filter)
        cursor.execute('UPDATE messages SET deleted_for_sender = 1 WHERE id = ? AND sender_id = ?', 
                      (message_id, session['user_id']))
    else:
        return jsonify({'error': 'Unauthorized'}), 403
    
    conn.commit()
    return jsonify({'success': True})
@app.route('/api/mark_read', methods=['POST'])

def mark_read():
    data = request.json
    message_ids = data.get('message_ids', [])
    
    if not message_ids:
        return jsonify({'success': True})
    
    conn = get_db()
    cursor = conn.cursor()
    
    placeholders = ','.join('?' * len(message_ids))
    cursor.execute(f'''
        UPDATE messages 
        SET read_at = CURRENT_TIMESTAMP 
        WHERE id IN ({placeholders}) AND receiver_id = ?
    ''', (*message_ids, session['user_id']))
    conn.commit()
    
    # Get senders to notify
    cursor.execute(f'''
        SELECT DISTINCT sender_id FROM messages 
        WHERE id IN ({placeholders}) AND receiver_id = ?
    ''', (*message_ids, session['user_id']))
    
    senders = cursor.fetchall()
    for sender in senders:
        socketio.emit('messages_read', {
            'message_ids': message_ids,
            'reader_id': session['user_id']
        }, room=f"user_{sender['sender_id']}")
    
    return jsonify({'success': True})
@app.route('/api/add_reaction', methods=['POST'])

def add_reaction():
    data = request.json
    message_id = data.get('message_id')
    emoji = data.get('emoji')
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if reaction already exists
    cursor.execute('''
        SELECT id FROM reactions 
        WHERE message_id = ? AND user_id = ? AND emoji = ?
    ''', (message_id, session['user_id'], emoji))
    
    existing = cursor.fetchone()
    
    if existing:
        # Remove reaction
        cursor.execute('DELETE FROM reactions WHERE id = ?', (existing['id'],))
    else:
        # Add reaction
        cursor.execute('''
            INSERT INTO reactions (message_id, user_id, emoji, created_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ''', (message_id, session['user_id'], emoji))
    
    conn.commit()
    
    # Get updated reaction count
    cursor.execute('''
        SELECT emoji, COUNT(*) as count FROM reactions 
        WHERE message_id = ? GROUP BY emoji
    ''', (message_id,))
    reactions = cursor.fetchall()
    
    # Notify message participants
    cursor.execute('SELECT sender_id, receiver_id FROM messages WHERE id = ?', (message_id,))
    msg = cursor.fetchone()
    
    if msg:
        socketio.emit('reaction_updated', {
            'message_id': message_id,
            'reactions': [dict(r) for r in reactions]
        }, room=f"user_{msg['sender_id']}")
        socketio.emit('reaction_updated', {
            'message_id': message_id,
            'reactions': [dict(r) for r in reactions]
        }, room=f"user_{msg['receiver_id']}")
    
    return jsonify({'success': True, 'reactions': [dict(r) for r in reactions]})
@app.route('/api/messages/<int:friend_id>')
def get_messages(friend_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    connection = get_db_connection()
    if connection:
        cursor = connection.cursor(dictionary=True)
        cursor.execute('''
            SELECT m.*, u.username as sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id = %s AND m.receiver_id = %s) 
               OR (m.sender_id = %s AND m.receiver_id = %s)
            ORDER BY m.created_at ASC
            LIMIT 100
        ''', (user_id, friend_id, friend_id, user_id))
        messages = cursor.fetchall()
        
        # Mark messages as read
        cursor.execute('''
            UPDATE messages SET is_read = TRUE 
            WHERE sender_id = %s AND receiver_id = %s AND is_read = FALSE
        ''', (friend_id, user_id))
#         #added now
#         cursor.execute('''
#             SELECT accepted_at

#             FROM friendships

#         WHERE(
#         (user1_id=%s AND user2_id=%s)
#         OR
#         (user1_id=%s AND user2_id=%s)
#     )

#     AND status='accepted'
# ''',(user_id,friend_id,friend_id,user_id))

#         friendship = cursor.fetchone()
        connection.commit()
        
        cursor.close()
        connection.close()
        
        # Convert datetime to string
        for msg in messages:
            if msg['created_at']:
                msg['created_at'] = msg['created_at'].isoformat()
        
        return jsonify(messages)
    return jsonify([])

@app.route('/api/users/search')
def search_users():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    query = request.args.get('q', '')
    user_id = session['user_id']
    
    connection = get_db_connection()
    if connection:
        cursor = connection.cursor(dictionary=True)
        cursor.execute('''
            SELECT id, username FROM users 
            WHERE username LIKE %s AND id != %s
            LIMIT 10
        ''', (f'%{query}%', user_id))
        users = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(users)
    return jsonify([])

@app.route('/api/friends/add', methods=['POST'])
def add_friend():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    friend_id = data.get('friend_id')
    user_id = session['user_id']
    
    connection = get_db_connection()
    if connection:
        cursor = connection.cursor()
        try:
            cursor.execute('''
                INSERT INTO friendships (user1_id, user2_id, status) 
                VALUES (%s, %s, 'accepted')
            ''', (user_id, friend_id))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({'success': True})
        except Error:
            cursor.close()
            connection.close()
            return jsonify({'success': False, 'message': 'Already friends'}), 400
    return jsonify({'success': False}), 500


# WebSocket events
@socketio.on('connect')
def handle_connect():
    if 'user_id' in session:
        user_id = session['user_id']
        active_users[user_id] = request.sid
        emit('user_connected', {'user_id': user_id}, broadcast=True)
        print(f"User {user_id} connected with sid {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    if 'user_id' in session:
        user_id = session['user_id']
        if user_id in active_users:
            del active_users[user_id]
        emit('user_disconnected', {'user_id': user_id}, broadcast=True)
        print(f"User {user_id} disconnected")

@socketio.on('send_message')
def handle_message(data):
    if 'user_id' not in session:
        return
    
    sender_id = session['user_id']
    receiver_id = data.get('receiver_id')
    message_text = data.get('message')
    
    # Save to database
    connection = get_db_connection()
    if connection:
        cursor = connection.cursor()
        cursor.execute('''
            INSERT INTO messages (sender_id, receiver_id, message, message_type)
            VALUES (%s, %s, %s, 'text')
        ''', (sender_id, receiver_id, message_text))
        message_id = cursor.lastrowid
        connection.commit()
        cursor.close()
        connection.close()
        
        # Send to receiver if online
        if receiver_id in active_users:
            emit('receive_message', {
                'id': message_id,
                'sender_id': sender_id,
                'sender_name': session['username'],
                'message': message_text,
                'created_at': datetime.now().isoformat()
            }, room=active_users[receiver_id])
        
        # Confirm to sender
        emit('message_sent', {
            'id': message_id,
            'receiver_id': receiver_id,
            'message': message_text,
            'created_at': datetime.now().isoformat()
        })

# WebRTC signaling
@socketio.on('call_user')
def handle_call_user(data):
    receiver_id = data.get('to')
    offer = data.get('offer')
    call_type = data.get('call_type', 'video')
    
    if receiver_id in active_users:
        emit('incoming_call', {
            'from': session['user_id'],
            'from_name': session['username'],
            'offer': offer,
            'call_type': call_type
        }, room=active_users[receiver_id])

@socketio.on('answer_call')
def handle_answer_call(data):
    caller_id = data.get('to')
    answer = data.get('answer')
    
    if caller_id in active_users:
        emit('call_answered', {
            'from': session['user_id'],
            'answer': answer
        }, room=active_users[caller_id])

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    receiver_id = data.get('to')
    candidate = data.get('candidate')
    
    if receiver_id in active_users:
        emit('ice_candidate', {
            'from': session['user_id'],
            'candidate': candidate
        }, room=active_users[receiver_id])

@socketio.on('end_call')
def handle_end_call(data):
    receiver_id = data.get('to')
    
    if receiver_id in active_users:
        emit('call_ended', {
            'from': session['user_id']
        }, room=active_users[receiver_id])

@socketio.on('reject_call')
def handle_reject_call(data):
    caller_id = data.get('to')
    
    if caller_id in active_users:
        emit('call_rejected', {
            'from': session['user_id']
        }, room=active_users[caller_id])

@socketio.on('typing')
def handle_typing(data):

    receiver_id = data.get('to')

    if receiver_id in active_users:

        emit('typing', {
            'from': session['user_id'],
            'username': session['username']
        }, room=active_users[receiver_id])


@socketio.on('camera_opened')
def handle_camera_opened(data):

    receiver_id = data.get('to')

    if receiver_id in active_users:

        emit('camera_opened', {
            'username': session['username']
        }, room=active_users[receiver_id])

@socketio.on('live_typing')
def handle_live_typing(data):

    receiver_id = data.get('to')
    text = data.get('text')

    if receiver_id in active_users:

        emit('live_typing', {

            'from': session['user_id'],
            'text': text

        }, room=active_users[receiver_id])

@socketio.on('viewing_chat')
def handle_viewing_chat(data):
    """Emitted when a user opens/is in the chat window of a friend."""
    receiver_id = data.get('to')
    if receiver_id in active_users:
        emit('viewing_chat', {
            'from': session['user_id'],
            'username': session['username']
        }, room=active_users[receiver_id])
 
 
@socketio.on('viewing_photo')
def handle_viewing_photo(data):
    """Emitted when a user opens a photo in the photo viewer."""
    receiver_id = data.get('to')
    if receiver_id in active_users:
        emit('viewing_photo', {
            'from': session['user_id'],
            'username': session['username']
        }, room=active_users[receiver_id])
 
 
@socketio.on('closed_photo')
def handle_closed_photo(data):
    """Emitted when a user closes the photo viewer."""
    receiver_id = data.get('to')
    if receiver_id in active_users:
        emit('closed_photo', {
            'from': session['user_id'],
            'username': session['username']
        }, room=active_users[receiver_id])
 
 
@socketio.on('stop_viewing_chat')
def handle_stop_viewing_chat(data):
    """Emitted when user leaves chat (tab hidden, back btn, switched friend)."""
    receiver_id = data.get('to')
    if receiver_id in active_users:
        emit('stop_viewing_chat', {
            'from': session['user_id'],
            'username': session['username']
        }, room=active_users[receiver_id])        


@socketio.on('message_delivered')
def handle_message_delivered(data):
    message_id = data.get('message_id')
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE messages SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?', (message_id,))
    conn.commit()
    
    # Notify sender
    cursor.execute('SELECT sender_id FROM messages WHERE id = ?', (message_id,))
    msg = cursor.fetchone()
    if msg:
        emit('message_delivered_ack', {'message_id': message_id}, room=f"user_{msg['sender_id']}")

@socketio.on('add_reaction')
def handle_add_reaction(data):
    if 'user_id' not in session:
        return
    
    message_id = data.get('message_id')
    emoji = data.get('emoji')
    
    conn = get_db_connection()
    if conn:
        cursor = conn.cursor(dictionary=True)
        
        # Check if user already reacted to this message
        cursor.execute('SELECT id, emoji FROM reactions WHERE message_id = %s AND user_id = %s',
                      (message_id, session['user_id']))
        existing = cursor.fetchone()
        
        if existing:
            if existing['emoji'] == emoji:
                # Same emoji → REMOVE reaction
                cursor.execute('DELETE FROM reactions WHERE id = %s', (existing['id'],))
            else:
                # Different emoji → UPDATE to new emoji
                cursor.execute('UPDATE reactions SET emoji = %s WHERE id = %s', (emoji, existing['id']))
        else:
            # No reaction yet → ADD new reaction
            cursor.execute('INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (%s, %s, %s, CURRENT_TIMESTAMP)',
                          (message_id, session['user_id'], emoji))
        
        conn.commit()
        
        # Get ALL reactions with user details
        cursor.execute('''
            SELECT r.emoji, r.user_id, u.username 
            FROM reactions r
            JOIN users u ON r.user_id = u.id
            WHERE r.message_id = %s
            ORDER BY r.created_at ASC
        ''', (message_id,))
        reactions = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # Get message participants
        conn2 = get_db_connection()
        cursor2 = conn2.cursor(dictionary=True)
        cursor2.execute('SELECT sender_id, receiver_id FROM messages WHERE id = %s', (message_id,))
        msg = cursor2.fetchone()
        cursor2.close()
        conn2.close()
        
        if msg:
            # Send updated reactions to both users
            reaction_data = {
                'message_id': message_id,
                'reactions': [{'emoji': r['emoji'], 'user_id': r['user_id'], 'username': r['username']} for r in reactions],
                'current_user_id': session['user_id']
            }
            
            if msg['sender_id'] in active_users:
                emit('reaction_updated', reaction_data, room=active_users[msg['sender_id']])
            
            if msg['receiver_id'] in active_users:
                emit('reaction_updated', reaction_data, room=active_users[msg['receiver_id']])
@socketio.on('send_photo')
def handle_send_photo(data):
    if 'user_id' not in session:
        return
    
    receiver_id = data.get('to')
    photo_data = data.get('photo')
    filename = data.get('filename', 'photo.jpg')
    
    unique_name = f"photo_{session['user_id']}_{receiver_id}_{int(time.time())}_{uuid.uuid4().hex[:8]}.jpg"
    photo_path = os.path.join(PHOTO_FOLDER, unique_name)
    
    if ',' in photo_data:
        photo_data = photo_data.split(',')[1]
    
    with open(photo_path, 'wb') as f:
        f.write(base64.b64decode(photo_data))
    
    photo_url = f"/static/uploads/photos/{unique_name}"
    
    conn = get_db_connection()
    if conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO messages (sender_id, receiver_id, message, is_photo, photo_url, created_at)
            VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        ''', (session['user_id'], receiver_id, '📸 Photo', True, photo_url))
        
        message_id = cursor.lastrowid
        conn.commit()
        cursor.close()
        conn.close()
        
        if receiver_id in active_users:
            emit('receive_photo', {
                'message_id': message_id,
                'sender_id': session['user_id'],
                'sender_name': session['username'],
                'photo': photo_url,
                'created_at': datetime.now().isoformat()
            }, room=active_users[receiver_id])


@socketio.on('delete_message')
def handle_delete_message(data):
    if 'user_id' not in session:
        return
    
    message_id = data.get('message_id')
    scope = data.get('scope', 'me')
    receiver_id = data.get('to')
    
    conn = get_db_connection()
    if conn:
        cursor = conn.cursor()
        
        if scope == 'everyone':
            cursor.execute('DELETE FROM messages WHERE id = %s AND sender_id = %s', (message_id, session['user_id']))
            conn.commit()
            
            if receiver_id in active_users:
                emit('message_deleted', {
                    'message_id': message_id,
                    'scope': 'everyone'
                }, room=active_users[receiver_id])
        
        cursor.close()
        conn.close()

if __name__ == '__main__':
    
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)