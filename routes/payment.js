const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const User = require('../models/User');
const auth = require('../middleware/auth');
const trackActivity = require('../middleware/activityTracker');
const { sendPaymentConfirmation } = require('../utils/emailService');

// Initialize Razorpay (only if keys are configured)
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'rzp_test_REPLACE_ME') {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
}

// GET /api/payment/config — returns public key + availability
router.get('/config', (req, res) => {
    res.json({
        enabled: !!razorpay,
        keyId: process.env.RAZORPAY_KEY_ID || '',
        currency: 'INR'
    });
});

const { calculateExpectedAmount } = require('../utils/plans');

// POST /api/payment/create-order — creates a Razorpay order
router.post('/create-order', auth, trackActivity, async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({ message: 'Online payments not configured. Use manual UPI.' });
        }

        const { amount, days } = req.body;
        if (!amount || !days) {
            return res.status(400).json({ message: 'Amount and days are required' });
        }

        // --- SECURITY VALIDATION ---
        const expectedAmount = calculateExpectedAmount(parseInt(days));
        if (!expectedAmount) {
            return res.status(400).json({ message: 'Invalid subscription duration' });
        }

        if (parseInt(amount) !== expectedAmount) {
            return res.status(400).json({
                message: 'Pricing mismatch detected. Please refresh and try again.',
                securityHint: 'Amount sent does not match server-side plan pricing'
            });
        }
        // ----------------------------

        const order = await razorpay.orders.create({
            amount: expectedAmount * 100, // Razorpay uses paise
            currency: 'INR',
            receipt: `order_${req.user.id}_${Date.now()}`,
            notes: {
                userId: req.user.id,
                days: days.toString()
            }
        });

        res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (err) {
        console.error('Create order error:', err);
        res.status(500).json({ message: 'Failed to create payment order' });
    }
});

// POST /api/payment/verify — verify payment signature & activate subscription
router.post('/verify', auth, trackActivity, async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({ message: 'Online payments not configured' });
        }

        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, days, amount } = req.body;

        // --- SECURITY VALIDATION ---
        const expectedAmount = calculateExpectedAmount(parseInt(days));
        if (!expectedAmount || parseInt(amount) !== expectedAmount) {
            return res.status(400).json({ message: 'Security Alert: Payment details mismatch' });
        }
        // ----------------------------

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ message: 'Payment verification failed — invalid signature' });
        }

        // Check for duplicate payment
        const existingPayment = await Payment.findOne({ razorpayPaymentId });
        if (existingPayment) {
            return res.status(400).json({ message: 'Payment already processed' });
        }

        // Save payment record
        const payment = new Payment({
            userId: req.user.id,
            amount,
            daysAdded: days,
            status: 'approved',
            method: 'razorpay',
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            notes: `Online payment via Razorpay for ${days} days`
        });
        await payment.save();

        // Extend subscription
        const user = await User.findById(req.user.id);
        const now = new Date();
        let currentEnd = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : now;
        if (currentEnd < now) currentEnd = now;
        currentEnd.setDate(currentEnd.getDate() + days);
        user.subscriptionEndDate = currentEnd;
        await user.save();

        res.json({
            message: 'Payment verified! Subscription extended.',
            subscriptionEndDate: user.subscriptionEndDate,
            daysAdded: days
        });

        // Send confirmation email (async, non-blocking)
        sendPaymentConfirmation(user.email, user.name, amount, days, razorpayPaymentId).catch(() => { });
    } catch (err) {
        console.error('Verify payment error:', err);
        res.status(500).json({ message: 'Payment verification failed' });
    }
});

// POST /api/payment/submit-upi — student submits UPI payment screenshot
const { storage } = require('../config/firebaseServer');
const { ref, uploadString, getDownloadURL } = require('firebase/storage');

router.post('/submit-upi', auth, trackActivity, async (req, res) => {
    try {
        const { days, amount, utrNumber, screenshotBase64 } = req.body;
        if (!days || !amount) {
            return res.status(400).json({ message: 'Days and amount are required' });
        }
        if (!screenshotBase64) {
            return res.status(400).json({ message: 'Payment screenshot is required' });
        }

        // --- SECURITY & SCALABILITY FIXES ---
        // 1. Size Limit: 5MB (approx 6.7MB in base64)
        const sizeInBytes = (screenshotBase64.length * 3) / 4;
        if (sizeInBytes > 5 * 1024 * 1024) {
            return res.status(400).json({ message: 'Screenshot too large. Please compress to under 5MB.' });
        }

        // 2. Check for pending request
        const existing = await Payment.findOne({ userId: req.user.id, status: 'pending', method: 'manual' });
        if (existing) {
            return res.status(400).json({ message: 'You already have a pending payment request. Please wait for admin approval.' });
        }

        // 3. Upload to Firebase Storage instead of storing in DB
        let screenshotUrl = '';
        try {
            const fileName = `upi_${req.user.id}_${Date.now()}.jpg`;
            const storageRef = ref(storage, `payment_screenshots/${fileName}`);
            // screenshotBase64 usually starts with "data:image/jpeg;base64,"
            await uploadString(storageRef, screenshotBase64, 'data_url');
            screenshotUrl = await getDownloadURL(storageRef);
        } catch (uploadErr) {
            console.error('Firebase Upload Error:', uploadErr);
            return res.status(500).json({ message: 'Failed to upload screenshot. Please try again.' });
        }

        const payment = new Payment({
            userId: req.user.id,
            amount: parseInt(amount),
            daysAdded: parseInt(days),
            status: 'pending',
            method: 'manual',
            utrNumber: utrNumber || '',
            screenshotUrl: screenshotUrl, // Storing URL instead of base64
            notes: `Manual UPI payment — ${days} days plan — UTR: ${utrNumber || 'Not provided'}`
        });
        await payment.save();

        res.status(201).json({ message: 'Payment submitted successfully! Admin will verify and activate your plan shortly.' });
    } catch (err) {
        console.error('Submit UPI error:', err);
        res.status(500).json({ message: 'Failed to submit payment' });
    }
});

// POST /api/payment/activate/:id — admin activates a pending UPI payment
const adminAuth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

router.post('/activate/:id', adminAuth, roleGuard('admin'), async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id).populate('userId');
        if (!payment) return res.status(404).json({ message: 'Payment not found' });
        if (payment.status === 'approved') return res.status(400).json({ message: 'Payment already approved' });

        // Activate the student's subscription
        const user = await User.findById(payment.userId._id || payment.userId);
        if (!user) return res.status(404).json({ message: 'Student not found' });

        const now = new Date();
        let currentEnd = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : now;
        if (currentEnd < now) currentEnd = now;
        currentEnd.setDate(currentEnd.getDate() + payment.daysAdded);
        user.subscriptionEndDate = currentEnd;
        await user.save();

        // Mark payment as approved
        payment.status = 'approved';
        payment.approvedBy = req.user.id;
        await payment.save();

        res.json({
            message: `✅ Plan activated! ${payment.daysAdded} days added for ${user.name}.`,
            subscriptionEndDate: user.subscriptionEndDate
        });
    } catch (err) {
        console.error('Activate plan error:', err);
        res.status(500).json({ message: 'Failed to activate plan' });
    }
});

// POST /api/payment/reject/:id — admin rejects a pending UPI payment
router.post('/reject/:id', adminAuth, roleGuard('admin'), async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });
        payment.status = 'rejected';
        payment.notes += ' [Rejected by admin]';
        await payment.save();
        res.json({ message: 'Payment rejected.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to reject payment' });
    }
});

module.exports = router;
