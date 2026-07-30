'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const trackActivity = require('../middleware/activityTracker');
const { syncSession, getSession } = require('../controllers/sessionController');

router.post('/sync', auth, trackActivity, syncSession);
router.get('/:roomId', auth, trackActivity, getSession);

module.exports = router;
