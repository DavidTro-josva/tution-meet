'use strict';
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const cors = require('cors');

// ─── Config Modules ───────────────────────────────────────────────
const { setupLogger } = require('./config/logger');
const { buildCorsOptions } = require('./config/cors');
const { connectDB } = require('./config/database');
const { createSocketServer } = require('./config/socket');

// ─── Route Imports ────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/session');
const livekitRoutes = require('./routes/livekit');
const assignmentRoutes = require('./routes/assignments');
const attendanceRoutes = require('./routes/attendance');
const subjectRoutes = require('./routes/subjects');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./admin/routes/adminRoutes');
const paymentRoutes = require('./routes/payment');
const chatRoutes = require('./routes/chat');
const analyticsRoutes = require('./routes/analytics');
const progressRoutes = require('./routes/progress');

// ─── App & Server Initialisation ─────────────────────────────────
setupLogger(); // Must be called before any console.log

const app = express();
app.use(helmet({
    contentSecurityPolicy: false, // Set to false if it blocks your specific frontend setup, otherwise keep default
    crossOriginEmbedderPolicy: false
}));
const server = http.createServer(app);
createSocketServer(server); // Attach Socket.IO

// ─── Middleware ───────────────────────────────────────────────────
app.use(cors(buildCorsOptions()));
app.use(express.json());

// ─── API Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/progress', progressRoutes);

// ─── Static Frontend (Production) ────────────────────────────────
const fs = require('fs');
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
} else {
    console.error('CRITICAL: dist folder MISSING. Run `npm run build` first.');
}

// ─── Health Check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => res.send('Server is Running! Mode: ' + (process.env.NODE_ENV || 'development')));

// ─── SPA Fallback ─────────────────────────────────────────────────
app.get(/^(?!\/api).*/, (req, res) => {
    const indexFile = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else {
        res.status(500).send('Frontend build not found. Run `npm run build`.');
    }
});

// ─── Server Startup ───────────────────────────────────────────────
const PORT = process.env.PORT || 5005;

if (require.main === module) {
    connectDB().catch(err => console.error('Failed to start database:', err));
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// ─── LiveKit Webhook (must come after server.listen) ─────────────
let receiver = null;
if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    const { WebhookReceiver } = require('livekit-server-sdk');
    receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

app.post('/api/livekit/webhook', async (req, res) => {
    if (!receiver) {
        return res.status(503).json({ error: 'LiveKit not configured' });
    }
    try {
        const event = receiver.receive(req.body, req.get('Authorization'));
        res.json({ received: true });
    } catch (err) {
        res.status(400).json({ error: 'Invalid webhook' });
    }
});

module.exports = { app, server };
