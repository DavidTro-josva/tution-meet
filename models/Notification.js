const { getMemoryDB } = require('../config/database');
const { wrapQuery } = require('./queryHelper');

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

    static find(query = {}) {
        return wrapQuery((async () => {
            const db = this.getDb();
            let results;
            if (query.userId) {
                results = await db.findWhere('userId', query.userId);
            } else {
                results = await db.findAll();
            }
            return results;
        })());
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
