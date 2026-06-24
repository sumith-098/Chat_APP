

// ── Socket ────────────────────────────────────────────────────
const socket = io();

// ── State ─────────────────────────────────────────────────────
let currentFriend    = null;
let localStream      = null;
let remoteStream     = null;
let screenStream     = null;
let peerConnection   = null;
let callType         = null;
let incomingCallData = null;
let unseenMessages   = {};
let isMobile         = window.innerWidth <= 768;

// Presence / idle tracking
let idleTimer        = null;
let friendIsIdle     = false;

// Pending permission callback
let pendingPermissionResolve = null;
let pendingPermissionReject  = null;

// ── WebRTC config ──────────────────────────────────────────────
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ── DOM references ─────────────────────────────────────────────
const friendsList        = document.getElementById('friendsList');
const emptyState         = document.getElementById('emptyState');
const chatContainer      = document.getElementById('chatContainer');
const messagesContainer  = document.getElementById('messagesContainer');
const messages           = document.getElementById('messages');
const messageInput       = document.getElementById('messageInput');
const sendBtn            = document.getElementById('sendBtn');
const searchInput        = document.getElementById('searchUsers');
const searchResults      = document.getElementById('searchResults');
const logoutBtn          = document.getElementById('logoutBtn');
const sidebar            = document.getElementById('sidebar');
const mobileBackBtn      = document.getElementById('mobileBackBtn');

// Call elements
const callModal          = document.getElementById('callModal');
const incomingCallModal  = document.getElementById('incomingCallModal');
const localVideo         = document.getElementById('localVideo');
const remoteVideo        = document.getElementById('remoteVideo');
const screenVideo        = document.getElementById('screenVideo');
const screenShareVideo   = document.getElementById('screenShareVideo');

// Buttons
const audioCallBtn   = document.getElementById('audioCallBtn');
const videoCallBtn   = document.getElementById('videoCallBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const endCallBtn     = document.getElementById('endCallBtn');
const acceptCallBtn  = document.getElementById('acceptCallBtn');
const rejectCallBtn  = document.getElementById('rejectCallBtn');
const toggleMicBtn   = document.getElementById('toggleMicBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');

// Premium UI elements
const liveTypingWrapper = document.getElementById('liveTypingWrapper');
const liveTypingText    = document.getElementById('liveTypingText');
const liveTypingAvatar  = document.getElementById('liveTypingAvatar');
const cameraStateWrapper= document.getElementById('cameraStateWrapper');
const cameraStateAvatar = document.getElementById('cameraStateAvatar');
const cameraStateText   = document.getElementById('cameraStateText');
const idleZone          = document.getElementById('idleZone');
const avatarIdleIndicator = document.getElementById('avatarIdleIndicator');
const typingIndicator   = document.getElementById('typingIndicator');
const typingNameEl      = document.getElementById('typingName');
const permissionOverlay = document.getElementById('permissionOverlay');
const permAllowBtn      = document.getElementById('permAllowBtn');
const permDenyBtn       = document.getElementById('permDenyBtn');
const photoViewer       = document.getElementById('photoViewer');
const photoViewerImg    = document.getElementById('photoViewerImg');
const photoClose        = document.getElementById('photoClose');
const pvAvatar          = document.getElementById('pvAvatar');
const presenceBanner    = document.getElementById('presenceBanner');
const presenceText      = document.getElementById('presenceText');
const toastContainer    = document.getElementById('toastContainer');
const selfAvatarEl      = document.getElementById('selfAvatar');

// Camera
const cameraBtn   = document.getElementById('cameraBtn');
const cameraInput = document.getElementById('cameraInput');

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initSelfAvatar();
    loadFriends();
    setupEventListeners();
    setupSocketListeners();
    setupMobileHandlers();
    handleResize();
    requestNotificationPermission();
});

window.addEventListener('resize', handleResize);

// ── Self avatar initials ───────────────────────────────────────
function initSelfAvatar() {
    if (!selfAvatarEl) return;
    // username comes from template; grab from user-chip-name
    const nameEl = document.querySelector('.user-chip-name');
    if (nameEl) {
        selfAvatarEl.textContent = nameEl.textContent.trim().charAt(0).toUpperCase();
    }
}

// ── Resize handler (EXACT same logic as original) ──────────────
function handleResize() {
    isMobile = window.innerWidth <= 768;

    if (!isMobile) {
        sidebar.style.display = 'flex';
        sidebar.classList.remove('mobile-open');
        if (mobileBackBtn) mobileBackBtn.style.display = 'none';
        emptyState.style.display = currentFriend ? 'none' : 'flex';
    } else {
        updateMobileUI();
    }
}

function updateMobileUI() {
    if (!isMobile) return;
    if (currentFriend) {
        if (mobileBackBtn) mobileBackBtn.style.display = 'flex';
        chatContainer.style.display  = 'flex';
        sidebar.style.display        = 'none';
        sidebar.classList.remove('mobile-open');
    } else {
        if (mobileBackBtn) mobileBackBtn.style.display = 'none';
        chatContainer.style.display  = 'none';
        sidebar.style.display        = 'flex';
        sidebar.classList.add('mobile-open');
        emptyState.style.display     = 'none';
    }
}

// ── Mobile handlers (EXACT same logic as original) ─────────────
function setupMobileHandlers() {
    if (!mobileBackBtn) return;
    mobileBackBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isMobile) return;

        // Reset idle / presence states when going back
        stopViewingHeartbeat();   // tell friend we left
        clearIdleState();
        hideCameraState();
        hideLiveTyping();

        currentFriend = null;
        document.querySelectorAll('.friend-item').forEach(i => i.classList.remove('active'));

        chatContainer.style.display = 'none';
        chatContainer.classList.remove('mobile-active');
        if (mobileBackBtn) mobileBackBtn.style.display = 'none';

        sidebar.style.display = 'flex';
        sidebar.classList.add('mobile-open');
        if (emptyState) emptyState.style.display = 'none';
    });
}

