const { getMemoryDB } = require('../config/database');

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

    static async find(query = {}) {
        const db = this.getDb();
        let messages = await db.findAll();
        
        if (query.senderId && query.receiverId) {
            messages = messages.filter(m => 
                (m.senderId === query.senderId && m.receiverId === query.receiverId) ||
                (m.senderId === query.receiverId && m.receiverId === query.senderId)
            );
        }
        
        if (query.receiverId && query.read !== undefined) {
            messages = messages.filter(m => m.receiverId === query.receiverId && m.read === query.read);
        }
        
        return messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
