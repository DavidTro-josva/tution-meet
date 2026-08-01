const rateLimit = require('express-rate-limit');

/**
 * Common rate limiter for sensitive routes like login and signup.
 * Prevents brute-force attacks.
 */
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: {
        message: 'Too many login/signup attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    validate: { xForwardedForHeader: false }, // Prevent crash on Vercel/cloud reverse proxies
});

module.exports = { authRateLimiter };
