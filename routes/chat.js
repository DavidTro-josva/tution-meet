const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const trackActivity = require('../middleware/activityTracker');
const Message = require('../models/Message');
const User = require('../models/User');

// GET /api/chat/conversations — list all conversations for current user
router.get('/conversations', auth, trackActivity, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find all unique users this person has chatted with
        const sent = await Message.distinct('receiverId', { senderId: userId });
        const received = await Message.distinct('senderId', { receiverId: userId });
        const partnerIds = [...new Set([...sent.map(String), ...received.map(String)])];

        const partners = await User.find({ _id: { $in: partnerIds } })
            .select('name email role avatar');

        // Get last message + unread count for each conversation
        const conversations = await Promise.all(partners.map(async (partner) => {
            const lastMsg = await Message.findOne({
                $or: [
                    { senderId: userId, receiverId: partner._id },
                    { senderId: partner._id, receiverId: userId }
                ]
            }).sort({ createdAt: -1 });

            const unread = await Message.countDocuments({
                senderId: partner._id,
                receiverId: userId,
                read: false
            });

            return {
                partner: { id: partner._id, name: partner.name, role: partner.role, avatar: partner.avatar },
                lastMessage: lastMsg ? { content: lastMsg.content, createdAt: lastMsg.createdAt, senderId: lastMsg.senderId } : null,
                unreadCount: unread
            };
        }));

        // Sort by last message time
        conversations.sort((a, b) => {
            if (!a.lastMessage) return 1;
            if (!b.lastMessage) return -1;
            return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
        });

        res.json(conversations);
    } catch (err) {
        console.error('Conversations error:', err);
        res.status(500).json({ message: 'Error fetching conversations' });
    }
});

// GET /api/chat/messages/:partnerId — get messages between two users
router.get('/messages/:partnerId', auth, trackActivity, async (req, res) => {
    try {
        const userId = req.user.id;
        const partnerId = req.params.partnerId;
        const page = parseInt(req.query.page) || 1;
        const limit = 50;

        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: partnerId },
                { senderId: partnerId, receiverId: userId }
            ]
        })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        // Mark received messages as read
        await Message.updateMany(
            { senderId: partnerId, receiverId: userId, read: false },
            { read: true }
        );

        res.json(messages.reverse());
    } catch (err) {
        console.error('Messages error:', err);
        res.status(500).json({ message: 'Error fetching messages' });
    }
});

// POST /api/chat/send — send a message
router.post('/send', auth, trackActivity, async (req, res) => {
    try {
        const { receiverId, content, type } = req.body;
        if (!receiverId || !content) {
            return res.status(400).json({ message: 'Receiver and content required' });
        }

        const message = new Message({
            senderId: req.user.id,
            receiverId,
            content,
            type: type || 'text'
        });
        await message.save();

        res.status(201).json(message);
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ message: 'Error sending message' });
    }
});

// GET /api/chat/users — searchable list of users to start a chat with
router.get('/users', auth, trackActivity, async (req, res) => {
    try {
        const q = req.query.q || '';
        const filter = { _id: { $ne: req.user.id }, role: { $ne: 'admin' } };
        if (q) filter.name = { $regex: q, $options: 'i' };

        const users = await User.find(filter)
            .select('name email role avatar')
            .limit(20);

        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

module.exports = router;
