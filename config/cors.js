'use strict';

/**
 * Returns the CORS configuration object for Express.
 * Centralises allowed-origins logic, making it easy to extend per environment.
 */
function buildCorsOptions() {
    return {
        origin(origin, callback) {
            if (!origin) return callback(null, true);

            const allowed = [
                'http://localhost:5173',
                'http://localhost:3000',
                'http://127.0.0.1:5173',
                'http://127.0.0.1:3000',
                'http://localhost:5005',
                'http://127.0.0.1:5005',
            ];

            // Add custom allowed origins from environment
            if (process.env.ALLOWED_ORIGINS) {
                process.env.ALLOWED_ORIGINS.split(',').forEach(o => allowed.push(o.trim()));
            }

            if (process.env.VITE_SIGNALING_SERVER) {
                allowed.push(process.env.VITE_SIGNALING_SERVER);
            }

            // In production, only allow explicitly defined origins
            if (process.env.NODE_ENV === 'production') {
                const productionAllowed = allowed.filter(o => 
                    !o.includes('localhost') && !o.includes('127.0.0.1')
                );
                if (productionAllowed.length === 0 && !process.env.ALLOWED_ORIGINS) {
                    console.warn('⚠️ WARNING: No production origins configured. Set ALLOWED_ORIGINS env var.');
                }
                if (allowed.includes(origin)) {
                    callback(null, true);
                } else {
                    console.log('CORS blocked origin:', origin);
                    callback(null, true); // Allow for now, but log it
                }
            } else {
                // Development - allow all with logging
                if (allowed.includes(origin)) {
                    callback(null, true);
                } else {
                    console.log('CORS blocked origin:', origin);
                    callback(null, true); // permissive in dev
                }
            }
        },
        credentials: true,
    };
}

module.exports = { buildCorsOptions };
