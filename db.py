import pymysql
import ssl
import certifi
import os

DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'port': int(os.getenv('DB_PORT', 4000)),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME'),
    'ssl': {
        'ca': certifi.where(),
        'check_hostname': True
    }
}

def get_db_connection():
    connection = pymysql.connect(**DB_CONFIG)
    original_cursor = connection.cursor
    
    def dictionary_cursor_wrapper(*args, **kwargs):
        # Pop the 'dictionary' flag so it doesn't pass to PyMySQL
        is_dict = kwargs.pop('dictionary', False)
        
        # If dictionary=True was requested, explicitly use PyMySQL's DictCursor
        if is_dict:
            return original_cursor(pymysql.cursors.DictCursor)
        
        # Otherwise, return a standard tuple cursor
        return original_cursor(*args, **kwargs)
    
    connection.cursor = dictionary_cursor_wrapper
    return connection

    

def init_db():
    try:
        conn = get_db_connection()
        if conn is None:
            print("Database connection failed. Skipping table initialization.")
            return
            
        cursor = conn.cursor()
        
        # 1. Users Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                email VARCHAR(100) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)
        
        # 2. Reactions Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                message_id INT NOT NULL,
                user_id INT NOT NULL,
                emoji VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 3. Messages Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                message TEXT NOT NULL,
                message_type ENUM('text', 'file', 'image', 'video') DEFAULT 'text',
                is_read TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                edited TINYINT(1) DEFAULT 0,
                edited_at TIMESTAMP NULL DEFAULT NULL,
                read_at TIMESTAMP NULL DEFAULT NULL,
                delivered_at TIMESTAMP NULL DEFAULT NULL,
                is_photo TINYINT(1) DEFAULT 0,
                photo_url TEXT DEFAULT NULL,
                is_voice TINYINT(1) DEFAULT 0,
                voice_url TEXT DEFAULT NULL,
                voice_duration INT DEFAULT NULL,
                deleted_for_sender TINYINT(1) DEFAULT 0,
                deleted_for_receiver TINYINT(1) DEFAULT 0
            )
        """)

        # 4. Friendships Table (Aapka latest screenshot)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS friendships (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user1_id INT NOT NULL,
                user2_id INT NOT NULL,
                status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                accepted_at TIMESTAMP NULL DEFAULT NULL
            )
        """)
        
        conn.commit()
        cursor.close()
        conn.close()
        print("All database tables verified and initialized successfully!")
    except Exception as e:
        print(f"Database initialization error: {e}")

# Isko Flask app start hone se pehle call zaroor karna
init_db()