// ── Load friends ───────────────────────────────────────────────
async function loadFriends() {
    try {
        const res     = await fetch('/api/friends');
        const friends = await res.json();

        friendsList.innerHTML = '';

        if (!friends.length) {
            friendsList.innerHTML = '<div class="loading">No contacts yet. Search to add someone.</div>';
            return;
        }

        friends.forEach(f => friendsList.appendChild(createFriendElement(f)));
    } catch (err) {
        console.error('loadFriends:', err);
        friendsList.innerHTML = '<div class="loading">Error loading contacts</div>';
    }
}

// ── Create friend element ──────────────────────────────────────
function createFriendElement(friend) {
    const div     = document.createElement('div');
    div.className = 'friend-item';
    div.dataset.friendId = friend.id;

    const initial  = friend.username.charAt(0).toUpperCase();
    const isOnline = friend.is_online;

    div.innerHTML = `
        <div class="avatar ${isOnline ? 'online' : ''}">${initial}</div>
        <div class="friend-info">
            <div class="friend-name">${escapeHtml(friend.username)}</div>
            <div class="friend-status ${isOnline ? 'online' : ''}">${isOnline ? '● Online' : 'Offline'}</div>
        </div>
    `;

    div.addEventListener('click', () => selectFriend(friend));
    return div;
}

// ── Select friend (EXACT same logic as original) ───────────────
async function selectFriend(friend) {
    // 1. Clear immediately
    messages.innerHTML = '';
    document.getElementById('currentFriendName').textContent  = 'Loading…';
    document.getElementById('currentFriendStatus').textContent = '';
    document.getElementById('currentFriendAvatar').textContent = '';
    document.getElementById('currentFriendAvatar').className   = 'avatar';

    // Reset premium states
    clearIdleState();
    hideCameraState();
    hideLiveTyping();
    if (typingIndicator) typingIndicator.classList.remove('show');

    currentFriend = friend;

    // 2. Active styling
    document.querySelectorAll('.friend-item').forEach(i => i.classList.remove('active'));
    const el = document.querySelector(`[data-friend-id="${friend.id}"]`);
    if (el) el.classList.add('active');

    // 3. Mobile transition (EXACT same as original)
    if (isMobile) {
        sidebar.style.display = 'none';
        sidebar.classList.remove('mobile-open');
        chatContainer.style.display = 'flex';
        chatContainer.classList.add('mobile-active');
        if (mobileBackBtn) mobileBackBtn.style.display = 'flex';
    } else {
        emptyState.style.display    = 'none';
        chatContainer.style.display = 'flex';
    }

    // 4. Header info
    const initial = friend.username.charAt(0).toUpperCase();
    const avatarEl = document.getElementById('currentFriendAvatar');
    avatarEl.textContent = initial;
    avatarEl.className   = `avatar ${friend.is_online ? 'online' : ''}`;

    document.getElementById('currentFriendName').textContent = friend.username;

    const statusEl  = document.getElementById('currentFriendStatus');
    const statusDot = document.getElementById('statusDot');
    statusEl.textContent = friend.is_online ? 'Online' : 'Offline';
    statusEl.className   = 'header-status';
    if (statusDot) {
        statusDot.className = friend.is_online ? 'status-dot online' : 'status-dot';
    }

    // Update call modal peer info
    const callPeerAvatar = document.getElementById('callPeerAvatar');
    const callPeerName   = document.getElementById('callPeerName');
    const nvAvatar       = document.getElementById('nvAvatar');
    const incAvatar      = document.getElementById('incAvatar');
    if (callPeerAvatar) callPeerAvatar.textContent = initial;
    if (callPeerName)   callPeerName.textContent   = friend.username;
    if (nvAvatar)       nvAvatar.textContent       = initial;

    // Update live typing avatar initials
    if (liveTypingAvatar)  liveTypingAvatar.textContent  = initial;
    if (cameraStateAvatar) cameraStateAvatar.textContent = initial;

    // 5. Clear unseen badge
    delete unseenMessages[friend.id];
    updateFriendNotification(friend.id);

    // 6. Load messages
    await loadMessages(friend.id);
    messageInput.focus();

    // Start heartbeat — friend sees us "viewing" every 2s while we're here
    startViewingHeartbeat();
}

// ── Load messages ──────────────────────────────────────────────
async function loadMessages(friendId) {
    try {
        const res  = await fetch(`/api/messages/${friendId}`);
        const list = await res.json();

        messages.innerHTML = '';
        list.forEach(msg => appendMessage(msg, false));
        scrollToBottom('instant');
    } catch (err) {
        console.error('loadMessages:', err);
    }
}

// ── Enhanced message append with ID and reactions ──────────────
function appendMessage(message, shouldScroll = true) {
    const div = document.createElement('div');
    const isSent = message.sender_id !== currentFriend?.id;
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    div.setAttribute('data-mid', message.id || Date.now());
    div.setAttribute('data-sender', isSent ? 'me' : 'friend');
    
    const time = new Date(message.created_at).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
    
    // Add reaction buttons
    const reactions = message.reactions || [];
    const reactionHtml = reactions.length > 0 ? `
        <div class="message-reactions">
            ${reactions.map(r => `<span class="reaction">${r.emoji} <span class="reaction-count">${r.count}</span></span>`).join('')}
        </div>
    ` : '';
    
    div.innerHTML = `
        <div class="message-bubble">
            <div class="message-text">${escapeHtml(message.message)}</div>
            <div class="message-footer">
                <span class="message-time">${time}</span>
                ${isSent ? `<span class="message-status ${message.delivered ? 'delivered' : 'sent'}">${message.delivered ? '✓✓' : '✓'}</span>` : ''}
            </div>
            ${reactionHtml}
        </div>
    `;
    
    // Add context menu on right-click (for sent messages)
    if (isSent) {
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showMessageMenu(message.id, message.message, true);
        });
    }
    
    // Add long-press for mobile
    let pressTimer;
    div.addEventListener('touchstart', (e) => {
        if (isSent) {
            pressTimer = setTimeout(() => {
                showMessageMenu(message.id, message.message, true);
            }, 500);
        }
    });
    div.addEventListener('touchend', () => clearTimeout(pressTimer));
    div.addEventListener('touchmove', () => clearTimeout(pressTimer));
    
    messages.appendChild(div);
    if (shouldScroll) scrollToBottom('smooth');
}

