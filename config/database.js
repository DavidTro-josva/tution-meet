'use strict';

// In-memory fallback database
const memoryDB = {
    users: new Map(),
    payments: new Map(),
    assignments: new Map(),
    submissions: new Map(),
    attendance: new Map(),
    progress: new Map(),
    messages: new Map(),
    notifications: new Map(),
    subjects: new Map(),
    sessions: new Map()
};

// Helper to convert Firestore-style model to memory DB
function createMemoryDB() {
    const generateId = () => Math.random().toString(36).substr(2, 9);
    
    const db = {};
    
    for (const [collection, map] of Object.entries(memoryDB)) {
        db[collection] = {
            data: new Map(),
            generateId,
            create: async (data) => {
                const id = generateId();
                const doc = { id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                map.set(id, doc);
                return doc;
            },
            findById: async (id) => map.get(id) || null,
            findAll: async () => Array.from(map.values()),
            findWhere: async (field, value) => Array.from(map.values()).filter(d => d[field] === value),
            update: async (id, data) => {
                const existing = map.get(id);
                if (existing) {
                    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
                    map.set(id, updated);
                    return updated;
                }
                return null;
            },
            delete: async (id) => map.delete(id),
            findOne: async (field, value) => {
                for (const doc of map.values()) {
                    if (doc[field] === value) return doc;
                }
                return null;
            }
        };
    }
    
    return db;
}

// Initialize memory DB
const memoryDbInstance = createMemoryDB();

let firestoreDb = null;

async function seedDefaults() {
    const defaultUsers = [
        { name: 'Admin Role', email: 'admin@tutionmeet.com', password: '$2b$10$C1rlrbFnpzakzwAINP9.Surz32R7naosuEs89Nzm.kN7hGVOqZm5m', role: 'admin', isApproved: true },
        { name: 'Teacher Role', email: 'teacher@tutionmeet.com', password: '$2b$10$ddppZkMR2ZUyBu0W0SenTuPLsYGUJ0eXHqEGZEIQ49nhBgXCgDd02', role: 'teacher', isApproved: true },
        { name: 'Student Demo', email: 'student@tutionmeet.com', password: '$2b$10$mfAPK0yf/q8/wBDtsubfrOjdjgSoPpkRByi7tiJRQnv3ChetNfF9C', role: 'student', isApproved: true },
    ];

    for (const userData of defaultUsers) {
        try {
            const existing = await memoryDbInstance.users.findOne('email', userData.email);
            if (!existing) {
                await memoryDbInstance.users.create(userData);
                console.log(`🔑 ${userData.role.toUpperCase()} seeded → email: ${userData.email}`);
            }
        } catch (err) {
            console.error(`Error seeding ${userData.role}:`, err.message);
        }
    }
}

async function connectDB() {
    const { initializeFirebase } = require('./firebaseServer');
    const { db } = initializeFirebase();
    firestoreDb = db;

    if (firestoreDb) {
        console.log('✅ Connected to Firebase Firestore');
    } else {
        console.log('⚠️ Using in-memory database (set FIREBASE_SERVICE_ACCOUNT for Firestore)');
    }
    
    await seedDefaults();
    return firestoreDb;
}

function getMemoryDB() {
    return memoryDbInstance;
}

// Export both - code should check which one to use
module.exports = { connectDB, getDb: () => firestoreDb, getMemoryDB };
