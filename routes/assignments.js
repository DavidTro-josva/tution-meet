'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const trackActivity = require('../middleware/activityTracker');
const roleGuard = require('../middleware/roleGuard');
const assignmentController = require('../controllers/assignmentController');

router.get('/recent-submissions', auth, trackActivity, roleGuard('teacher'), assignmentController.getRecentSubmissions);
router.post('/', auth, trackActivity, roleGuard('teacher'), assignmentController.create);
router.get('/', auth, trackActivity, assignmentController.getAll);
router.get('/:id', auth, trackActivity, assignmentController.getById);
router.put('/:id', auth, trackActivity, roleGuard('teacher'), assignmentController.update);
router.delete('/:id', auth, trackActivity, roleGuard('teacher'), assignmentController.remove);
router.post('/:id/submit', auth, trackActivity, roleGuard('student'), assignmentController.submit);
router.put('/:id/grade/:studentId', auth, trackActivity, roleGuard('teacher'), assignmentController.grade);

module.exports = router;