// ── Send message ───────────────────────────────────────────────
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentFriend) return;

    socket.emit('send_message', { receiver_id: currentFriend.id, message: text });
    hideLiveTyping();
    messageInput.value = '';
}

// ── Scroll helper ──────────────────────────────────────────────
function scrollToBottom(behavior = 'smooth') {
    if (!messagesContainer) return;
    setTimeout(() => {
        messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior });
    }, 10);
}

// ── Search ─────────────────────────────────────────────────────
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) { searchResults.classList.remove('active'); return; }

    searchTimeout = setTimeout(async () => {
        try {
            const res   = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
            const users = await res.json();
            searchResults.innerHTML = '';

            if (!users.length) {
                searchResults.innerHTML = '<div class="search-result-item">No users found</div>';
            } else {
                users.forEach(u => {
                    const div = document.createElement('div');
                    div.className   = 'search-result-item';
                    div.textContent = u.username;
                    div.addEventListener('click', () => addFriend(u.id));
                    searchResults.appendChild(div);
                });
            }
            searchResults.classList.add('active');
        } catch (err) { console.error('search:', err); }
    }, 300);
});

// ── Add friend ─────────────────────────────────────────────────
async function addFriend(friendId) {
    try {
        const res = await fetch('/api/friends/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friend_id: friendId })
        });
        if (res.ok) {
            searchInput.value = '';
            searchResults.classList.remove('active');
            loadFriends();
            showPresenceBanner('Friend added ✓');
        }
    } catch (err) { console.error('addFriend:', err); }
}

// ================================================================
//  PREMIUM PERMISSION SYSTEM
//  Replaces naked browser prompts with a beautiful overlay
// ================================================================
function requestPermission(icon, title, desc) {
    return new Promise((resolve, reject) => {
        const overlay   = permissionOverlay;
        const iconEl    = document.getElementById('permissionIcon');
        const titleEl   = document.getElementById('permissionTitle');
        const descEl    = document.getElementById('permissionDesc');

        iconEl.textContent  = icon;
        titleEl.textContent = title;
        descEl.textContent  = desc;
        overlay.classList.remove('hidden');

        pendingPermissionResolve = () => {
            overlay.classList.add('hidden');
            resolve(true);
        };
        pendingPermissionReject = () => {
            overlay.classList.add('hidden');
            reject(new Error('Permission denied by user'));
        };
    });
}

permAllowBtn.addEventListener('click', () => {
    if (pendingPermissionResolve) { pendingPermissionResolve(); pendingPermissionResolve = null; }
});

permDenyBtn.addEventListener('click', () => {
    if (pendingPermissionReject) { pendingPermissionReject(); pendingPermissionReject = null; }
});

// Wraps getUserMedia with permission dialog
async function getMediaWithPermission(constraints, type) {
    const isVideo  = constraints.video;
    const isAudio  = constraints.audio;
    const isScreen = type === 'screen';

    if (isScreen) {
        await requestPermission(
            '🖥️',
            'Screen Share',
            'SUMITSU wants to share your screen. Only content you choose will be shared.'
        );
    } else if (isVideo && isAudio) {
        await requestPermission(
            '📹',
            'Camera & Microphone',
            'SUMITSU needs camera and microphone access to start a video call. Your call is end-to-end encrypted.'
        );
    } else if (isAudio) {
        await requestPermission(
            '🎙️',
            'Microphone Access',
            'SUMITSU needs microphone access for this audio call. Your call is end-to-end encrypted.'
        );
    } else {
        await requestPermission(
            '📷',
            'Camera Access',
            'SUMITSU needs camera access. Everything stays private on your device.'
        );
    }

    if (isScreen) {
        return await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true });
    }
    return await navigator.mediaDevices.getUserMedia(constraints);
}

// ================================================================
//  WEBRTC
// ================================================================
async function startCall(type) {
    if (!currentFriend) return;
    callType = type;

    try {
        const constraints = getMediaConstraints(type);
        localStream = await getMediaWithPermission(constraints, type);

        localVideo.srcObject = localStream;
        callModal.classList.add('active');
        document.getElementById('callStatus').textContent = 'Calling…';

        // Show/hide no-video placeholder
        updateNoVideoPlaceholder(false);

        await createPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('call_user', { to: currentFriend.id, offer, call_type: type });
    } catch (err) {
        console.error('startCall:', err);
        showToast('⚠️', 'Call Failed', err.message || 'Could not access media devices');
        endCall();
    }
}

async function startScreenShare() {
    if (!currentFriend) return;
    try {
        screenStream = await getMediaWithPermission({}, 'screen');

        screenVideo.srcObject = screenStream;
        screenShareVideo.style.display = 'block';

        if (peerConnection && callType === 'video') {
            const track  = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(track);
        } else {
            await startCall('screen');
        }

        screenStream.getVideoTracks()[0].addEventListener('ended', stopScreenShare);
    } catch (err) {
        console.error('startScreenShare:', err);
        showToast('⚠️', 'Screen Share Failed', 'Could not share screen');
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
        screenShareVideo.style.display = 'none';
    }
}

async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    }

    peerConnection.ontrack = (e) => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(e.track);
        updateNoVideoPlaceholder(false);
    };

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('ice_candidate', { to: currentFriend.id, candidate: e.candidate });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const s = peerConnection.connectionState;
        document.getElementById('callStatus').textContent =
            s === 'connected'    ? 'Connected' :
            s === 'connecting'   ? 'Connecting…' :
            s === 'disconnected' ? 'Reconnecting…' : 'Calling…';

        if (s === 'connected') {
            updateNoVideoPlaceholder(callType === 'audio');
        }
        if (s === 'disconnected' || s === 'failed') endCall();
    };
}

