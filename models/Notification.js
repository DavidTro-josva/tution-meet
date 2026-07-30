const { getMemoryDB } = require('../config/database');

class Notification {
    static COLLECTION = 'notifications';

    static getDb() {
        return getMemoryDB().notifications;
    }

    static async create(data) {
        const db = this.getDb();
        return await db.create({
            ...data,
            read: false,
            link: data.link || ''
        });
    }

    static async find(query = {}) {
        const db = this.getDb();
        
        if (query.userId) {
            return await db.findWhere('userId', query.userId);
        }
        
        return await db.findAll();
    }

    static async countDocuments(query = {}) {
        const notifications = await this.find(query);
        return notifications.length;
    }

    static async findByIdAndUpdate(id, updateData) {
        const db = this.getDb();
        return await db.update(id, updateData);
    }
}

module.exports = Notification;
