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
let typingTimeout = null;

// Ensure DOM is fully loaded before attaching listeners
document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements
    const authContainer = document.getElementById('auth-container');
    const nameContainer = document.getElementById('name-container');
    const roomContainer = document.getElementById('room-container');
    const appContainer = document.getElementById('app-container');
    const settingsModal = document.getElementById('settings-modal');
    const typingIndicator = document.getElementById('typing-indicator');

    // --- 1. Boot up & Auth ---
    document.getElementById('login-btn').addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        auth.signInWithEmailAndPassword(email, password).catch(err => alert("Login Error: " + err.message));
    });

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            authContainer.classList.add('hidden');
            
            if (!currentUser.displayName) {
                nameContainer.classList.remove('hidden');
            } else {
                promptForRoom();
            }
        } else {
            authContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    });

    document.getElementById('save-name-btn').addEventListener('click', () => {
        const chosenName = document.getElementById('display-name-input').value.trim();
        if (chosenName) {
            currentUser.updateProfile({ displayName: chosenName }).then(() => {
                nameContainer.classList.add('hidden');
                promptForRoom();
            });
        }
    });

    function promptForRoom() {
        roomContainer.classList.remove('hidden');
    }

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
        initChat();
        initTypingListener();
    }

    // --- 2. Chat Logic ---
    function initChat() {
        if (unsubscribeChat) unsubscribeChat();
        
        unsubscribeChat = db.collection('messages')
            .where('roomCode', '==', currentRoomCode)
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                const stream = document.getElementById('chat-messages');
                stream.innerHTML = '';
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const msgDiv = document.createElement('div');
                    const isMe = data.senderEmail === currentUser.email;
                    
                    msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
                    
                    const nameSpan = document.createElement('div');
                    nameSpan.className = 'msg-sender';
                    nameSpan.textContent = data.senderName || data.senderEmail.split('@')[0];
                    
                    const textSpan = document.createElement('div');
                    textSpan.textContent = data.text;

                    if (!isMe) msgDiv.appendChild(nameSpan);
                    msgDiv.appendChild(textSpan);
                    stream.appendChild(msgDiv);
                });
                stream.scrollTop = stream.scrollHeight;
            }, error => {
                console.error("Chat sync error: ", error);
            });
    }

    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    function sendMessage() {
        const input = document.getElementById('msg-input');
        const text = input.value.trim();
        if (!text) return;

        db.collection('messages').add({
            text: text,
            senderEmail: currentUser.email,
            senderName: currentUser.displayName,
            roomCode: currentRoomCode,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        db.collection('rooms').doc(currentRoomCode).set({ typingUser: null, typingEmail: null }, { merge: true });
        input.value = '';
    }

    // --- 3. Typing Indicator Logic ---
    document.getElementById('msg-input').addEventListener('input', () => {
        if (!currentRoomCode) return;
        
        db.collection('rooms').doc(currentRoomCode).set({ 
            typingUser: currentUser.displayName || currentUser.email,
            typingEmail: currentUser.email
        }, { merge: true });

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            db.collection('rooms').doc(currentRoomCode).set({ typingUser: null, typingEmail: null }, { merge: true });
        }, 2000);
    });

    function initTypingListener() {
        if (unsubscribeTyping) unsubscribeTyping();
        db.collection('rooms').doc(currentRoomCode).set({ typingUser: null, typingEmail: null }, { merge: true });

        unsubscribeTyping = db.collection('rooms').doc(currentRoomCode).onSnapshot(doc => {
            const data = doc.data();
            if (data && data.typingUser) {
                // Modified so you can see it working even on your own account!
                if (data.typingEmail === currentUser.email) {
                    typingIndicator.textContent = "(You are typing...)";
                    typingIndicator.style.opacity = "0.5";
                } else {
                    typingIndicator.textContent = `${data.typingUser} is typing...`;
                    typingIndicator.style.opacity = "1";
                }
                typingIndicator.classList.remove('hidden');
            } else {
                typingIndicator.classList.add('hidden');
            }
        }, error => {
            console.error("Typing indicator error: ", error);
        });
    }

    // --- 4. Settings Menu Logic ---
    document.getElementById('settings-btn').addEventListener('click', () => {
        console.log("Settings button clicked!"); // Debugging log
        document.getElementById('setting-name').value = currentUser.displayName || '';
        document.getElementById('setting-room').value = currentRoomCode;
        settingsModal.classList.remove('hidden');
    });

    document.getElementById('close-settings-btn').addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    document.getElementById('save-settings-btn').addEventListener('click', () => {
        const newName = document.getElementById('setting-name').value.trim();
        if (newName && newName !== currentUser.displayName) {
            currentUser.updateProfile({ displayName: newName });
        }

        const newColor = document.getElementById('setting-color').value;
        document.documentElement.style.setProperty('--accent', newColor);

        const newRoom = document.getElementById('setting-room').value.trim();
        if (newRoom && newRoom !== currentRoomCode) {
            currentRoomCode = newRoom;
            document.getElementById('room-title').textContent = `Room: ${currentRoomCode}`;
            initChat();
            initTypingListener();
        }

        settingsModal.classList.add('hidden');
    });

}); // End of DOMContentLoaded