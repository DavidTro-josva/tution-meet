const User = require('../../models/User');
const Payment = require('../../models/Payment');

// GET /api/admin/users?role=student
exports.getUsers = async (req, res) => {
    try {
        let users = await User.find();
        if (req.query.role) {
            users = users.filter(u => u.role === req.query.role);
        }
        const safeUsers = users.map(u => {
            const { password, resetOtp, resetOtpExpiry, ...safe } = u;
            return safe;
        });
        res.json(safeUsers);
    } catch (err) {
        console.error('getUsers error:', err);
        res.status(500).json({ message: 'Server error fetching users' });
    }
};

// POST /api/admin/payments/approve
exports.approvePayment = async (req, res) => {
    try {
        const { userId, amount, daysAdded, notes } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const payment = await Payment.create({
            userId,
            amount: Number(amount) || 0,
            daysAdded: Number(daysAdded) || 0,
            status: 'approved',
            notes: notes || '',
            approvedBy: req.user?.id || 'admin'
        });

        const now = new Date();
        let currentEnd = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : now;
        if (currentEnd < now) currentEnd = now;
        currentEnd.setDate(currentEnd.getDate() + (Number(daysAdded) || 0));

        const updatedUser = await User.findByIdAndUpdate(userId, {
            subscriptionEndDate: currentEnd.toISOString()
        });

        res.json({ message: 'Payment approved and subscription extended', user: updatedUser, payment });
    } catch (err) {
        console.error('approvePayment error:', err);
        res.status(500).json({ message: 'Server error processing payment' });
    }
};

// GET /api/admin/payments
exports.getPayments = async (req, res) => {
    try {
        const payments = await Payment.find();
        const users = await User.find();
        const userMap = new Map(users.map(u => [u.id || u._id, u]));

        const enriched = payments.map(p => ({
            ...p,
            userId: userMap.get(p.userId) ? { name: userMap.get(p.userId).name, email: userMap.get(p.userId).email } : null
        }));

        res.json(enriched);
    } catch (err) {
        console.error('getPayments error:', err);
        res.status(500).json({ message: 'Server error fetching payments' });
    }
};

// PUT /api/admin/users/:userId/access
exports.updateUserAccess = async (req, res) => {
    try {
        const { userId } = req.params;
        const { role, subscriptionEndDate, trialStartDate, isApproved } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const updates = {};
        if (role) updates.role = role;
        if (subscriptionEndDate !== undefined) updates.subscriptionEndDate = subscriptionEndDate;
        if (trialStartDate !== undefined) updates.trialStartDate = trialStartDate;
        if (isApproved !== undefined) updates.isApproved = isApproved;

        const updatedUser = await User.findByIdAndUpdate(userId, updates);
        res.json({ message: 'User access updated successfully', user: updatedUser });
    } catch (err) {
        console.error('updateUserAccess error:', err);
        res.status(500).json({ message: 'Server error updating user' });
    }
};

// DELETE /api/admin/users/:userId
exports.deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndDelete(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('deleteUser error:', err);
        res.status(500).json({ message: 'Server error deleting user' });
    }
};

// GET /api/admin/stats
exports.getStats = async (req, res) => {
    try {
        const allUsers = await User.find();
        const students = allUsers.filter(u => u.role === 'student');
        const teachers = allUsers.filter(u => u.role === 'teacher');
        const now = new Date();
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

        const onlineStudents = students.filter(u => u.lastActive && new Date(u.lastActive) >= fifteenMinutesAgo).length;
        const onlineTeachers = teachers.filter(u => u.lastActive && new Date(u.lastActive) >= fifteenMinutesAgo).length;
        const subscriptionActiveStudents = students.filter(u => u.subscriptionEndDate && new Date(u.subscriptionEndDate) > now).length;

        const payments = await Payment.find();
        const approvedPayments = payments.filter(p => p.status === 'approved');
        const totalRevenue = approvedPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

        res.json({
            totalStudents: students.length,
            totalTeachers: teachers.length,
            activeStudents: onlineStudents,
            onlineTeachers,
            blockedStudents: students.length - subscriptionActiveStudents,
            totalRevenue,
            recentPayments: approvedPayments.slice(0, 5)
        });
    } catch (err) {
        console.error('getStats error:', err);
        res.status(500).json({ message: 'Server error fetching stats' });
    }
};

// POST /api/admin/users/create — admin creates a new user account
exports.createUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password || !role)
            return res.status(400).json({ message: 'Name, email, password and role are all required.' });
        if (!['student', 'teacher', 'admin'].includes(role))
            return res.status(400).json({ message: 'Invalid role.' });
        if (password.length < 6)
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });

        const existing = await User.findOne({ email: email.trim().toLowerCase() });
        if (existing)
            return res.status(409).json({ message: 'An account with this email already exists.' });

        const user = await User.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            role,
            isApproved: true
        });

        res.status(201).json({
            message: `Account created for ${name}`,
            user: { id: user.id || user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        console.error('createUser error:', err);
        res.status(500).json({ message: 'Server error creating user.' });
    }
};
