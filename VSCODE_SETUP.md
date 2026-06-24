# VS Code Port Forwarding Setup Guide

## How to Test with Your Friend Using VS Code Port Forwarding

### Step 1: Start Your Flask Application

1. Open the terminal in VS Code
2. Navigate to the project directory
3. Run the application:
```bash
python app.py
```
4. Wait for the message: "Running on http://0.0.0.0:5000"

### Step 2: Forward the Port in VS Code

1. In VS Code, open the **PORTS** tab (usually at the bottom panel, next to Terminal)
   - If you don't see it, go to View → Command Palette (Ctrl/Cmd + Shift + P)
   - Type "Ports: Focus on Ports View" and press Enter

2. Click the **"Forward a Port"** button (+ icon)

3. Enter the port number: **5000**

4. The port will appear in the list. Right-click on it and select:
   - **Port Visibility** → **Public**
   
   This is CRUCIAL! Without setting it to Public, your friend cannot access it.

5. You'll see a forwarded address like:
   - `https://xxxx-xxxx-xxxx.github.dev`
   - or `https://xxxx.preview.app.github.dev`

6. Copy this URL

### Step 3: Share with Your Friend

1. Send the full URL to your friend (including https://)
2. They should open it in their browser
3. Both of you can now register accounts and test the app!

## Important Limitations & Known Issues

### ⚠️ WebRTC May Not Work Through VS Code Tunnels

**The Problem:**
- VS Code port forwarding uses GitHub's infrastructure with strict security policies
- WebRTC requires direct peer-to-peer connections
- The proxy/tunnel can interfere with WebRTC signaling

**What Might Not Work:**
- ✗ Audio calls
- ✗ Video calls  
- ✗ Screen sharing

**What WILL Work:**
- ✓ User registration/login
- ✓ Real-time text chat
- ✓ Friend management
- ✓ Online status indicators

### Better Alternatives for Full Testing

#### Option 1: Use ngrok (Recommended)

ngrok creates a more direct tunnel that works better with WebRTC:

1. **Install ngrok:**
   - Download from: https://ngrok.com/download
   - Create free account
   - Extract and install

2. **Run ngrok:**
```bash
ngrok http 5000
```

3. **Copy the https URL:**
   - Example: `https://abc123.ngrok.io`
   - Share this with your friend

4. **Benefits:**
   - Works with WebRTC
   - More reliable for all features
   - Better for testing calls

#### Option 2: Deploy to Cloud (Best for Production)

Deploy to a real server for full functionality:

**Free/Cheap Options:**
- **Railway.app** - Very easy deployment, free tier
- **Render.com** - Free tier available
- **Heroku** - Free dyno (with limitations)
- **DigitalOcean** - $5/month droplet

**Why it's better:**
- Full HTTPS support
- No proxy interference
- WebRTC works perfectly
- Production-ready

### Troubleshooting VS Code Port Forwarding

#### Friend gets "Cannot connect" error
- Make sure port visibility is set to **Public**
- Check that your Flask app is running
- Try restarting the port forward

#### "This site can't be reached"
- The forwarded URL might have changed
- Stop and restart the port forward
- Copy the new URL

#### Text chat works but calls fail
- This is expected behavior with VS Code tunnels
- WebRTC needs direct connections
- Use ngrok or cloud deployment instead

#### Session/Login issues
- Clear cookies and try again
- Make sure you're using the same URL consistently
- Check that SECRET_KEY is set in app.py

## Testing Checklist

### Local Testing (Same Computer)
- [ ] Register two accounts in different browsers
- [ ] Send messages between accounts
- [ ] Test audio call
- [ ] Test video call
- [ ] Test screen sharing

### Remote Testing with VS Code
- [ ] Forward port 5000
- [ ] Set visibility to Public
- [ ] Share URL with friend
- [ ] Both register accounts
- [ ] Test text messaging ✓
- [ ] Test calls (may fail) ⚠️

### Remote Testing with ngrok
- [ ] Install ngrok
- [ ] Run: ngrok http 5000
- [ ] Share https URL
- [ ] Both register accounts
- [ ] Test text messaging ✓
- [ ] Test audio calls ✓
- [ ] Test video calls ✓
- [ ] Test screen sharing ✓

## Security Notes

When using port forwarding:
- Don't share personal/sensitive data
- Use strong passwords
- This is for testing only
- For production, use proper hosting with SSL

## Need Help?

If you encounter issues:
1. Check the main README.md troubleshooting section
2. Verify MySQL is running and configured
3. Check browser console for errors (F12)
4. Try using ngrok instead of VS Code forwarding

## Summary

✅ **VS Code Port Forwarding is good for:**
- Quick testing of chat functionality
- Showing the UI to others
- Testing basic features

❌ **VS Code Port Forwarding is NOT good for:**
- Testing audio/video calls
- Production use
- Long-term testing

🎯 **For full feature testing:**
Use ngrok or deploy to a cloud service!





    CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        ''')
        
        # Create friendships table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS friendships (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user1_id INT NOT NULL,
                user2_id INT NOT NULL,
                status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_friendship (user1_id, user2_id)
            )
        ''')
        
        # Create messages table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                message TEXT NOT NULL,
                message_type ENUM('text', 'file', 'image', 'video') DEFAULT 'text',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_conversation (sender_id, receiver_id, created_at)
            )
        ''')