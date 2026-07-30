const User = require('../models/User');

const trialAccessGuard = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Admins and Teachers bypass this test
        if (user.role === 'admin' || user.role === 'teacher') {
            return next();
        }

        const now = new Date();
        const trialStart = new Date(user.trialStartDate);
        const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later

        let hasAccess = false;

        // 1. Check if still in 7-day trial
        if (now <= trialEnd) {
            hasAccess = true;
        }

        // 2. Check if they have an active paid subscription
        if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) > now) {
            hasAccess = true;
        }

        if (hasAccess) {
            next();
        } else {
            return res.status(403).json({
                message: 'Your premium Trial Access has expired! 🚀 Continue your learning journey for just ₹69 per day and get unlimited access to all subjects.',
                reason: 'trial_expired',
                requiresPayment: true
            });
        }

    } catch (err) {
        console.error('Trial Access Guard error:', err);
        res.status(500).json({ message: 'Server Error verifying access' });
    }
};

module.exports = trialAccessGuard;
