const { getMemoryDB } = require('../config/database');
const { wrapQuery } = require('./queryHelper');

class Message {
    static COLLECTION = 'messages';

    static getDb() {
        return getMemoryDB().messages;
    }

    static async create(data) {
        const db = this.getDb();
        return await db.create({
            ...data,
            type: data.type || 'text',
            read: false
        });
    }

    static find(query = {}) {
        return wrapQuery((async () => {
            const db = this.getDb();
            let messages = await db.findAll();
            
            if (query.$or && Array.isArray(query.$or)) {
                messages = messages.filter(m => {
                    return query.$or.some(cond => {
                        let match = true;
                        if (cond.senderId && String(m.senderId) !== String(cond.senderId)) match = false;
                        if (cond.receiverId && String(m.receiverId) !== String(cond.receiverId)) match = false;
                        return match;
                    });
                });
            } else if (query.senderId && query.receiverId) {
                messages = messages.filter(m => 
                    (String(m.senderId) === String(query.senderId) && String(m.receiverId) === String(query.receiverId)) ||
                    (String(m.senderId) === String(query.receiverId) && String(m.receiverId) === String(query.senderId))
                );
            }
            
            if (query.receiverId && query.read !== undefined) {
                messages = messages.filter(m => String(m.receiverId) === String(query.receiverId) && m.read === query.read);
            }
            
            return messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        })());
    }

    static findOne(query = {}) {
        return wrapQuery((async () => {
            const messages = await this.find(query);
            return messages[0] || null;
        })());
    }

    static async updateMany(filter = {}, updateData = {}) {
        const messages = await this.find(filter);
        const db = this.getDb();
        for (const msg of messages) {
            await db.update(msg.id || msg._id, updateData);
        }
        return { modifiedCount: messages.length };
    }

    static async distinct(field, query = {}) {
        const messages = await this.find(query);
        return [...new Set(messages.map(m => m[field]).filter(Boolean))];
    }

    static async countDocuments(query = {}) {
        const messages = await this.find(query);
        return messages.length;
    }

    static async findByIdAndUpdate(id, updateData) {
        const db = this.getDb();
        return await db.update(id, updateData);
    }
}

module.exports = Message;
