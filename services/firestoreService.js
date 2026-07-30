'use strict';
const { db } = require('../config/firebaseServer');

const COLLECTIONS = {
    USERS: 'users',
    PAYMENTS: 'payments',
    ASSIGNMENTS: 'assignments',
    SUBMISSIONS: 'submissions',
    ATTENDANCE: 'attendance',
    PROGRESS: 'progress',
    MESSAGES: 'messages',
    NOTIFICATIONS: 'notifications',
    SUBJECTS: 'subjects',
    SESSIONS: 'sessions'
};

async function getDoc(collection, docId) {
    if (!db) throw new Error('Firestore not initialized');
    const doc = await db.collection(collection).doc(docId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getDocs(collection, queryFn = null) {
    if (!db) throw new Error('Firestore not initialized');
    let ref = db.collection(collection);
    if (queryFn) {
        ref = queryFn(ref);
    }
    const snapshot = await ref.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function createDoc(collection, data) {
    if (!db) throw new Error('Firestore not initialized');
    const docRef = db.collection(collection).doc();
    const dataWithTimestamps = {
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(dataWithTimestamps);
    return { id: docRef.id, ...dataWithTimestamps };
}

async function updateDoc(collection, docId, data) {
    if (!db) throw new Error('Firestore not initialized');
    const dataWithTimestamp = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection(collection).doc(docId).update(dataWithTimestamp);
    return await getDoc(collection, docId);
}

async function deleteDoc(collection, docId) {
    if (!db) throw new Error('Firestore not initialized');
    await db.collection(collection).doc(docId).delete();
    return true;
}

async function queryWhere(collection, field, operator, value) {
    if (!db) throw new Error('Firestore not initialized');
    const snapshot = await db.collection(collection).where(field, operator, value).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function findOne(collection, queryFn) {
    if (!db) throw new Error('Firestore not initialized');
    let ref = db.collection(collection);
    ref = queryFn(ref);
    const doc = await ref.limit(1).get();
    return doc.empty ? null : { id: doc.docs[0].id, ...doc.docs[0].data() };
}

module.exports = {
    COLLECTIONS,
    getDoc,
    getDocs,
    createDoc,
    updateDoc,
    deleteDoc,
    queryWhere,
    findOne,
    db
};
