import { auth, database, isOwner } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    ref, 
    set,
    get,
    remove,
    onValue,
    serverTimestamp,
    update
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentUser = null;
let currentUserData = null;
let liveStream = null;
let liveTimer = null;
let cooldownTimer = null;
let timeRemaining = 600; // 10 minutes in seconds
let cooldownRemaining = 600; // 10 minutes cooldown

// Check authentication
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            currentUserData = snapshot.val();
            
            if (currentUserData.banned) {
                await auth.signOut();
                window.location.href = 'index.html';
                return;
            }
            
            checkLiveStatus();
            loadActiveStreams();
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

// Check Live Status
async function checkLiveStatus() {
    const liveRef = ref(database, `lives/${currentUser.uid}`);
    const snapshot = await get(liveRef);
    
    if (snapshot.exists()) {
        const liveData = snapshot.val();
        if (liveData.isLive) {
            startLiveUI(liveData);
        }
    }
    
    // Check cooldown
    const cooldownRef = ref(database, `cooldowns/${currentUser.uid}`);
    const cooldownSnapshot = await get(cooldownRef);
    
    if (cooldownSnapshot.exists()) {
        const cooldownData = cooldownSnapshot.val();
        const cooldownEnd = cooldownData.endTime;
        const now = Date.now();
        
        if (cooldownEnd > now) {
            startCooldown(Math.floor((cooldownEnd - now) / 1000));
        }
    }
}

// Start Live
const startLiveBtn = document.getElementById('startLiveBtn');
startLiveBtn.addEventListener('click', async () => {
    if (!currentUser || !currentUserData) return;
    
    // Check if in cooldown (skip for owner)
    if (!currentUserData.isOwner) {
        const cooldownRef = ref(database, `cooldowns/${currentUser.uid}`);
        const cooldownSnapshot = await get(cooldownRef);
        
        if (cooldownSnapshot.exists()) {
            const cooldownData = cooldownSnapshot.val();
            if (cooldownData.endTime > Date.now()) {
                showStatus('Anda masih dalam cooldown! Tunggu sebentar.', 'error');
                return;
            }
        }
    }
    
    try {
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        liveStream = stream;
        
        // Create live session
        const liveRef = ref(database, `lives/${currentUser.uid}`);
        await set(liveRef, {
            userId: currentUser.uid,
            username: currentUserData.username,
            avatar: currentUserData.avatar,
            isLive: true,
            startTime: serverTimestamp(),
            viewers: 0
        });
        
        startLiveUI({ isLive: true });
        
        // Start timer (only for non-owner)
        if (!currentUserData.isOwner) {
            timeRemaining = 600; // Reset to 10 minutes
            startTimer();
        }
        
    } catch (error) {
        console.error('Error starting live:', error);
        showStatus('Gagal memulakan live. Pastikan kamera dibenarkan.', 'error');
    }
});

// Stop Live
const stopLiveBtn = document.getElementById('stopLiveBtn');
stopLiveBtn.addEventListener('click', async () => {
    await stopLive();
});

async function stopLive() {
    if (liveStream) {
        liveStream.getTracks().forEach(track => track.stop());
        liveStream = null;
    }
    
    if (liveTimer) {
        clearInterval(liveTimer);
        liveTimer = null;
    }
    
    // Remove live session
    const liveRef = ref(database, `lives/${currentUser.uid}`);
    await remove(liveRef);
    
    // Start cooldown (only for non-owner)
    if (!currentUserData.isOwner) {
        const cooldownRef = ref(database, `cooldowns/${currentUser.uid}`);
        await set(cooldownRef, {
            endTime: Date.now() + (600 * 1000) // 10 minutes
        });
        
        startCooldown(600);
    }
    
    stopLiveUI();
    showStatus('Live telah dihentikan', 'success');
}

// Start Live UI
function startLiveUI(liveData) {
    document.getElementById('streamStatus').textContent = 'Online';
    document.getElementById('streamStatus').style.color = '#4CAF50';
    
    startLiveBtn.classList.add('hidden');
    stopLiveBtn.classList.remove('hidden');
    
    const livePreview = document.getElementById('livePreview');
    livePreview.classList.remove('hidden');
    
    if (liveStream) {
        const video = document.getElementById('liveVideo');
        video.srcObject = liveStream;
    }
    
    if (!currentUserData.isOwner) {
        document.getElementById('timeRemaining').classList.remove('hidden');
    }
}

// Stop Live UI
function stopLiveUI() {
    document.getElementById('streamStatus').textContent = 'Offline';
    document.getElementById('streamStatus').style.color = '#999';
    
    startLiveBtn.classList.remove('hidden');
    stopLiveBtn.classList.add('hidden');
    
    document.getElementById('livePreview').classList.add('hidden');
    document.getElementById('timeRemaining').classList.add('hidden');
}

// Start Timer
function startTimer() {
    liveTimer = setInterval(() => {
        timeRemaining--;
        
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        document.getElementById('timeLeft').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeRemaining <= 0) {
            clearInterval(liveTimer);
            stopLive();
            showStatus('Live telah tamat (10 minit)', 'info');
        }
    }, 1000);
}

// Start Cooldown
function startCooldown(seconds) {
    cooldownRemaining = seconds;
    
    document.getElementById('cooldownTimer').classList.remove('hidden');
    startLiveBtn.disabled = true;
    startLiveBtn.style.opacity = '0.5';
    
    cooldownTimer = setInterval(() => {
        cooldownRemaining--;
        
        const minutes = Math.floor(cooldownRemaining / 60);
        const secs = cooldownRemaining % 60;
        document.getElementById('cooldownLeft').textContent = 
            `${minutes}:${secs.toString().padStart(2, '0')}`;
        
        if (cooldownRemaining <= 0) {
            clearInterval(cooldownTimer);
            document.getElementById('cooldownTimer').classList.add('hidden');
            startLiveBtn.disabled = false;
            startLiveBtn.style.opacity = '1';
            
            // Remove cooldown from database
            const cooldownRef = ref(database, `cooldowns/${currentUser.uid}`);
            remove(cooldownRef);
        }
    }, 1000);
}

// Load Active Streams
function loadActiveStreams() {
    const livesRef = ref(database, 'lives');
    
    onValue(livesRef, (snapshot) => {
        const container = document.getElementById('activeStreamsContainer');
        container.innerHTML = '';
        
        if (!snapshot.exists()) {
            container.innerHTML = '<p class="no-streams">Tiada live stream aktif sekarang</p>';
            return;
        }
        
        const streams = [];
        snapshot.forEach((childSnapshot) => {
            const stream = childSnapshot.val();
            if (stream.userId !== currentUser.uid && stream.isLive) {
                streams.push({
                    id: childSnapshot.key,
                    ...stream
                });
            }
        });
        
        if (streams.length === 0) {
            container.innerHTML = '<p class="no-streams">Tiada live stream aktif sekarang</p>';
            return;
        }
        
        streams.forEach(stream => {
            const streamDiv = document.createElement('div');
            streamDiv.className = 'stream-card';
            
            streamDiv.innerHTML = `
                <img src="${stream.avatar}" alt="${stream.username}">
                <div class="stream-info">
                    <h4>${stream.username}</h4>
                    <span class="live-badge">🔴 LIVE</span>
                    <span>👁️ ${stream.viewers || 0}</span>
                </div>
            `;
            
            container.appendChild(streamDiv);
        });
    });
}

// Helper functions
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
        if (liveStream) {
            await stopLive();
        }
        await auth.signOut();
        window.location.href = 'index.html';
    });
}