function getMediaConstraints(type) {
    if (type === 'audio') return { audio: true, video: false };
    return {
        audio: true,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    };
}

function updateNoVideoPlaceholder(show) {
    const ph = document.getElementById('noVideoPlaceholder');
    if (ph) ph.style.display = show ? 'flex' : 'none';
}

function endCall() {
    if (localStream)  { localStream.getTracks().forEach(t => t.stop());  localStream  = null; }
    if (remoteStream) { remoteStream.getTracks().forEach(t => t.stop()); remoteStream = null; }
    stopScreenShare();

    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (currentFriend)  socket.emit('end_call', { to: currentFriend.id });

    callModal.classList.remove('active');
    incomingCallModal.classList.remove('active');
    callType = null;
}

function toggleMic() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        toggleMicBtn.classList.toggle('muted', !track.enabled);
    }
}

function toggleVideo() {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        toggleVideoBtn.classList.toggle('muted', !track.enabled);
        updateNoVideoPlaceholder(!track.enabled);
    }
}

// ================================================================
//  PREMIUM VISUAL STATES
// ================================================================

// ── Live typing preview ────────────────────────────────────────
let liveTypingTimeout;

function showLiveTyping(text) {
    if (!liveTypingWrapper || !currentFriend) return;
    if (!text.trim()) { hideLiveTyping(); return; }

    liveTypingText.textContent = text;
    liveTypingWrapper.classList.remove('hidden');
    scrollToBottom('smooth');

    clearTimeout(liveTypingTimeout);
    liveTypingTimeout = setTimeout(hideLiveTyping, 1400);
}

function hideLiveTyping() {
    if (liveTypingWrapper) liveTypingWrapper.classList.add('hidden');
    clearTimeout(liveTypingTimeout);
}

// ── Camera state (friend opening camera) ──────────────────────
let cameraStateTimeout;

function showCameraState(username) {
    if (!cameraStateWrapper) return;
    cameraStateText.textContent = `${username} is taking a photo`;
    cameraStateWrapper.classList.remove('hidden');
    scrollToBottom('smooth');

    clearTimeout(cameraStateTimeout);
    cameraStateTimeout = setTimeout(hideCameraState, 4000);
}

function hideCameraState() {
    if (cameraStateWrapper) cameraStateWrapper.classList.add('hidden');
}

// ── Idle avatar (friend is in chat but idle) ───────────────────
function showIdleState() {
    if (idleZone)              idleZone.classList.remove('hidden');
    if (avatarIdleIndicator)   avatarIdleIndicator.classList.remove('hidden');
    friendIsIdle = true;
}

function clearIdleState() {
    if (idleZone)              idleZone.classList.add('hidden');
    if (avatarIdleIndicator)   avatarIdleIndicator.classList.add('hidden');
    friendIsIdle = false;
    clearTimeout(idleTimer);
}

// ── Presence banner (top-centre pill) ─────────────────────────
let presenceTimeout;

function showPresenceBanner(text) {
    if (!presenceBanner) return;
    presenceText.textContent = text;
    presenceBanner.classList.remove('hidden');
    clearTimeout(presenceTimeout);
    presenceTimeout = setTimeout(() => presenceBanner.classList.add('hidden'), 3000);
}

// ── Rich toast notifications ───────────────────────────────────
function showToast(icon, title, body, duration = 4000) {
    const t = document.createElement('div');
    t.className = 'toast';
    const initial = title.charAt(0).toUpperCase();

    t.innerHTML = `
        <div class="toast-avatar">${icon || initial}</div>
        <div class="toast-body">
            <div class="toast-name">${escapeHtml(title)}</div>
            <div class="toast-msg">${escapeHtml(body)}</div>
        </div>
    `;
    toastContainer.appendChild(t);

    setTimeout(() => {
        t.style.transition = 'opacity 0.3s, transform 0.3s';
        t.style.opacity    = '0';
        t.style.transform  = 'translateX(40px)';
        setTimeout(() => t.remove(), 350);
    }, duration);
}

// Legacy showNotification (kept for compatibility)
function showNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/static/icon.png' });
    }
    // Also show premium toast
    showToast(title.charAt(0).toUpperCase(), title, body);
}

// ── Photo viewer ───────────────────────────────────────────────
function openPhotoViewer(src, viewerName) {
    if (!photoViewer) return;

    // Show avatar animation first
    if (pvAvatar) pvAvatar.textContent = viewerName ? viewerName.charAt(0).toUpperCase() : '?';
    photoViewerImg.classList.add('hidden');
    photoViewerImg.src = '';

    photoViewer.classList.remove('hidden');

    // Emit to friend that we are viewing a photo
    if (currentFriend) socket.emit('viewing_photo', { to: currentFriend.id });

    // After avatar anim, show photo
    const img = new Image();
    img.onload = () => {
        setTimeout(() => {
            photoViewerImg.src = src;
            photoViewerImg.classList.remove('hidden');
            document.querySelector('.photo-viewer-avatar-state').style.display = 'none';
        }, 800);
    };
    img.src = src;
}

function closePhotoViewer() {
    if (!photoViewer) return;
    photoViewer.classList.add('hidden');
    photoViewerImg.src = '';
    photoViewerImg.classList.add('hidden');
    const avState = document.querySelector('.photo-viewer-avatar-state');
    if (avState) avState.style.display = 'flex';
    if (currentFriend) socket.emit('closed_photo', { to: currentFriend.id });
}

if (photoClose) photoClose.addEventListener('click', closePhotoViewer);

