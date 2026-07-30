const { getMemoryDB } = require('../config/database');

class Subject {
    static COLLECTION = 'subjects';

    static getDb() {
        return getMemoryDB().subjects;
    }

    static async create(data) {
        const db = this.getDb();
        return await db.create({
            ...data,
            enrolledStudents: data.enrolledStudents || [],
            syllabus: data.syllabus || [],
            status: data.status || 'active',
            coverImage: data.coverImage || ''
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

module.exports = Subject;
