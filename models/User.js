const bcrypt = require('bcryptjs');
const { getMemoryDB } = require('../config/database');
const { wrapQuery } = require('./queryHelper');

class User {
    static COLLECTION = 'users';

    static getDb() {
        const { getMemoryDB } = require('../config/database');
        return getMemoryDB().users;
    }

    static _wrap(doc) {
        if (!doc) return null;
        doc.comparePassword = async function(candidatePassword) {
            return await bcrypt.compare(candidatePassword, this.password);
        };
        return doc;
    }

    static findOne(query) {
        return wrapQuery((async () => {
            const db = this.getDb();
            let doc = null;
            if (query.email) {
                doc = await db.findOne('email', query.email.toLowerCase());
            } else if (query._id || query.id) {
                const id = query._id || query.id;
                doc = await db.findById(id);
            }
            return this._wrap(doc);
        })());
    }

    static async create(userData) {
        const db = this.getDb();
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        
        const doc = await db.create({
            ...userData,
            email: userData.email.toLowerCase(),
            password: hashedPassword,
            role: userData.role || 'student',
            isApproved: true,
            trialStartDate: new Date().toISOString(),
            subscriptionEndDate: null,
            avatar: '',
            resetOtp: null,
            resetOtpExpiry: null,
            otpRequestCount: 0,
            otpResetWindow: null,
            lastActive: null
        });
        return this._wrap(doc);
    }

    static findById(id) {
        return wrapQuery((async () => {
            const db = this.getDb();
            const doc = await db.findById(id);
            return this._wrap(doc);
        })());
    }

    static async findByIdAndUpdate(id, updateData) {
        const db = this.getDb();
        return await db.update(id, updateData);
    }

    static find(query = {}) {
        return wrapQuery((async () => {
            const db = this.getDb();
            let users = await db.findAll();
            if (query && typeof query === 'object') {
                if (query._id && query._id.$in) {
                    const ids = query._id.$in.map(String);
                    users = users.filter(u => ids.includes(String(u.id || u._id)));
                } else if (query.id && query.id.$in) {
                    const ids = query.id.$in.map(String);
                    users = users.filter(u => ids.includes(String(u.id || u._id)));
                }
                if (query._id && query._id.$ne) {
                    users = users.filter(u => String(u.id || u._id) !== String(query._id.$ne));
                }
                if (query.role) {
                    if (query.role.$ne) {
                        users = users.filter(u => u.role !== query.role.$ne);
                    } else if (typeof query.role === 'string') {
                        users = users.filter(u => u.role === query.role);
                    }
                }
                if (query.email) {
                    users = users.filter(u => u.email === query.email);
                }
                if (query.name && query.name.$regex) {
                    const regex = new RegExp(query.name.$regex, query.name.$options || 'i');
                    users = users.filter(u => regex.test(u.name || ''));
                }
            }
            return users.map(u => this._wrap(u));
        })());
    }

    static async findByIdAndDelete(id) {
        const db = this.getDb();
        return await db.delete(id);
    }

    // Instance method to compare password
    async comparePassword(candidatePassword) {
        return await bcrypt.compare(candidatePassword, this.password);
    }
}

module.exports = User;
