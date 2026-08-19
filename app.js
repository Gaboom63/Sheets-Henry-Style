// --- PASTE YOUR FIREBASE CONFIG HERE ---
const firebaseConfig = {
    apiKey: "AIzaSyApDZJFHjW7yaUOovdZqDOzTMKXP_MKMkg",
    authDomain: "sheets-replacement-6967c.firebaseapp.com",
    projectId: "sheets-replacement-6967c",
    storageBucket: "sheets-replacement-6967c.firebasestorage.app",
    messagingSenderId: "1081077842701",
    appId: "1:1081077842701:web:5c5b50d55e82bdb8976644"
};
// ---------------------------------------

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentRoomCode = null;
let unsubscribeChat = null;
let unsubscribeTyping = null;
let unsubscribeRoomMeta = null;
let typingTimeout = null;
let timerInterval = null;
let unreadCount = 0;
let isTabFocused = true;
let autoCapitalize = true;
let hasJoined = false;

window.addEventListener('focus', () => {
    isTabFocused = true;
    unreadCount = 0;
    document.title = "Private Chat";
});

window.addEventListener('blur', () => {
    isTabFocused = false;
});

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const authContainer = document.getElementById('auth-container');
    const nameContainer = document.getElementById('name-container');
    const roomContainer = document.getElementById('room-container');
    const appContainer = document.getElementById('app-container');
    const settingsModal = document.getElementById('settings-modal');
    const typingIndicator = document.getElementById('typing-indicator');

    // Load Saved Settings
    const loadSetting = (key, defaultVal) => localStorage.getItem(key) || defaultVal;
    
    document.documentElement.style.setProperty('--accent', loadSetting('appColor', '#ff6b6b'));
    document.documentElement.style.setProperty('--font-family', loadSetting('appFont', 'system-ui, sans-serif'));
    document.documentElement.style.setProperty('--msg-size', loadSetting('msgSize', '16') + 'px');
    document.documentElement.style.setProperty('--msg-weight', loadSetting('msgBold', 'false') === 'true' ? 'bold' : 'normal');
    document.documentElement.style.setProperty('--msg-style', loadSetting('msgItalic', 'false') === 'true' ? 'italic' : 'normal');
    autoCapitalize = loadSetting('appCap', 'true') === 'true';

    // Set UI toggles to match loaded state
    document.getElementById('setting-color').value = loadSetting('appColor', '#ff6b6b');
    document.getElementById('setting-font').value = loadSetting('appFont', 'system-ui, sans-serif');
    document.getElementById('setting-size').value = loadSetting('msgSize', '16');
    document.getElementById('size-label').textContent = loadSetting('msgSize', '16') + 'px';
    document.getElementById('setting-bold').checked = loadSetting('msgBold', 'false') === 'true';
    document.getElementById('setting-italic').checked = loadSetting('msgItalic', 'false') === 'true';
    document.getElementById('setting-capitalize').checked = autoCapitalize;
    document.getElementById('setting-imgbb-key').value = loadSetting('imgbbKey', '');

    document.getElementById('setting-size').addEventListener('input', (e) => {
        document.getElementById('size-label').textContent = e.target.value + 'px';
    });

    // Auth & Room Flow
    document.getElementById('login-btn').addEventListener('click', () => {
        auth.signInWithEmailAndPassword(document.getElementById('email').value, document.getElementById('password').value)
            .catch(err => alert("Login Error: " + err.message));
    });

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            authContainer.classList.add('hidden');
            !currentUser.displayName ? nameContainer.classList.remove('hidden') : roomContainer.classList.remove('hidden');
        } else {
            authContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    });

    document.getElementById('save-name-btn').addEventListener('click', () => {
        const chosenName = document.getElementById('display-name-input').value.trim();
        if (chosenName) currentUser.updateProfile({ displayName: chosenName }).then(() => {
            nameContainer.classList.add('hidden');
            roomContainer.classList.remove('hidden');
        });
    });

    document.getElementById('join-room-btn').addEventListener('click', () => {
        const enteredRoom = document.getElementById('room-input').value.trim();
        if (enteredRoom) {
            currentRoomCode = enteredRoom;
            roomContainer.classList.add('hidden');
            startApp();
        }
    });

    function startApp() {
        appContainer.classList.remove('hidden');
        document.getElementById('room-title').textContent = `Room: ${currentRoomCode}`;
        updateClock();
        initChat();
        initTypingListener();
        initRoomManager();
        trackPresence();
    }

    // --- Media & Camera Logic ---
    document.getElementById('upload-btn').addEventListener('click', () => document.getElementById('image-upload').click());

    document.getElementById('image-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await uploadToImgBBAndSend(file);
    });

    const cameraModal = document.getElementById('camera-modal');
    const cameraFeed = document.getElementById('camera-feed');
    let videoStream = null;

    document.getElementById('camera-btn').addEventListener('click', async () => {
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraFeed.srcObject = videoStream;
            cameraModal.classList.remove('hidden');
        } catch (err) {
            alert("Camera access denied or not found!");
        }
    });

    document.getElementById('close-camera-btn').addEventListener('click', () => {
        if (videoStream) videoStream.getTracks().forEach(track => track.stop());
        cameraModal.classList.add('hidden');
    });

    document.getElementById('snap-btn').addEventListener('click', () => {
        const canvas = document.getElementById('camera-canvas');
        canvas.width = cameraFeed.videoWidth;
        canvas.height = cameraFeed.videoHeight;
        canvas.getContext('2d').drawImage(cameraFeed, 0, 0);
        
        canvas.toBlob(async (blob) => {
            const confirmSend = confirm("Look good? Click OK to send this photo.");
            if (confirmSend) {
                if (videoStream) videoStream.getTracks().forEach(track => track.stop());
                cameraModal.classList.add('hidden');
                await uploadToImgBBAndSend(blob);
            }
        }, 'image/jpeg', 0.8);
    });

    async function uploadToImgBBAndSend(fileOrBlob) {
        const imgbbKey = localStorage.getItem('imgbbKey');
        if (!imgbbKey) {
            alert("Please paste your free ImgBB API key into the Settings menu to send photos!");
            return;
        }

        document.getElementById('msg-input').placeholder = "Uploading image...";
        const formData = new FormData();
        formData.append("image", fileOrBlob);

        try {
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (data.success) {
                await db.collection('messages').add({
                    text: "",
                    imageUrl: data.data.url,
                    senderEmail: currentUser.email,
                    senderName: currentUser.displayName,
                    roomCode: currentRoomCode,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                alert("Image upload failed. Double-check your API key in Settings.");
            }
        } catch (error) {
            console.error("Upload error:", error);
            alert("Failed to upload image.");
        } finally {
            document.getElementById('msg-input').placeholder = "Type a message...";
        }
    }

    // --- Message Rendering & Chat Sync ---
    function renderMessage(data, stream) {
        const msgDiv = document.createElement('div');
        
        if (data.isSystem) {
            msgDiv.className = 'message system-msg';
            msgDiv.style.cssText = 'text-align: center; width: 100%; opacity: 0.6; font-size: 0.85rem; padding: 10px;';
            msgDiv.textContent = data.text;
            stream.appendChild(msgDiv);
            return;
        }

        const isMe = data.senderEmail === currentUser.email;
        msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
        
        const nameSpan = document.createElement('div');
        nameSpan.className = 'msg-sender';
        const senderDisplay = data.senderName || (data.senderEmail ? data.senderEmail.split('@')[0] : 'Unknown');
        nameSpan.textContent = senderDisplay;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (data.text) {
            // Escape HTML to prevent injection
            const escapeHTML = (str) => str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
            let safeText = escapeHTML(data.text);
            
            // Swap text emojis for Google Noto Animated WebP Emojis
            const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
            safeText = safeText.replace(emojiRegex, (match) => {
                let hexCode = Array.from(match)
                    .map(char => char.codePointAt(0).toString(16))
                    .filter(hex => hex !== 'fe0f') // Strip invisible variation selectors
                    .join('_');
                return `<img src="https://fonts.gstatic.com/s/e/notoemoji/latest/${hexCode}/512.webp" class="animated-emoji" alt="${match}" onerror="this.onerror=null; this.outerHTML='${match}'">`;
            });

            contentDiv.innerHTML = safeText;
        }

        if (data.imageUrl) {
            const img = document.createElement('img');
            img.src = data.imageUrl;
            contentDiv.appendChild(img);
        }

        if (!isMe) msgDiv.appendChild(nameSpan);
        msgDiv.appendChild(contentDiv);
        stream.appendChild(msgDiv);
    }

    function initChat() {
        if (unsubscribeChat) unsubscribeChat();
        const stream = document.getElementById('chat-messages');
        
        unsubscribeChat = db.collection('messages')
            .where('roomCode', '==', currentRoomCode)
            .orderBy('timestamp', 'asc')
            .limitToLast(20)
            .onSnapshot((snapshot) => {
                if (snapshot.metadata.hasPendingWrites) return;
                
                stream.innerHTML = '';
                snapshot.forEach(doc => {
                    renderMessage(doc.data(), stream);
                });
                
                setTimeout(() => {
                    stream.scrollTop = stream.scrollHeight;
                }, 100);
            });
    }
    
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    function sendMessage() {
        const input = document.getElementById('msg-input');
        let text = input.value.trim();
        
        if (!text) return;
        if (autoCapitalize && text.length > 0) {
            text = text.charAt(0).toUpperCase() + text.slice(1);
        }

        db.collection('messages').add({
            text: text,
            senderEmail: currentUser.email,
            senderName: currentUser.displayName,
            roomCode: currentRoomCode,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => {
            console.error("Firebase Error: ", err);
            alert("Failed to send: " + err.message);
        });

        input.value = '';
        isTyping = false;
        db.collection('rooms').doc(currentRoomCode).set({ typingUser: null, typingEmail: null }, { merge: true });
    }

    // --- Typing Logic ---
    let isTyping = false;
    document.getElementById('msg-input').addEventListener('input', () => {
        if (!currentRoomCode) return;
        
        if (!isTyping) {
            isTyping = true;
            db.collection('rooms').doc(currentRoomCode).set({ typingUser: currentUser.displayName, typingEmail: currentUser.email }, { merge: true });
        }
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            db.collection('rooms').doc(currentRoomCode).set({ typingUser: null, typingEmail: null }, { merge: true });
        }, 2000);
    });

    function initTypingListener() {
        if (unsubscribeTyping) unsubscribeTyping();
        
        unsubscribeTyping = db.collection('rooms').doc(currentRoomCode).onSnapshot(doc => {
            const data = doc.data();
            if (data && data.typingUser && data.typingEmail !== currentUser.email) {
                document.getElementById('typing-name').textContent = data.typingUser;
                typingIndicator.classList.remove('hidden');
            } else {
                typingIndicator.classList.add('hidden');
            }
        });
    }

    // --- Room Manager ---
    function initRoomManager() {
        if (unsubscribeRoomMeta) unsubscribeRoomMeta();
        
        unsubscribeRoomMeta = db.collection('rooms').doc(currentRoomCode).onSnapshot(async (doc) => {
            let data = doc.data();
            
            if (!data || !data.clearsAt) {
                await db.collection('rooms').doc(currentRoomCode).set({ clearsAt: Date.now() + 86400000, clearRequests: [] }, { merge: true });
                return;
            }

            if ((data.clearRequests && data.clearRequests.length >= 2) || (Date.now() >= data.clearsAt)) {
                await wipeChat();
                await db.collection('rooms').doc(currentRoomCode).set({ clearsAt: Date.now() + 86400000, clearRequests: [] }, { merge: true });
            }

            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                const hoursLeft = Math.max(0, Math.ceil((data.clearsAt - Date.now()) / (1000 * 60 * 60)));
                document.getElementById('countdown-timer').textContent = `  Clearing in ${hoursLeft} Hours`;
            }, 60000);
            
            const initHours = Math.max(0, Math.ceil((data.clearsAt - Date.now()) / (1000 * 60 * 60)));
            document.getElementById('countdown-timer').textContent = `  Clearing in ${initHours} Hours`;
        });
    }

    async function wipeChat() {
        const snapshot = await db.collection('messages').where('roomCode', '==', currentRoomCode).get();
        const batch = db.batch();
        snapshot.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }

    document.getElementById('req-clear-btn').addEventListener('click', async () => {
        alert("Clear request sent! The chat will wipe as soon as the other person also clicks Clear.");
        await db.collection('rooms').doc(currentRoomCode).update({
            clearRequests: firebase.firestore.FieldValue.arrayUnion(currentUser.email)
        });
    });

    // --- Settings Menu Saves ---
    document.getElementById('settings-btn').addEventListener('click', () => {
        document.getElementById('setting-name').value = currentUser.displayName || '';
        settingsModal.classList.remove('hidden');
    });
    
    document.getElementById('close-settings-btn').addEventListener('click', () => settingsModal.classList.add('hidden'));
    
    document.getElementById('save-settings-btn').addEventListener('click', () => {
        const newName = document.getElementById('setting-name').value.trim();
        if (newName && newName !== currentUser.displayName) currentUser.updateProfile({ displayName: newName });
        
        const saveToLocalAndApply = (key, val, cssVar) => {
            localStorage.setItem(key, val);
            if (cssVar) document.documentElement.style.setProperty(cssVar, val);
        };

        saveToLocalAndApply('appColor', document.getElementById('setting-color').value, '--accent');
        saveToLocalAndApply('appFont', document.getElementById('setting-font').value, '--font-family');
        saveToLocalAndApply('msgSize', document.getElementById('setting-size').value, '--msg-size');
        
        const isBold = document.getElementById('setting-bold').checked;
        const isItalic = document.getElementById('setting-italic').checked;
        saveToLocalAndApply('msgBold', isBold, null);
        saveToLocalAndApply('msgItalic', isItalic, null);
        
        document.documentElement.style.setProperty('--msg-weight', isBold ? 'bold' : 'normal');
        document.documentElement.style.setProperty('--msg-style', isItalic ? 'italic' : 'normal');
        
        autoCapitalize = document.getElementById('setting-capitalize').checked;
        localStorage.setItem('appCap', autoCapitalize);
        localStorage.setItem('imgbbKey', document.getElementById('setting-imgbb-key').value.trim());
        
        settingsModal.classList.add('hidden');
    });

    document.getElementById('video-call-btn').addEventListener('click', () => {
        window.open(`https://meet.jit.si/${currentRoomCode}-private-video`, '_blank');
    });

    function updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('room-time').textContent = timeString;
    }
    setInterval(updateClock, 10000);

    // Toggle Emoji Picker
    const picker = document.getElementById('emoji-picker');
    document.getElementById('emoji-btn').addEventListener('click', () => picker.classList.toggle('hidden'));
    
    picker.addEventListener('emoji-click', event => {
        const input = document.getElementById('msg-input');
        input.value += event.detail.unicode;
        picker.classList.add('hidden');
    });

    // --- Presence System ---
    function trackPresence() {
        if (!sessionStorage.getItem('hasJoinedSession')) {
            sessionStorage.setItem('hasJoinedSession', 'true');
            db.collection('messages').add({
                text: `${currentUser.displayName} Joined The Chat! Welcome ${currentUser.displayName}!`,
                isSystem: true,
                roomCode: currentRoomCode,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        window.addEventListener('beforeunload', () => {
            sessionStorage.removeItem('hasJoinedSession');
            db.collection('messages').add({
                text: `${currentUser.displayName} left the chat. Goodbye ${currentUser.displayName} :(`,
                isSystem: true,
                roomCode: currentRoomCode,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }
});