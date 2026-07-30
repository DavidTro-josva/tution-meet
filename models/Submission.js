const { getMemoryDB } = require('../config/database');

class Submission {
    static COLLECTION = 'submissions';

    static getDb() {
        return getMemoryDB().submissions;
    }

    static async create(data) {
        const db = this.getDb();
        return await db.create({
            ...data,
            attachments: data.attachments || [],
            grade: data.grade || null,
            submittedAt: new Date().toISOString()
        });
    }

    static async find(query = {}) {
        const db = this.getDb();
        
        if (query.assignmentId) {
            return await db.findWhere('assignmentId', query.assignmentId);
        }
        
        if (query.studentId) {
            return await db.findWhere('studentId', query.studentId);
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

module.exports = Submission;
