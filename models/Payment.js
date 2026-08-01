const { getMemoryDB } = require('../config/database');
const { wrapQuery } = require('./queryHelper');

class Payment {
    static COLLECTION = 'payments';

    static getDb() {
        return getMemoryDB().payments;
    }

    static findOne(query) {
        return wrapQuery((async () => {
            const db = this.getDb();
            
            if (query.userId) {
                const results = await db.findWhere('userId', query.userId);
                return results[0] || null;
            }
            
            if (query._id || query.id) {
                const id = query._id || query.id;
                return await db.findById(id);
            }
            
            return null;
        })());
    }

    static async create(paymentData) {
        const db = this.getDb();
        return await db.create(paymentData);
    }

    static find(query = {}) {
        return wrapQuery((async () => {
            const db = this.getDb();
            
            if (query.userId) {
                return await db.findWhere('userId', query.userId);
            }
            
            if (query.status) {
                return await db.findWhere('status', query.status);
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

    static async count(query = {}) {
        const results = await this.find(query);
        return results.length;
    }
}

module.exports = Payment;
