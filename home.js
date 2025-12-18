import { auth, database, isOwner, getUsernameWithEmoji } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    ref, 
    push, 
    set,
    get,
    onValue,
    serverTimestamp,
    query,
    orderByChild,
    update
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentUser = null;
let currentUserData = null;

// Check authentication
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            currentUserData = snapshot.val();
            
            // Check if banned
            if (currentUserData.banned) {
                await auth.signOut();
                window.location.href = 'index.html';
                return;
            }
            
            loadFeed();
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

// Create Post Form
const createPostForm = document.getElementById('createPostForm');
const mediaInput = document.getElementById('mediaInput');
const uploadProgress = document.getElementById('uploadProgress');

createPostForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser || !currentUserData) return;
    
    const caption = document.getElementById('postCaption').value.trim();
    const postType = document.querySelector('input[name="postType"]:checked').value;
    const mediaFile = mediaInput.files[0];
    
    if (!mediaFile) {
        showStatus('Sila pilih gambar atau video!', 'error');
        return;
    }
    
    // Validate file type
    if (postType === 'image' && !mediaFile.type.startsWith('image/')) {
        showStatus('Sila pilih file gambar!', 'error');
        return;
    }
    
    if (postType === 'video' && !mediaFile.type.startsWith('video/')) {
        showStatus('Sila pilih file video!', 'error');
        return;
    }
    
    // Check file size (max 10MB)
    if (mediaFile.size > 10 * 1024 * 1024) {
        showStatus('Saiz fail terlalu besar! Maximum 10MB', 'error');
        return;
    }
    
    uploadProgress.classList.remove('hidden');
    uploadProgress.textContent = 'Sedang memuat naik...';
    
    try {
        // Convert file to base64
        const base64Data = await fileToBase64(mediaFile);
        
        // Create post
        const postsRef = ref(database, 'posts');
        const newPostRef = push(postsRef);
        
        await set(newPostRef, {
            userId: currentUser.uid,
            username: currentUserData.username,
            avatar: currentUserData.avatar,
            caption: caption,
            type: postType,
            mediaUrl: base64Data,
            timestamp: serverTimestamp(),
            likes: 0,
            comments: 0
        });
        
        // Update user post count
        const userRef = ref(database, `users/${currentUser.uid}`);
        await update(userRef, {
            postCount: (currentUserData.postCount || 0) + 1
        });
        
        uploadProgress.textContent = 'Post berjaya disiarkan!';
        uploadProgress.style.color = '#4CAF50';
        
        // Reset form
        createPostForm.reset();
        
        setTimeout(() => {
            uploadProgress.classList.add('hidden');
            uploadProgress.style.color = '';
        }, 2000);
        
    } catch (error) {
        console.error('Error creating post:', error);
        uploadProgress.textContent = 'Gagal memuat naik. Cuba lagi.';
        uploadProgress.style.color = '#f44336';
    }
});

// Load Feed
function loadFeed() {
    const feedContainer = document.getElementById('feedContainer');
    const postsRef = ref(database, 'posts');
    
    onValue(postsRef, (snapshot) => {
        feedContainer.innerHTML = '';
        
        if (!snapshot.exists()) {
            feedContainer.innerHTML = '<p class="no-posts">Tiada post lagi. Jadilah yang pertama!</p>';
            return;
        }
        
        const posts = [];
        snapshot.forEach((childSnapshot) => {
            posts.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });
        
        // Sort by timestamp (newest first)
        posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        posts.forEach(post => {
            const postElement = createPostElement(post);
            feedContainer.appendChild(postElement);
        });
    });
}

// Create Post Element
function createPostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post-card';
    
    const displayUsername = getUsernameWithEmoji(post.username);
    const timestamp = post.timestamp ? new Date(post.timestamp).toLocaleDateString('ms-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : 'Baru sahaja';
    
    postDiv.innerHTML = `
        <div class="post-header">
            <img src="${post.avatar}" alt="${post.username}" class="post-avatar">
            <div class="post-user-info">
                <h4>${displayUsername}</h4>
                <span class="post-time">${timestamp}</span>
            </div>
        </div>
        
        <div class="post-caption">
            ${post.caption || ''}
        </div>
        
        <div class="post-media">
            ${post.type === 'video' 
                ? `<video controls><source src="${post.mediaUrl}" type="video/mp4"></video>`
                : `<img src="${post.mediaUrl}" alt="Post">`
            }
        </div>
        
        <div class="post-actions">
            <button class="post-action-btn">
                <span>❤️</span>
                <span>${post.likes || 0}</span>
            </button>
            <button class="post-action-btn">
                <span>💬</span>
                <span>${post.comments || 0}</span>
            </button>
            <button class="post-action-btn">
                <span>🔗</span>
                <span>Share</span>
            </button>
        </div>
    `;
    
    return postDiv;
}

// File to Base64 converter
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
    document.body.appendChild(statusDiv);
    
    setTimeout(() => {
        statusDiv.remove();
    }, 3000);
}

// Show owner popup
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

// Logout button
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await auth.signOut();
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
}
