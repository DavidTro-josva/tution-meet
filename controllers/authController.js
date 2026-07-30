'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendWelcomeEmail, sendOtpEmail } = require('../services/emailService');
const { PLANS } = require('../utils/plans');

// Validate JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET is not set for production!');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// ─── Signup ────────────────────────────────────────────────────────────────
const signup = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: 'Email already registered' });

        const user = await User.create({ name, email, password, role });

        sendWelcomeEmail(email, name, role).catch(() => { });

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        res.status(201).json({
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, trialStartDate: user.trialStartDate, subscriptionEndDate: user.subscriptionEndDate },
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ message: 'Server error during signup' });
    }
};

// ─── Login ─────────────────────────────────────────────────────────────────
const login = async (req, res) => {
    try {
        const { email, password, role } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        if (user.role !== role) {
            return res.status(403).json({ message: `Access denied. Registered as ${user.role}.` });
        }

        if (user.role === 'student') {
            const now = new Date();
            const trialStart = new Date(user.trialStartDate || user.createdAt || Date.now());
            const trialEnd = new Date(trialStart.getTime() + PLANS.TRIAL_DAYS * 24 * 60 * 60 * 1000);
            const trialActive = now <= trialEnd;
            const subActive = user.subscriptionEndDate && new Date(user.subscriptionEndDate) > now;

            if (!trialActive && !subActive) {
                return res.status(403).json({
                    message: 'Your 7-day trial has expired. Please contact your admin to restore access.',
                    trialExpired: true,
                });
            }
        }

        // Update lastActive on login
        await User.findByIdAndUpdate(user.id, { lastActive: new Date().toISOString() });

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, trialStartDate: user.trialStartDate, subscriptionEndDate: user.subscriptionEndDate },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// ─── Forgot Password ───────────────────────────────────────────────────────
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'No account found with this email' });

        const now = new Date();
        const oneHour = 3600000;

        // Reset window if expired
        if (!user.otpResetWindow || now > user.otpResetWindow) {
            user.otpRequestCount = 0;
            user.otpResetWindow = new Date(now.getTime() + oneHour);
        }

        // Check limit
        if (user.otpRequestCount >= 3) {
            return res.status(429).json({ message: 'Too many OTP requests. Try again in 1 hour.' });
        }

        user.otpRequestCount += 1;

        const otp = crypto.randomInt(100000, 999999).toString();
        user.resetOtp = otp;
        user.resetOtpExpiry = new Date(now.getTime() + 10 * 60 * 1000);
        await user.save();

        const emailResult = await sendOtpEmail(email, otp);
        res.json({
            message: emailResult?.dev ? 'OTP generated (check server console)' : 'OTP sent to your email',
            emailSent: !emailResult?.dev,
            ...(emailResult?.dev && { devOtp: otp }),
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Failed to process password reset' });
    }
};

// ─── Verify OTP ────────────────────────────────────────────────────────────
const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.resetOtp || user.resetOtp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
        if (new Date() > new Date(user.resetOtpExpiry)) return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });

        res.json({ message: 'OTP verified', verified: true });
    } catch (err) {
        console.error('Verify OTP error:', err);
        res.status(500).json({ message: 'Failed to verify OTP' });
    }
};

// ─── Reset Password ────────────────────────────────────────────────────────
const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Email, OTP, and new password are required' });
        if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.resetOtp || user.resetOtp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
        if (new Date() > new Date(user.resetOtpExpiry)) return res.status(400).json({ message: 'OTP has expired' });

        user.password = newPassword;
        user.resetOtp = null;
        user.resetOtpExpiry = null;
        await user.save();

        res.json({ message: 'Password reset successfully! You can now log in.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: 'Failed to reset password' });
    }
};

module.exports = { signup, login, forgotPassword, verifyOtp, resetPassword };
