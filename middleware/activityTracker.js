const User = require('../models/User');

// Middleware to track user last activity timestamp
// Updates lastActive when user makes authenticated requests
const trackActivity = async (req, res, next) => {
    try {
        if (req.user?.id) {
            User.findByIdAndUpdate(req.user.id, { lastActive: new Date().toISOString() }).catch(() => {});
        }
    } catch (err) {
        console.error('Activity tracking error:', err);
    }
    next();
};

module.exports = trackActivity;
