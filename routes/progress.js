'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const trackActivity = require('../middleware/activityTracker');
const { track, getSummary } = require('../controllers/progressController');

router.post('/track', auth, trackActivity, track);
router.get('/summary', auth, trackActivity, getSummary);

module.exports = router;