// ── Notification badge (EXACT same as original) ────────────────
function updateFriendNotification(friendId) {
    const el = document.querySelector(`[data-friend-id="${friendId}"]`);
    if (!el) return;

    let badge = el.querySelector('.msg-badge');
    const msgs = unseenMessages[friendId];

    if (!msgs || !msgs.length) {
        if (badge) badge.remove();
        return;
    }

    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'msg-badge';
        el.appendChild(badge);
    }

    let preview = msgs[msgs.length - 1];
    if (preview.length > 20) preview = preview.substring(0, 20) + '…';

    badge.innerHTML = `
        <div class="badge-count">${msgs.length}</div>
        <div class="badge-preview">${escapeHtml(preview)}</div>
    `;
}

// ================================================================
//  SOCKET LISTENERS (EXACT same events as original + new premium ones)
// ================================================================
function setupSocketListeners() {

    socket.on('connect', () => console.log('SUMITH connected'));

    // ── Receive message ──────────────────────────────────────────
    socket.on('receive_message', (data) => {
        if (currentFriend && data.sender_id === currentFriend.id) {
            hideLiveTyping(); // live preview replaced by real message
            appendMessage(data, true);
        } else {
            if (!unseenMessages[data.sender_id]) unseenMessages[data.sender_id] = [];
            unseenMessages[data.sender_id].push(data.message);
            updateFriendNotification(data.sender_id);
            showNotification(data.sender_name, data.message);
        }
    });

    // ── Message sent confirmation ────────────────────────────────
    socket.on('message_sent', (data) => {
        if (currentFriend && data.receiver_id === currentFriend.id) {
            appendMessage({ sender_id: 0, message: data.message, created_at: data.created_at }, true);
        }
    });

    // ── Typing indicator ─────────────────────────────────────────
    socket.on('typing', (data) => {
        if (!currentFriend || data.from !== currentFriend.id) return;
        if (typingNameEl) typingNameEl.textContent = data.username;
        typingIndicator.classList.add('show');

        clearTimeout(window.typingHideTimeout);
        window.typingHideTimeout = setTimeout(() => {
            typingIndicator.classList.remove('show');
        }, 2200);
    });

    // ── Live typing (realtime text preview) ──────────────────────
    socket.on('live_typing', (data) => {
        if (!currentFriend || data.from != currentFriend.id) return;
        showLiveTyping(data.text);
    });

    // ── Camera opened event ──────────────────────────────────────
    socket.on('camera_opened', (data) => {
        if (currentFriend) showCameraState(data.username);
        showPresenceBanner(`${data.username} opened camera 📸`);
    });

    // ── Viewing chat (idle detection) ────────────────────────────
    // ── Viewing chat heartbeat (fires every 2s while friend is in chat)
    socket.on('viewing_chat', (data) => {
        if (!currentFriend || data.from !== currentFriend.id) return;

        // Friend is actively viewing — clear idle state immediately
        clearIdleState();

        // Reset the idle timer: if heartbeat stops coming for 2.5s → show idle
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (currentFriend && data.from === currentFriend.id) showIdleState();
        }, 2500);   // 2.5s = one missed heartbeat = they left
    });

    // ── Friend left the chat (tab hidden, back button, other friend selected)
    socket.on('stop_viewing_chat', (data) => {
        if (!currentFriend || data.from !== currentFriend.id) return;
        clearTimeout(idleTimer);
        clearIdleState();   // gone = no idle indicator either, just disappears
    });

    // ── Viewing photo ─────────────────────────────────────────────
    socket.on('viewing_photo', (data) => {
        if (!currentFriend || data.from !== currentFriend.id) return;
        const name = currentFriend.username;
        showPresenceBanner(`${name} is viewing a photo 🖼️`);
    });

    // ── Closed photo ─────────────────────────────────────────────
    socket.on('closed_photo', (data) => {
        if (!currentFriend || data.from !== currentFriend.id) return;
        // Resume idle timer
        clearTimeout(idleTimer);
        idleTimer = setTimeout(showIdleState, 8000);
    });

    // ── Incoming call ─────────────────────────────────────────────
    socket.on('incoming_call', (data) => {
        incomingCallData = data;
        document.getElementById('callerName').textContent = data.from_name;
        document.getElementById('callType').textContent   =
            data.call_type === 'audio'  ? '🎙️ Audio Call' :
            data.call_type === 'video'  ? '📹 Video Call' : '🖥️ Screen Share';

        const incAv = document.getElementById('incAvatar');
        if (incAv) incAv.textContent = data.from_name.charAt(0).toUpperCase();

        incomingCallModal.classList.add('active');
    });

    // ── Call answered ─────────────────────────────────────────────
    socket.on('call_answered', async (data) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        document.getElementById('callStatus').textContent = 'Connected';
    });

    // ── ICE candidate ─────────────────────────────────────────────
    socket.on('ice_candidate', async (data) => {
        if (peerConnection) {
            try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); }
            catch (e) { console.warn('ICE error:', e); }
        }
    });

    // ── Call ended/rejected ───────────────────────────────────────
    socket.on('call_ended',    () => endCall());
    socket.on('call_rejected', () => { showToast('📵', 'Call Rejected', 'The call was declined'); endCall(); });

    // ── User connect/disconnect ───────────────────────────────────
    socket.on('user_connected',    () => loadFriends());
    socket.on('user_disconnected', () => loadFriends());
    // Socket listener for deleted messages
    socket.on('message_deleted', (data) => {
    const msgElement = document.querySelector(`.message[data-mid="${data.message_id}"]`);
    if (msgElement) {
        msgElement.style.animation = 'msgDelete 0.2s ease forwards';
        setTimeout(() => msgElement.remove(), 200);
    }
    
    if (data.scope === 'everyone') {
        showToast('✨', 'Message Unsent', 'Message was removed');
    }
});
       // Socket listener for receiving photos
