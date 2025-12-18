import { auth, database, getUsernameWithEmoji } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    ref, 
    get,
    onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentUser = null;
let currentUserData = null;
let allUsers = [];

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
            
            loadAdminData();
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

// Load Admin Data
async function loadAdminData() {
    await loadStatistics();
    await loadUsers();
}

// Load Statistics
async function loadStatistics() {
    // Total Users
    const usersRef = ref(database, 'users');
    const usersSnapshot = await get(usersRef);
    
    let totalUsers = 0;
    let bannedUsers = 0;
    
    if (usersSnapshot.exists()) {
        const users = usersSnapshot.val();
        totalUsers = Object.keys(users).length;
        
        Object.values(users).forEach(user => {
            if (user.banned) bannedUsers++;
        });
    }
    
    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('bannedUsers').textContent = bannedUsers;
    
    // Total Posts
    const postsRef = ref(database, 'posts');
    const postsSnapshot = await get(postsRef);
    
    let totalPosts = 0;
    if (postsSnapshot.exists()) {
        totalPosts = Object.keys(postsSnapshot.val()).length;
    }
    
    document.getElementById('totalPosts').textContent = totalPosts;
    
    // Active Lives
    const livesRef = ref(database, 'lives');
    const livesSnapshot = await get(livesRef);
    
    let activeLives = 0;
    if (livesSnapshot.exists()) {
        const lives = livesSnapshot.val();
        Object.values(lives).forEach(live => {
            if (live.isLive) activeLives++;
        });
    }
    
    document.getElementById('activeLives').textContent = activeLives;
}

// Load Users
async function loadUsers() {
    const usersRef = ref(database, 'users');
    
    onValue(usersRef, (snapshot) => {
        allUsers = [];
        
        if (snapshot.exists()) {
            const users = snapshot.val();
            
            Object.keys(users).forEach(uid => {
                allUsers.push({
                    uid: uid,
                    ...users[uid]
                });
            });
            
            // Sort by creation date
            allUsers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            displayUsers(allUsers);
        }
    });
}

// Display Users in Table
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Tiada user dijumpai</td></tr>';
        return;
    }
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        
        const createdDate = user.createdAt 
            ? new Date(user.createdAt).toLocaleDateString('ms-MY', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            })
            : 'N/A';
        
        const statusBadge = user.banned 
            ? '<span class="badge badge-banned">Banned</span>'
            : '<span class="badge badge-active">Active</span>';
        
        const roleBadge = user.isOwner
            ? '<span class="badge badge-owner">🪬 Owner</span>'
            : '<span class="badge badge-user">User</span>';
        
        tr.innerHTML = `
            <td><img src="${user.avatar}" alt="${user.username}" class="table-avatar"></td>
            <td>${getUsernameWithEmoji(user.username)}</td>
            <td>${user.email}</td>
            <td>${roleBadge}</td>
            <td>${createdDate}</td>
            <td>${statusBadge}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Search Users
const searchInput = document.getElementById('searchUsers');
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    if (searchTerm === '') {
        displayUsers(allUsers);
        return;
    }
    
    const filteredUsers = allUsers.filter(user => 
        user.username.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm)
    );
    
    displayUsers(filteredUsers);
});

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
