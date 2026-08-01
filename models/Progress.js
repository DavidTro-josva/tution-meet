const { getMemoryDB } = require('../config/database');
const { wrapQuery } = require('./queryHelper');

class Progress {
    static COLLECTION = 'progress';

    static getDb() {
        return getMemoryDB().progress;
    }

    static async create(data) {
        const db = this.getDb();
        return await db.create({
            ...data,
            watched: data.watched || true,
            watchTimeSeconds: data.watchTimeSeconds || 0,
            completedAt: new Date().toISOString()
        });
    }

    static find(query = {}) {
        return wrapQuery((async () => {
            const db = this.getDb();
            if (query.studentId) {
                return await db.findWhere('studentId', query.studentId);
            }
            return await db.findAll();
        })());
    }

    static findById(id) {
        return wrapQuery((async () => {
            const db = this.getDb();
            return await db.findById(id);
        })());
    }

    static findOne(query) {
        return wrapQuery((async () => {
            const db = this.getDb();
            if (query.studentId && query.lessonId) {
                const results = await db.findWhere('studentId', query.studentId);
                return results.find(p => p.lessonId === query.lessonId) || null;
            }
            return null;
        })());
    }
}

module.exports = Progress;
