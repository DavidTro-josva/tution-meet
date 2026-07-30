'use strict';
const SessionData = require('../models/SessionData');

const sanitize = str => (typeof str === 'string' ? str.replace(/[<>]/g, '') : str);

const syncSession = async (req, res) => {
    try {
        const { roomId, highlights, actionItems, chatHistory, title } = req.body;

        const sanitizedHighlights = highlights?.map(h => ({ ...h, note: sanitize(h.note), title: sanitize(h.title) }));
        const sanitizedChat = chatHistory?.map(c => ({ ...c, text: sanitize(c.text) }));

        let session = await SessionData.findOne({ roomId });
        if (session) {
            if (sanitizedHighlights) session.highlights = sanitizedHighlights;
            if (actionItems) session.actionItems = actionItems;
            if (sanitizedChat) session.chatHistory = sanitizedChat;
            if (title) session.title = title;
            await session.save();
        } else {
            session = await SessionData.create({ roomId, teacherId: req.user.id, highlights: sanitizedHighlights, actionItems, chatHistory: sanitizedChat, title });
        }
        res.json(session);
    } catch (err) {
        res.status(500).json({ message: 'Error syncing session data' });
    }
};

const getSession = async (req, res) => {
    try {
        const session = await SessionData.findOne({ roomId: req.params.roomId });
        if (!session) return res.status(404).json({ message: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching session data' });
    }
};

module.exports = { syncSession, getSession };