socket.on('receive_photo', (data) => {
    // Create photo message
    const photoHtml = `<img src="${data.photo}" class="chat-photo" onclick="openPhotoViewer('${data.photo}', '${data.sender_name}')" style="max-width: 200px; border-radius: 16px; cursor: pointer;">`;
    
    const message = {
        id: data.message_id,
        sender_id: data.sender_id,
        message: photoHtml,
        created_at: new Date().toISOString(),
        is_photo: true,
        photo_url: data.photo
    };
    
    if (currentFriend && data.sender_id === currentFriend.id) {
        appendMessage(message, true);
    } else {
        if (!unseenMessages[data.sender_id]) unseenMessages[data.sender_id] = [];
        unseenMessages[data.sender_id].push('📸 Photo');
        updateFriendNotification(data.sender_id);
        showNotification(data.sender_name, 'Sent you a photo! 📸');
    }
});

socket.on('reaction_updated', (data) => {
    const msgElement = document.querySelector(`.message[data-mid="${data.message_id}"]`);
    if (msgElement) {
        renderReactionsWithNames(msgElement, data.reactions, data.current_user_id);
    }
});

}

let pendingPhotoFile = null;
let pendingPhotoPreview = null;
// ================================================================
//  EVENT LISTENERS
// ================================================================
function setupEventListeners() {

    // ── Send ──────────────────────────────────────────────────────
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    });

    // ── Typing events (EXACT same as original) ────────────────────
    let typingTimeout;

    messageInput.addEventListener('input', () => {
        if (!currentFriend) return;

        // Live typing preview — emit current text
        socket.emit('live_typing', { to: currentFriend.id, text: messageInput.value });

        // Standard typing indicator
        socket.emit('typing', { to: currentFriend.id });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            typingIndicator.classList.remove('show');
        }, 2000);
    });

    // ── Call buttons ──────────────────────────────────────────────
    audioCallBtn.addEventListener('click',   () => startCall('audio'));
    videoCallBtn.addEventListener('click',   () => startCall('video'));
    screenShareBtn.addEventListener('click', startScreenShare);
    endCallBtn.addEventListener('click',     endCall);
    toggleMicBtn.addEventListener('click',   toggleMic);
    toggleVideoBtn.addEventListener('click', toggleVideo);

    // ── Accept call (EXACT same as original) ──────────────────────
    acceptCallBtn.addEventListener('click', async () => {
        if (!incomingCallData) return;
        try {
            callType = incomingCallData.call_type;
            const constraints = getMediaConstraints(callType);
            localStream = await getMediaWithPermission(constraints, callType);

            localVideo.srcObject = localStream;
            await createPeerConnection();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            socket.emit('answer_call', { to: incomingCallData.from, answer });

            incomingCallModal.classList.remove('active');
            callModal.classList.add('active');
            document.getElementById('callStatus').textContent = 'Connected';
            updateNoVideoPlaceholder(callType === 'audio');

            const friendEl = document.querySelector(`[data-friend-id="${incomingCallData.from}"]`);
            if (friendEl) friendEl.click();
        } catch (err) {
            console.error('acceptCall:', err);
            showToast('⚠️', 'Could not answer', err.message || 'Media access failed');
            if (incomingCallData) {
                socket.emit('reject_call', { to: incomingCallData.from });
                incomingCallModal.classList.remove('active');
                incomingCallData = null;
            }
        }
    });

    // ── Reject call ───────────────────────────────────────────────
    rejectCallBtn.addEventListener('click', () => {
        if (incomingCallData) {
            socket.emit('reject_call', { to: incomingCallData.from });
            incomingCallModal.classList.remove('active');
            incomingCallData = null;
        }
    });

    // ── Logout ────────────────────────────────────────────────────
    logoutBtn.addEventListener('click', () => { window.location.href = '/logout'; });

    // ── Click outside search ──────────────────────────────────────
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    /// ── Photo upload with preview and send button ──────────────────


cameraBtn.addEventListener('click', async () => {
    if (!currentFriend) return;
    
    // Check if we already have permission (cached)
    const hasPersistentPermission = localStorage.getItem('camera_permission_granted') === 'true';
    
    if (!hasPersistentPermission) {
        try {
            await requestPermission(
                '📸',
                'Camera Access',
                'KawaiiChat needs camera access to take and send cute photos! 📸✨'
            );
            localStorage.setItem('camera_permission_granted', 'true');
        } catch {
            return;
        }
    }
    
    socket.emit('camera_opened', { to: currentFriend.id });
    cameraInput.click();
});


    cameraInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.startsWith('image/')) {
        showToast('⚠️', 'Invalid File', 'Please select an image file');
        return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('⚠️', 'File Too Large', 'Maximum size is 10MB');
        return;
    }
    
    pendingPhotoFile = file;
    pendingPhotoPreview = URL.createObjectURL(file);
    
    // Show preview modal with send button
    showPhotoSendModal(pendingPhotoPreview);
});

    // ── Photo viewer close on bg click ────────────────────────────
    document.querySelector('.photo-viewer-bg')?.addEventListener('click', closePhotoViewer);

    // ── Prevent pull-to-refresh (EXACT same as original) ──────────
    document.body.addEventListener('touchmove', (e) => {
        if (
            e.target.closest('.messages-container') ||
            e.target.closest('.friends-list') ||
            e.target.closest('.search-results')
        ) return;
        e.preventDefault();
    }, { passive: false });

    // ── Messages: click on image messages to open viewer ──────────
    messages.addEventListener('click', (e) => {
        const img = e.target.closest('img.chat-img');
        if (img) openPhotoViewer(img.src, currentFriend?.username || '');
    });
}

// ================================================================
//  NOTIFICATION PERMISSION
// ================================================================
async function requestNotificationPermission() {
    if (Notification.permission !== 'granted') {
        await Notification.requestPermission().catch(() => {});
    }
}

// ================================================================
//  PRESENCE — Heartbeat system
//  startViewingHeartbeat() → emit every 2s while chat is open + visible
//  stopViewingHeartbeat()  → emit stop_viewing_chat + clear interval
// ================================================================

