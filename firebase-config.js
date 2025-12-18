// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDbV5HqTM0NRBaUbV2sVC7rzk-Gxk9Ua8s",
    authDomain: "novaled-8a25b.firebaseapp.com",
    projectId: "novaled-8a25b",
    storageBucket: "novaled-8a25b.firebasestorage.app",
    messagingSenderId: "388507009182",
    appId: "1:388507009182:web:2ef38dbf0518260305fb8f",
    measurementId: "G-FTRZ7Q2SXM",
    databaseURL: "https://novaled-8a25b-default-rtdb.firebaseio.com"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// Helper Functions
function isOwner(username) {
    return username.toLowerCase().includes('dev');
}

function getUsernameWithEmoji(username) {
    return isOwner(username) ? `🪬 ${username}` : username;
}

function canUseEmoji(username) {
    return isOwner(username);
}

// Export
export { app, auth, database, isOwner, getUsernameWithEmoji, canUseEmoji };
