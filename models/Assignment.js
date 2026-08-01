const { getMemoryDB } = require('../config/database');
const { wrapQuery } = require('./queryHelper');

class Assignment {
    static COLLECTION = 'assignments';

    static getDb() {
        return getMemoryDB().assignments;
    }

    static findOne(query) {
        return wrapQuery((async () => {
            const db = this.getDb();
            if (query._id || query.id) {
                const id = query._id || query.id;
                return await db.findById(id);
            }
            return null;
        })());
    }

    static async create(data) {
        const db = this.getDb();
        return await db.create({
            ...data,
            attachments: data.attachments || [],
            status: data.status || 'published'
        });
    }

    static find(query = {}) {
        return wrapQuery((async () => {
            const db = this.getDb();
            
            if (query.teacherId) {
                return await db.findWhere('teacherId', query.teacherId);
            }
            
            if (query.subjectId) {
                return await db.findWhere('subjectId', query.subjectId);
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

    static async findByIdAndUpdate(id, updateData) {
        const db = this.getDb();
        return await db.update(id, updateData);
    }

    static async findByIdAndDelete(id) {
        const db = this.getDb();
        return await db.delete(id);
    }
}

module.exports = Assignment;
