const bcrypt = require('bcryptjs');
const { getMemoryDB } = require('../config/database');

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

    static async findOne(query) {
        const db = this.getDb();
        let doc = null;
        if (query.email) {
            doc = await db.findOne('email', query.email.toLowerCase());
        } else if (query._id || query.id) {
            const id = query._id || query.id;
            doc = await db.findById(id);
        }
        return this._wrap(doc);
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

    static async findById(id) {
        const db = this.getDb();
        const doc = await db.findById(id);
        return this._wrap(doc);
    }

    static async findByIdAndUpdate(id, updateData) {
        const db = this.getDb();
        return await db.update(id, updateData);
    }

    static async find() {
        const db = this.getDb();
        return await db.findAll();
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