let _heartbeatInterval = null;

function startViewingHeartbeat() {
    stopViewingHeartbeat();           // clear old interval first
    if (!currentFriend) return;

    // fire immediately so friend sees it right away
    socket.emit('viewing_chat', { to: currentFriend.id });

    _heartbeatInterval = setInterval(() => {
        if (!currentFriend || document.visibilityState !== 'visible') {
            stopViewingHeartbeat();
            return;
        }
        socket.emit('viewing_chat', { to: currentFriend.id });
    }, 2000);
}

function stopViewingHeartbeat() {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
    if (currentFriend) {
        socket.emit('stop_viewing_chat', { to: currentFriend.id });
    }
}

// Tab visibility (alt+tab / phone home button)
document.addEventListener('visibilitychange', () => {
    if (!currentFriend) return;
    if (document.visibilityState === 'visible') {
        startViewingHeartbeat();
    } else {
        stopViewingHeartbeat();
    }
});

// Window blur/focus (desktop: switching apps)
window.addEventListener('blur',  () => { if (currentFriend) stopViewingHeartbeat(); });
window.addEventListener('focus', () => { if (currentFriend) startViewingHeartbeat(); });

// ================================================================
//  UTILITY
// ================================================================
function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// Legacy function name kept for compatibility
function showPresenceAnime(text) {
    showPresenceBanner(text);
}

//  NEW ULTRA PREMIUM FEATURES
// ================================================================

// ── Message delete/unsend ─────────────────────────────────────
let messageMenuTimeout = null;
let currentMessageId = null;

function showMessageMenu(messageId, messageText, isSent) {
    // Remove existing menu
    const existingMenu = document.querySelector('.message-context-menu');
    if (existingMenu) existingMenu.remove();
    
    // Only sent messages can be unsent/deleted
    if (!isSent) return;
    
    const menu = document.createElement('div');
    menu.className = 'message-context-menu';
    menu.innerHTML = `
        <div class="menu-item delete-msg">
            <span class="material-symbols-outlined">delete</span>
            <span>Delete for me</span>
        </div>
        <div class="menu-item unsend-msg">
            <span class="material-symbols-outlined">undo</span>
            <span>Unsend for everyone</span>
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Position menu near click
    const x = window.event.clientX;
    const y = window.event.clientY;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    // Animation
    setTimeout(() => menu.classList.add('show'), 10);
    
    // Delete for me
    menu.querySelector('.delete-msg').addEventListener('click', () => {
        deleteMessage(messageId, 'me');
        menu.remove();
    });
    
    // Unsend for everyone
    menu.querySelector('.unsend-msg').addEventListener('click', () => {
        unsendMessage(messageId);
        menu.remove();
    });
    
    // Close menu on click outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

function deleteMessage(messageId, scope) {
    socket.emit('delete_message', { 
        message_id: messageId, 
        scope: scope,
        to: currentFriend?.id 
    });
    
    // Remove from UI immediately
    const msgElement = document.querySelector(`.message[data-mid="${messageId}"]`);
    if (msgElement) {
        msgElement.style.animation = 'msgDelete 0.2s ease forwards';
        setTimeout(() => msgElement.remove(), 200);
    }
    
    showToast('🗑️', 'Message Deleted', scope === 'me' ? 'Deleted for you' : 'Unsent for everyone');
}

function unsendMessage(messageId) {
    deleteMessage(messageId, 'everyone');
}

function showPhotoSendModal(previewUrl) {
    // Create modal if doesn't exist
    let modal = document.getElementById('photoSendModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'photoSendModal';
        modal.className = 'photo-send-modal';
        modal.innerHTML = `
            <div class="photo-send-backdrop"></div>
            <div class="photo-send-content kawaii-card">
                <div class="photo-send-header">
                    <h3>📸 Send Photo</h3>
                    <button class="photo-send-close">&times;</button>
                </div>
                <div class="photo-send-preview-container">
                    <img class="photo-send-preview" alt="Preview">
                </div>
                <div class="photo-send-actions">
                    <button class="photo-send-cancel">Cancel</button>
                    <button class="photo-send-confirm">Send Photo ✨</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const img = modal.querySelector('.photo-send-preview');
    img.src = previewUrl;
    
    modal.classList.remove('hidden');
    
    // Close handlers
    const closeBtn = modal.querySelector('.photo-send-close');
    const cancelBtn = modal.querySelector('.photo-send-cancel');
    const confirmBtn = modal.querySelector('.photo-send-confirm');
    const backdrop = modal.querySelector('.photo-send-backdrop');
    
    const closeModal = () => {
        modal.classList.add('hidden');
        URL.revokeObjectURL(pendingPhotoPreview);
        pendingPhotoFile = null;
        pendingPhotoPreview = null;
        cameraInput.value = '';
    };
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    
    confirmBtn.addEventListener('click', async () => {
        if (!pendingPhotoFile || !currentFriend) return;
        
        // Show sending animation
        confirmBtn.innerHTML = '📤 Sending...';
        confirmBtn.disabled = true;
        
        // Send photo via socket
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result;
            
            socket.emit('send_photo', {
                to: currentFriend.id,
                photo: base64,
                filename: pendingPhotoFile.name
            });
            
            // Also send via HTTP for storage
            const formData = new FormData();
            formData.append('photo', pendingPhotoFile);
            formData.append('receiver_id', currentFriend.id);
            
            try {
                const res = await fetch('/api/send_photo', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                
                // Append sent message to UI
                appendMessage({
                    id: data.message_id,
                    sender_id: 0,
                    message: '📸 Photo shared',
                    created_at: new Date().toISOString(),
                    delivered: true
                }, true);
                
                showToast('📸', 'Photo Sent', 'Your photo has been sent! ✨');
            } catch (err) {
                console.error('Send photo error:', err);
                showToast('❌', 'Send Failed', 'Could not send photo');
            }
            
            closeModal();
        };
        reader.readAsDataURL(pendingPhotoFile);
    });
}


