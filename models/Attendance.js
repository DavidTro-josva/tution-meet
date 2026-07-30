const { getMemoryDB } = require('../config/database');

class Attendance {
    static COLLECTION = 'attendance';

    static getDb() {
        return getMemoryDB().attendance;
    }

    static async findOne(query) {
        const db = this.getDb();
        if (query.roomId) {
            const results = await db.findWhere('roomId', query.roomId);
            return results[0] || null;
        }
        return null;
    }

    static async create(data) {
        const db = this.getDb();
        return await db.create({
            ...data,
            records: data.records || [],
            sessionDate: data.sessionDate || new Date().toISOString(),
            recordingUrl: data.recordingUrl || ''
        });
    }

    static async find(query = {}) {
        const db = this.getDb();
        
        if (query.teacherId) {
            return await db.findWhere('teacherId', query.teacherId);
        }
        
        return await db.findAll();
    }

    static async findById(id) {
        const db = this.getDb();
        return await db.findById(id);
    }

    static async findByIdAndUpdate(id, updateData) {
        const db = this.getDb();
        return await db.update(id, updateData);
    }
}

module.exports = Attendance;
