import { auth, database, getUsernameWithEmoji } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    ref, 
    get,
    update,
    onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentUser = null;
let currentUserData = null;
let allUsers = [];
let currentFilter = 'all';
let selectedUser = null;

// Check authentication and owner status
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            currentUserData = snapshot.val();
            
            // Check if owner
            if (!currentUserData.isOwner) {
                window.location.href = 'home.html';
                return;
            }
            
            if (currentUserData.banned) {
                await auth.signOut();
                window.location.href = 'index.html';
                return;
            }
            
            loadUsers();
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

// Load Users
function loadUsers() {
    const usersRef = ref(database, 'users');
    
    onValue(usersRef, (snapshot) => {
        allUsers = [];
        
        if (snapshot.exists()) {
            const users = snapshot.val();
            
            Object.keys(users).forEach(uid => {
                if (uid !== currentUser.uid) { // Don't show current user
                    allUsers.push({
                        uid: uid,
                        ...users[uid]
                    });
                }
            });
            
            // Sort by username
            allUsers.sort((a, b) => a.username.localeCompare(b.username));
            
            displayUsers();
        }
    });
}

// Display Users
function displayUsers() {
    const container = document.getElementById('banUsersContainer');
    container.innerHTML = '';
    
    let filteredUsers = allUsers;
    
    // Apply filter
    if (currentFilter === 'banned') {
        filteredUsers = allUsers.filter(user => user.banned);
    } else if (currentFilter === 'active') {
        filteredUsers = allUsers.filter(user => !user.banned);
    }
    
    // Apply search
    const searchTerm = document.getElementById('searchBanUsers').value.toLowerCase().trim();
    if (searchTerm) {
        filteredUsers = filteredUsers.filter(user => 
            user.username.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredUsers.length === 0) {
        container.innerHTML = '<p class="no-users">Tiada user dijumpai</p>';
        return;
    }
    
    filteredUsers.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'ban-user-card';
        
        const statusClass = user.banned ? 'banned' : 'active';
        const actionBtn = user.banned 
            ? `<button class="btn-unban" data-uid="${user.uid}">Unban</button>`
            : `<button class="btn-ban" data-uid="${user.uid}">Ban User</button>`;
        
        const roleBadge = user.isOwner
            ? '<span class="badge badge-owner">🪬 Owner</span>'
            : '';
        
        userCard.innerHTML = `
            <img src="${user.avatar}" alt="${user.username}" class="ban-user-avatar">
            <div class="ban-user-info">
                <h4>${getUsernameWithEmoji(user.username)} ${roleBadge}</h4>
                <p>${user.email}</p>
                <span class="user-status ${statusClass}">
                    ${user.banned ? '🚫 Banned' : '✅ Active'}
                </span>
            </div>
            <div class="ban-user-actions">
                ${user.isOwner ? '<p class="owner-note">Owner tidak boleh dibanned</p>' : actionBtn}
            </div>
        `;
        
        container.appendChild(userCard);
    });
    
    // Add event listeners to ban/unban buttons
    document.querySelectorAll('.btn-ban').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uid = e.target.dataset.uid;
            const user = allUsers.find(u => u.uid === uid);
            openBanModal(user, 'ban');
        });
    });
    
    document.querySelectorAll('.btn-unban').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uid = e.target.dataset.uid;
            const user = allUsers.find(u => u.uid === uid);
            openBanModal(user, 'unban');
        });
    });
}

// Filter Tabs
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        currentFilter = e.target.dataset.filter;
        displayUsers();
    });
});

// Search
const searchInput = document.getElementById('searchBanUsers');
searchInput.addEventListener('input', () => {
    displayUsers();
});

// Open Ban Modal
function openBanModal(user, action) {
    selectedUser = user;
    
    const modal = document.getElementById('banModal');
    const title = document.getElementById('banModalTitle');
    const message = document.getElementById('banModalMessage');
    const confirmBtn = document.getElementById('confirmBanBtn');
    
    if (action === 'ban') {
        title.textContent = 'Ban User?';
        message.textContent = `Adakah anda pasti mahu ban ${user.username}? User ini tidak akan dapat login.`;
        confirmBtn.textContent = 'Ya, Ban';
        confirmBtn.className = 'btn-danger';
        confirmBtn.onclick = () => banUser(user.uid);
    } else {
        title.textContent = 'Unban User?';
        message.textContent = `Adakah anda pasti mahu unban ${user.username}? User ini boleh login semula.`;
        confirmBtn.textContent = 'Ya, Unban';
        confirmBtn.className = 'btn-primary';
        confirmBtn.onclick = () => unbanUser(user.uid);
    }
    
    modal.classList.remove('hidden');
}

// Close Modal
const cancelBanBtn = document.getElementById('cancelBanBtn');
cancelBanBtn.addEventListener('click', () => {
    document.getElementById('banModal').classList.add('hidden');
    selectedUser = null;
});

// Ban User
async function banUser(uid) {
    try {
        const userRef = ref(database, `users/${uid}`);
        await update(userRef, {
            banned: true
        });
        
        document.getElementById('banModal').classList.add('hidden');
        showStatus('User berjaya dibanned', 'success');
        selectedUser = null;
        
    } catch (error) {
        console.error('Error banning user:', error);
        showStatus('Gagal ban user', 'error');
    }
}

// Unban User
async function unbanUser(uid) {
    try {
        const userRef = ref(database, `users/${uid}`);
        await update(userRef, {
            banned: false
        });
        
        document.getElementById('banModal').classList.add('hidden');
        showStatus('User berjaya diunban', 'success');
        selectedUser = null;
        
    } catch (error) {
        console.error('Error unbanning user:', error);
        showStatus('Gagal unban user', 'error');
    }
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
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

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await auth.signOut();
        window.location.href = 'index.html';
    });
}
