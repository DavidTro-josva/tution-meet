'use strict';
const { Server } = require('socket.io');
const { buildCorsOptions } = require('./cors');

let io;

/**
 * Attaches Socket.IO to the HTTP server and registers all real-time event handlers.
 * Returns the io instance so routes can emit events if needed.
 *
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
function createSocketServer(httpServer) {
    io = new Server(httpServer, {
        cors: buildCorsOptions(),
    });

    const rooms = {}; // roomId → Set of socket ids (legacy)

    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id);

        // ─── Live Session Events ───────────────────────────
        socket.on('join-room', (roomId, userId) => {
            socket.join(roomId);
            if (!rooms[roomId]) rooms[roomId] = new Set();
            rooms[roomId].add(userId);
            socket.to(roomId).emit('user-connected', userId);

            // Broadcast updated student count
            const count = rooms[roomId].size;
            io.to(roomId).emit('student-count', count);

            socket.on('disconnect', () => {
                if (rooms[roomId]) {
                    rooms[roomId].delete(userId);
                    const newCount = rooms[roomId].size;
                    socket.to(roomId).emit('user-disconnected', userId);
                    io.to(roomId).emit('student-count', newCount);
                    if (rooms[roomId].size === 0) delete rooms[roomId];
                }
            });
        });

        socket.on('end-session', (data) => {
            const { roomId, endedAt } = data || {};
            if (roomId) {
                io.to(roomId).emit('session-ended', { roomId, endedAt: endedAt || Date.now() });
                console.log(`Session ended in room ${roomId} by ${socket.id}`);
            }
        });

        // ─── Chat Events ───────────────────────────────────
        socket.on('send-message', (data) => {
            if (data?.room) socket.to(data.room).emit('receive-message', data);
        });

        socket.on('typing', (data) => {
            if (data?.room) socket.to(data.room).emit('user-typing', data);
        });

        socket.on('stop-typing', (data) => {
            if (data?.room) socket.to(data.room).emit('user-stop-typing', data);
        });

        // ─── Notification Events ──────────────────────────
        socket.on('join-user', (userId) => {
            socket.join(userId);
            console.log(`User ${userId} joined their private Notification room`);
        });

        // ─── WebRTC Signaling Events ───────────────────────
        socket.on('signal', (data) => {
            if (data?.to) io.to(data.to).emit('signal', { ...data, from: socket.id });
        });
    });

    return io;
}

/**
 * Returns the global io instance.
 * @returns {Server}
 */
function getIO() {
    return io;
}

module.exports = { createSocketServer, getIO };
