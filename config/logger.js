'use strict';
const fs = require('fs');
const path = require('path');
const util = require('util');

/**
 * Sets up dual-output logging (file + stdout).
 * Must be called once at app startup before any route handlers.
 */
function setupLogger() {
    const logFile = fs.createWriteStream(
        path.join(__dirname, '..', 'server_debug.log'),
        { flags: 'a' }
    );
    const logStdout = process.stdout;

    console.log = function (...args) {
        const msg = util.format(...args) + '\n';
        logFile.write(msg);
        logStdout.write(msg);
    };

    console.error = function (...args) {
        const msg = util.format(...args) + '\n';
        logFile.write(msg);
        logStdout.write(msg);
    };
}

module.exports = { setupLogger };
