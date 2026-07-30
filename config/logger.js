'use strict';
const fs = require('fs');
const path = require('path');
const util = require('util');

/**
 * Sets up dual-output logging (file + stdout).
 * Must be called once at app startup before any route handlers.
 */
function setupLogger() {
    const logStdout = process.stdout;

    // Only write to file in local dev (Vercel has a read-only filesystem)
    let logFile = null;
    if (process.env.NODE_ENV !== 'production') {
        try {
            logFile = fs.createWriteStream(
                path.join(__dirname, '..', 'server_debug.log'),
                { flags: 'a' }
            );
        } catch (e) {
            // Ignore — read-only filesystem
        }
    }

    console.log = function (...args) {
        const msg = util.format(...args) + '\n';
        if (logFile) logFile.write(msg);
        logStdout.write(msg);
    };

    console.error = function (...args) {
        const msg = util.format(...args) + '\n';
        if (logFile) logFile.write(msg);
        logStdout.write(msg);
    };
}

module.exports = { setupLogger };
