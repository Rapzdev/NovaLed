import { auth, database, isOwner, canUseEmoji } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    ref, 
    set, 
    get,
    onValue,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Check if user is already logged in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Check if user is banned
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.banned) {
                await signOut(auth);
                showError('Akaun anda telah dibanned oleh admin.');
                return;
            }
        }
        
        const currentPage = window.location.pathname.split('/').pop();
        if (currentPage === 'index.html' || currentPage === 'register.html' || currentPage === '') {
            window.location.href = 'home.html';
        }
    } else {
        const currentPage = window.location.pathname.split('/').pop();
        if (currentPage !== 'index.html' && currentPage !== 'register.html' && currentPage !== '') {
            window.location.href = 'index.html';
        }
    }
});

// Listen for owner popup messages
onAuthStateChanged(auth, (user) => {
    if (user) {
        const popupRef = ref(database, 'ownerPopup');
        onValue(popupRef, (snapshot) => {
            if (snapshot.exists()) {
                const popupData = snapshot.val();
                if (popupData.message && popupData.timestamp) {
                    showOwnerPopup(popupData.message);
                }
            }
        });
    }
});

// Register Form
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('registerUsername').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Validation
        if (password !== confirmPassword) {
            showError('Password tidak sama!');
            return;
        }
        
        if (password.length < 6) {
            showError('Password minimum 6 aksara!');
            return;
        }
        
        // Check if username contains emoji (only owner can)
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
        if (emojiRegex.test(username) && !isOwner(username)) {
            showError('Hanya owner boleh guna emoji dalam username!');
            return;
        }
        
        try {
            // Create user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Save user data to database
            await set(ref(database, `users/${user.uid}`), {
                username: username,
                email: email,
                isOwner: isOwner(username),
                avatar: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzZCN0FBQSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjQwIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPjwvdGV4dD48L3N2Zz4=',
                createdAt: serverTimestamp(),
                banned: false,
                postCount: 0
            });
            
            showSuccess('Pendaftaran berjaya! Mengalihkan ke halaman utama...');
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 1500);
            
        } catch (error) {
            console.error('Error:', error);
            if (error.code === 'auth/email-already-in-use') {
                showError('Email sudah digunakan!');
            } else if (error.code === 'auth/invalid-email') {
                showError('Format email tidak sah!');
            } else {
                showError('Pendaftaran gagal: ' + error.message);
            }
        }
    });
}

// Login Form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        try {
            // Find user by username
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            
            let userEmail = null;
            let userId = null;
            
            if (snapshot.exists()) {
                const users = snapshot.val();
                for (const uid in users) {
                    if (users[uid].username === username) {
                        userEmail = users[uid].email;
                        userId = uid;
                        
                        // Check if banned
                        if (users[uid].banned) {
                            showError('Akaun anda telah dibanned oleh admin.');
                            return;
                        }
                        break;
                    }
                }
            }
            
            if (!userEmail) {
                showError('Username tidak dijumpai!');
                return;
            }
            
            // Sign in with email
            await signInWithEmailAndPassword(auth, userEmail, password);
            window.location.href = 'home.html';
            
        } catch (error) {
            console.error('Error:', error);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                showError('Username atau password salah!');
            } else {
                showError('Login gagal: ' + error.message);
            }
        }
    });
}

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await signOut(auth);
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
}

// Helper functions
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 5000);
    }
}

function showOwnerPopup(message) {
    const popup = document.getElementById('ownerPopup');
    const popupMessage = document.getElementById('popupMessage');
    
    if (popup && popupMessage) {
        popupMessage.textContent = message;
        popup.classList.remove('hidden');
        
        setTimeout(() => {
            popup.classList.add('hidden');
        }, 5000);
    }
}