// ── Message reactions ──────────────────────────────────────────
function addReaction(messageId, emoji) {
    socket.emit('add_reaction', {
        message_id: messageId,
        emoji: emoji,
        to: currentFriend?.id
    });
}

// Setup reaction listener
function setupReactionListener() {
    if (!messages) return;
    
    messages.addEventListener('dblclick', (e) => {
        const messageDiv = e.target.closest('.message');
        if (!messageDiv) return;
        
        const messageId = messageDiv.dataset.mid;
        showReactionPicker(messageId);
    });
}

// Helper: Create sparkle effect when adding reaction
function createSparkleEffect(x, y) {
    for (let i = 0; i < 8; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle';
        sparkle.style.left = `${x + (Math.random() - 0.5) * 40}px`;
        sparkle.style.top = `${y + (Math.random() - 0.5) * 40}px`;
        document.body.appendChild(sparkle);
        setTimeout(() => sparkle.remove(), 500);
    }
}
// Show reaction picker when double-click
function showReactionPicker(messageId) {
    let picker = document.querySelector('.reaction-picker');
    if (picker) picker.remove();
    
    picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = `
        <div class="reaction-emoji" data-emoji="❤️" title="Love">❤️</div>
        <div class="reaction-emoji" data-emoji="😂" title="Laugh">😂</div>
        <div class="reaction-emoji" data-emoji="😮" title="Wow">😮</div>
        <div class="reaction-emoji" data-emoji="😢" title="Sad">😢</div>
        <div class="reaction-emoji" data-emoji="😡" title="Angry">😡</div>
        <div class="reaction-emoji" data-emoji="👍" title="Like">👍</div>
        <div class="reaction-emoji" data-emoji="✨" title="Sparkle">✨</div>
        <div class="reaction-emoji" data-emoji="🎀" title="Cute">🎀</div>
        <div class="reaction-emoji" data-emoji="🌸" title="Flower">🌸</div>
        <div class="reaction-emoji" data-emoji="💕" title="Heart">💕</div>
    `;
    
    document.body.appendChild(picker);
    
    // Position near mouse
    const x = window.event?.clientX || window.innerWidth / 2;
    const y = window.event?.clientY || window.innerHeight / 2;
    picker.style.left = `${Math.min(x - 150, window.innerWidth - 320)}px`;
    picker.style.top = `${y - 60}px`;
    
    picker.querySelectorAll('.reaction-emoji').forEach(el => {
        el.addEventListener('click', () => {
            addReaction(messageId, el.dataset.emoji);
            picker.remove();
            
            // Add sparkle effect
            createSparkleEffect(window.event?.clientX || x, window.event?.clientY || y);
        });
    });
    
    // Close picker when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target)) picker.remove();
        }, { once: true });
    }, 100);
}


// Render reactions showing WHO reacted
function renderReactionsWithNames(msgElement, reactions, currentUserId) {
    let reactionsDiv = msgElement.querySelector('.message-reactions');
    
    if (!reactions || reactions.length === 0) {
        if (reactionsDiv) reactionsDiv.remove();
        return;
    }
    
    if (!reactionsDiv) {
        reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        msgElement.querySelector('.message-bubble').appendChild(reactionsDiv);
    }
    
    reactionsDiv.innerHTML = '';
    
    // Show each reaction separately with who reacted
    reactions.forEach(reaction => {
        const isCurrentUser = reaction.user_id === currentUserId;
        const displayName = isCurrentUser ? 'You' : reaction.username;
        
        const reactionSpan = document.createElement('span');
        reactionSpan.className = `reaction-item ${isCurrentUser ? 'my-reaction' : 'friend-reaction'}`;
        reactionSpan.setAttribute('data-emoji', reaction.emoji);
        reactionSpan.setAttribute('data-user-id', reaction.user_id);
        
        reactionSpan.innerHTML = `
            <span class="reaction-emoji">${reaction.emoji}</span>
            <span class="reaction-user">${displayName}</span>
        `;
        
        // Click to add/remove/change reaction
        reactionSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            const messageId = msgElement.dataset.mid;
            addReaction(messageId, reaction.emoji);
        });
        
        reactionsDiv.appendChild(reactionSpan);
    });
}


// ── Persistent permissions with localStorage ───────────────────
// Modified permission request with caching
const originalRequestPermission = requestPermission;
window.requestPermission = async function(icon, title, desc) {
    // Check if permission was already granted
    const permissionKey = `perm_${title.toLowerCase().replace(/\s/g, '_')}`;
    if (localStorage.getItem(permissionKey) === 'granted') {
        return true;
    }
    
    return new Promise((resolve, reject) => {
        const overlay = permissionOverlay;
        const iconEl = document.getElementById('permissionIcon');
        const titleEl = document.getElementById('permissionTitle');
        const descEl = document.getElementById('permissionDesc');
        
        iconEl.textContent = icon;
        titleEl.textContent = title;
        descEl.textContent = desc;
        overlay.classList.remove('hidden');
        
        const allowHandler = () => {
            localStorage.setItem(permissionKey, 'granted');
            overlay.classList.add('hidden');
            resolve(true);
            cleanup();
        };
        
        const denyHandler = () => {
            overlay.classList.add('hidden');
            reject(new Error('Permission denied'));
            cleanup();
        };
        
        const cleanup = () => {
            permAllowBtn.removeEventListener('click', allowHandler);
            permDenyBtn.removeEventListener('click', denyHandler);
        };
        
        permAllowBtn.addEventListener('click', allowHandler);
        permDenyBtn.addEventListener('click', denyHandler);
    });
};

// Call this on page load to check permissions
function checkPersistentPermissions() {
    const cameraPerm = localStorage.getItem('perm_camera_access');
    if (cameraPerm === 'granted') {
        console.log('Camera permission previously granted');
    }
}

setupReactionListener();
checkPersistentPermissions();