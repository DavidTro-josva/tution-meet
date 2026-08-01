'use strict';
const admin = require('firebase-admin');

let db = null;
let auth = null;

function initializeFirebase() {
    if (db && auth) {
        return { db, auth };
    }

    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    
    if (!projectId) {
        console.warn('⚠️ Firebase: Project ID not configured');
        return { db: null, auth: null };
    }

    // Check if service account is provided
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    let serviceAccount = null;
    
    if (serviceAccountStr && serviceAccountStr.length > 10 && serviceAccountStr.startsWith('{')) {
        try {
            serviceAccount = JSON.parse(serviceAccountStr);
            console.log('🔥 Firebase: Service account found in config');
        } catch (e) {
            console.warn('⚠️ Firebase: Could not parse FIREBASE_SERVICE_ACCOUNT');
        }
    }

    if (!serviceAccount || !serviceAccount.private_key) {
        console.log('⚠️ Firebase: No service account configured, using fast in-memory DB');
        return { db: null, auth: null };
    }

    if (!admin.apps.length) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('🔥 Firebase Admin: Initialized with service account');
        } catch (error) {
            console.warn('⚠️ Firebase Admin initialization issue:', error.message);
            return { db: null, auth: null };
        }
    }

    try {
        db = admin.firestore();
        auth = admin.auth();
        
        try {
            db.settings({
                ignoreUndefinedProperties: true
            });
        } catch (e) {
            // Settings already applied or cannot be changed
        }
        
        console.log('✅ Firebase Firestore: Connected');
    } catch (error) {
        console.warn('⚠️ Firebase Firestore: Not connected -', error.message);
    }
    
    return { db, auth };
}

const { db: firestore, auth: firebaseAuth } = (() => {
    try {
        return initializeFirebase();
    } catch (e) {
        console.warn('⚠️ Firebase init skipped:', e.message);
        return { db: null, auth: null };
    }
})();

module.exports = { db: firestore, auth: firebaseAuth, initializeFirebase };
