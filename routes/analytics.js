'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const trackActivity = require('../middleware/activityTracker');
const roleGuard = require('../middleware/roleGuard');
const { getTeacherAnalytics, getStudentAnalytics } = require('../controllers/analyticsController');

router.get('/teacher', auth, trackActivity, roleGuard('teacher'), getTeacherAnalytics);
router.get('/student', auth, trackActivity, getStudentAnalytics);

module.exports = router;
