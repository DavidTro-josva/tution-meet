const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Get all users (can filter by role ?role=student)
router.get('/users', auth, roleGuard('admin'), adminController.getUsers);

// Approve a payment and add days to subscription
router.post('/payments/approve', auth, roleGuard('admin'), adminController.approvePayment);

// Get all payment records
router.get('/payments', auth, roleGuard('admin'), adminController.getPayments);

// Manually update user access details
router.put('/users/:userId/access', auth, roleGuard('admin'), adminController.updateUserAccess);

// Create a new user account (admin-issued)
router.post('/users/create', auth, roleGuard('admin'), adminController.createUser);

// Delete a user
router.delete('/users/:userId', auth, roleGuard('admin'), adminController.deleteUser);

// Get admin stats summary
router.get('/stats', auth, roleGuard('admin'), adminController.getStats);

module.exports = router;
