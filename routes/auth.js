'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { signup, login, forgotPassword, verifyOtp, resetPassword } = require('../controllers/authController');
const { authRateLimiter } = require('../middleware/rateLimiter');

router.post('/signup', authRateLimiter, signup);
router.post('/login', authRateLimiter, login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

// Verify the stored token and return fresh user data.
// Used by AuthContext on app mount to handle memory DB restarts gracefully.
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -resetOtp -resetOtpExpiry');
        if (!user) return res.status(401).json({ message: 'User not found' });
        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                trialStartDate: user.trialStartDate,
                subscriptionEndDate: user.subscriptionEndDate,
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

