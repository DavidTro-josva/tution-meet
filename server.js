'use strict';
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const cors = require('cors');
const fs = require('fs');

// ─── Config Modules ───────────────────────────────────────────────
const { setupLogger } = require('./config/logger');
const { buildCorsOptions } = require('./config/cors');
const { connectDB } = require('./config/database');

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

// ─── App Initialisation ───────────────────────────────────────────
setupLogger();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

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
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
} else {
    console.error('CRITICAL: dist folder MISSING.');
}

// ─── Health Check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => res.send('Server is Running! Mode: ' + (process.env.NODE_ENV || 'development')));

// ─── SPA Fallback ─────────────────────────────────────────────────
app.get(/^(?!\/api).*/, (req, res) => {
    const indexFile = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else {
        res.status(500).send('Frontend build not found.');
    }
});

// ─── LiveKit Webhook ──────────────────────────────────────────────
let receiver = null;
if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    try {
        const { WebhookReceiver } = require('livekit-server-sdk');
        receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    } catch (e) {
        console.warn('LiveKit webhook receiver not initialised:', e.message);
    }
}

app.post('/api/livekit/webhook', async (req, res) => {
    if (!receiver) return res.status(503).json({ error: 'LiveKit not configured' });
    try {
        receiver.receive(req.body, req.get('Authorization'));
        res.json({ received: true });
    } catch (err) {
        res.status(400).json({ error: 'Invalid webhook' });
    }
});

// ─── Init DB ──────────────────────────────────────────────────────
// Call once and cache (Vercel keeps warm instances between requests)
let dbReady = false;
const ensureDB = async () => {
    if (!dbReady) {
        await connectDB().catch(err => console.error('DB init error:', err));
        dbReady = true;
    }
};

// Kick off DB connection immediately on cold start
ensureDB();

// ─── Server Startup (local / Railway / Render) ────────────────────
if (require.main === module) {
    const server = http.createServer(app);

    // Attach Socket.IO only when running as a real long-lived server
    try {
        const { createSocketServer } = require('./config/socket');
        createSocketServer(server);
    } catch (e) {
        console.warn('Socket.IO not available:', e.message);
    }

    const PORT = process.env.PORT || 5005;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// ─── Vercel Serverless Export ─────────────────────────────────────
module.exports = app;
