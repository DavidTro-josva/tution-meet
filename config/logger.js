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

    // Only write to file in local dev (Vercel/serverless has a read-only filesystem)
    let logFile = null;
    const isServerless = process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === 'production';
    if (!isServerless) {
        try {
            logFile = fs.createWriteStream(
                path.join(__dirname, '..', 'server_debug.log'),
                { flags: 'a' }
            );
            logFile.on('error', () => { logFile = null; });
        } catch (e) {
            logFile = null;
        }
    }

    console.log = function (...args) {
        const msg = util.format(...args) + '\n';
        if (logFile) {
            try { logFile.write(msg); } catch (e) { logFile = null; }
        }
        logStdout.write(msg);
    };

    console.error = function (...args) {
        const msg = util.format(...args) + '\n';
        if (logFile) {
            try { logFile.write(msg); } catch (e) { logFile = null; }
        }
        logStdout.write(msg);
    };
}

module.exports = { setupLogger };
