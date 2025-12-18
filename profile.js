import { auth, database, isOwner, getUsernameWithEmoji, canUseEmoji } from './firebase-config.js';
import { onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    ref, 
    get,
    update,
    onValue,
    set,
    serverTimestamp,
    query,
    orderByChild,
    equalTo
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentUser = null;
let currentUserData = null;

// Check authentication
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserProfile();
        loadUserPosts();
        
        // Show owner menu if owner
        if (currentUserData && currentUserData.isOwner) {
            document.getElementById('ownerMenu').classList.remove('hidden');
        }
    } else {
        window.location.href = 'index.html';
    }
});

// Listen for owner popup messages
const popupRef = ref(database, 'ownerPopup');
onValue(popupRef, (snapshot) => {
    if (snapshot.exists()) {
        const popupData = snapshot.val();
        if (popupData.message && popupData.timestamp) {
            showOwnerPopup(popupData.message);
        }
    }
});

// Load User Profile
async function loadUserProfile() {
    const userRef = ref(database, `users/${currentUser.uid}`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
        currentUserData = snapshot.val();
        
        // Check if banned
        if (currentUserData.banned) {
            await auth.signOut();
            window.location.href = 'index.html';
            return;
        }
        
        // Update UI
        document.getElementById('profileAvatar').src = currentUserData.avatar;
        document.getElementById('profileUsername').textContent = getUsernameWithEmoji(currentUserData.username);
        document.getElementById('profileEmail').textContent = currentUserData.email;
        document.getElementById('postCount').textContent = currentUserData.postCount || 0;
    }
}

// Load User Posts
function loadUserPosts() {
    const postsRef = ref(database, 'posts');
    
    onValue(postsRef, (snapshot) => {
        const container = document.getElementById('userPostsContainer');
        container.innerHTML = '';
        
        if (!snapshot.exists()) {
            container.innerHTML = '<p class="no-posts">Anda belum ada post lagi.</p>';
            return;
        }
        
        const userPosts = [];
        snapshot.forEach((childSnapshot) => {
            const post = childSnapshot.val();
            if (post.userId === currentUser.uid) {
                userPosts.push({
                    id: childSnapshot.key,
                    ...post
                });
            }
        });
        
        if (userPosts.length === 0) {
            container.innerHTML = '<p class="no-posts">Anda belum ada post lagi.</p>';
            return;
        }
        
        // Sort by timestamp
        userPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        userPosts.forEach(post => {
            const postDiv = document.createElement('div');
            postDiv.className = 'user-post-item';
            
            postDiv.innerHTML = `
                ${post.type === 'video' 
                    ? `<video src="${post.mediaUrl}"></video>`
                    : `<img src="${post.mediaUrl}" alt="Post">`
                }
                <div class="post-overlay">
                    <span>❤️ ${post.likes || 0}</span>
                    <span>💬 ${post.comments || 0}</span>
                </div>
            `;
            
            container.appendChild(postDiv);
        });
    });
}

// Change Avatar
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const avatarInput = document.getElementById('avatarInput');

changeAvatarBtn.addEventListener('click', () => {
    avatarInput.click();
});

avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showStatus('Sila pilih file gambar!', 'error');
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        showStatus('Saiz gambar terlalu besar! Maximum 2MB', 'error');
        return;
    }
    
    try {
        const base64Data = await fileToBase64(file);
        
        const userRef = ref(database, `users/${currentUser.uid}`);
        await update(userRef, {
            avatar: base64Data
        });
        
        document.getElementById('profileAvatar').src = base64Data;
        showStatus('Gambar profil berjaya dikemaskini!', 'success');
        
    } catch (error) {
        console.error('Error updating avatar:', error);
        showStatus('Gagal mengemaskini gambar profil', 'error');
    }
});

// Change Username
const changeUsernameForm = document.getElementById('changeUsernameForm');
changeUsernameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newUsername = document.getElementById('newUsername').value.trim();
    
    if (!newUsername) {
        showStatus('Sila masukkan username baru!', 'error');
        return;
    }
    
    // Check if username contains emoji (only owner can)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
    if (emojiRegex.test(newUsername) && !canUseEmoji(newUsername)) {
        showStatus('Hanya owner boleh guna emoji dalam username!', 'error');
        return;
    }
    
    try {
        const userRef = ref(database, `users/${currentUser.uid}`);
        await update(userRef, {
            username: newUsername,
            isOwner: isOwner(newUsername)
        });
        
        document.getElementById('profileUsername').textContent = getUsernameWithEmoji(newUsername);
        document.getElementById('newUsername').value = '';
        showStatus('Username berjaya dikemaskini!', 'success');
        
        // Reload if owner status changed
        setTimeout(() => {
            location.reload();
        }, 1500);
        
    } catch (error) {
        console.error('Error updating username:', error);
        showStatus('Gagal mengemaskini username', 'error');
    }
});

// Change Password
const changePasswordForm = document.getElementById('changePasswordForm');
changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword !== confirmNewPassword) {
        showStatus('Password baru tidak sama!', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showStatus('Password minimum 6 aksara!', 'error');
        return;
    }
    
    try {
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(
            currentUser.email,
            currentPassword
        );
        await reauthenticateWithCredential(currentUser, credential);
        
        // Update password
        await updatePassword(currentUser, newPassword);
        
        changePasswordForm.reset();
        showStatus('Password berjaya dikemaskini!', 'success');
        
    } catch (error) {
        console.error('Error updating password:', error);
        if (error.code === 'auth/wrong-password') {
            showStatus('Password sekarang salah!', 'error');
        } else {
            showStatus('Gagal mengemaskini password', 'error');
        }
    }
});

// Send Popup to All Users (Owner Only)
const sendPopupBtn = document.getElementById('sendPopupBtn');
const popupModal = document.getElementById('popupModal');
const sendPopupConfirm = document.getElementById('sendPopupConfirm');
const cancelPopup = document.getElementById('cancelPopup');

if (sendPopupBtn) {
    sendPopupBtn.addEventListener('click', () => {
        popupModal.classList.remove('hidden');
    });
}

if (cancelPopup) {
    cancelPopup.addEventListener('click', () => {
        popupModal.classList.add('hidden');
        document.getElementById('popupMessageInput').value = '';
    });
}

if (sendPopupConfirm) {
    sendPopupConfirm.addEventListener('click', async () => {
        const message = document.getElementById('popupMessageInput').value.trim();
        
        if (!message) {
            showStatus('Sila masukkan mesej!', 'error');
            return;
        }
        
        try {
            const popupRef = ref(database, 'ownerPopup');
            await set(popupRef, {
                message: message,
                timestamp: serverTimestamp(),
                sendBy: currentUserData.username
            });
            
            popupModal.classList.add('hidden');
            document.getElementById('popupMessageInput').value = '';
            showStatus('Popup berjaya dihantar ke semua user!', 'success');
            
        } catch (error) {
            console.error('Error sending popup:', error);
            showStatus('Gagal menghantar popup', 'error');
        }
    });
}

// Helper functions
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
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

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await auth.signOut();
        window.location.href = 'index.html';
    });
}
