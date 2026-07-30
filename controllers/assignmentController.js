'use strict';
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const notificationRoutes = require('../routes/notifications');

const create = async (req, res) => {
    try {
        const { title, description, subjectId, dueDate, maxPoints, attachments } = req.body;
        const assignment = new Assignment({
            title, description, subjectId,
            teacherId: req.user.id,
            dueDate,
            maxPoints: maxPoints || 100,
            attachments: attachments || [],
        });
        await assignment.save();

        await notificationRoutes.broadcastToSubject(
            subjectId, req.user.id, 'assignment', 'New Assignment',
            `New assignment: ${title}. Due: ${new Date(dueDate).toLocaleDateString()}`,
            '/assignments', 14
        );
        res.status(201).json(assignment);
    } catch (err) {
        res.status(500).json({ message: 'Error creating assignment' });
    }
};

const getAll = async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const assignments = await Assignment.find({ teacherId: req.user.id }).sort({ createdAt: -1 });
            // Efficiently get counts for all assignments
            const submissionCounts = await Submission.aggregate([
                { $group: { _id: '$assignmentId', count: { $sum: 1 } } }
            ]);

            const assignmentsWithCounts = assignments.map(a => {
                const countObj = submissionCounts.find(c => c._id.toString() === a._id.toString());
                return { ...a.toObject(), submissionCount: countObj ? countObj.count : 0 };
            });
            return res.json(assignmentsWithCounts);
        }

        const assignments = await Assignment.find({ status: 'published' }).sort({ dueDate: 1 });

        // If student, attach their submission status
        if (req.user.role === 'student') {
            const submissions = await Submission.find({ studentId: req.user.id });
            const assignmentsWithStatus = assignments.map(a => {
                const sub = submissions.find(s => s.assignmentId.toString() === a._id.toString());
                return { ...a.toObject(), submitted: !!sub, grade: sub?.grade };
            });
            return res.json(assignmentsWithStatus);
        }

        res.json(assignments);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching assignments' });
    }
};

const getById = async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

        // If teacher, include all submissions
        if (req.user.role === 'teacher' && assignment.teacherId.toString() === req.user.id) {
            const submissions = await Submission.find({ assignmentId: assignment._id }).populate('studentId', 'name email');
            return res.json({ ...assignment.toObject(), submissions });
        }

        // If student, include only their submission
        if (req.user.role === 'student') {
            const submission = await Submission.findOne({ assignmentId: assignment._id, studentId: req.user.id });
            return res.json({ ...assignment.toObject(), mySubmission: submission });
        }

        res.json(assignment);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching assignment' });
    }
};

const update = async (req, res) => {
    try {
        const assignment = await Assignment.findOneAndUpdate(
            { _id: req.params.id, teacherId: req.user.id }, req.body, { new: true }
        );
        if (!assignment) return res.status(404).json({ message: 'Assignment not found or unauthorized' });
        res.json(assignment);
    } catch (err) {
        res.status(500).json({ message: 'Error updating assignment' });
    }
};

const remove = async (req, res) => {
    try {
        const assignment = await Assignment.findOneAndDelete({ _id: req.params.id, teacherId: req.user.id });
        if (!assignment) return res.status(404).json({ message: 'Assignment not found or unauthorized' });

        // Also remove associated submissions
        await Submission.deleteMany({ assignmentId: req.params.id });

        res.json({ message: 'Assignment and associated submissions deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting assignment' });
    }
};

const submit = async (req, res) => {
    try {
        const { content, attachments } = req.body;
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
        if (assignment.status === 'closed') return res.status(400).json({ message: 'Assignment is closed for submissions' });

        const submission = await Submission.findOneAndUpdate(
            { assignmentId: req.params.id, studentId: req.user.id },
            { content, attachments: attachments || [], submittedAt: new Date() },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ message: 'Submission saved', submission });
    } catch (err) {
        res.status(500).json({ message: 'Error submitting assignment' });
    }
};

const grade = async (req, res) => {
    try {
        const { points, feedback } = req.body;
        const assignment = await Assignment.findOne({ _id: req.params.id, teacherId: req.user.id });
        if (!assignment) return res.status(404).json({ message: 'Assignment not found or unauthorized' });

        const submission = await Submission.findOneAndUpdate(
            { assignmentId: req.params.id, studentId: req.params.studentId },
            { grade: { points, feedback, gradedAt: new Date() } },
            { new: true }
        );

        if (!submission) return res.status(404).json({ message: 'Student submission not found' });

        // Real-time Notification (Step 11 & Socket.IO Integration)
        const { getIO } = require('../config/socket');
        const io = getIO();
        if (io) {
            io.to(req.params.studentId).emit('NOTIFICATION_NEW', {
                id: Date.now(),
                type: 'grade',
                title: 'Assignment Graded',
                desc: `Your assignment "${assignment.title}" has been graded!`,
                time: 'Just now',
                unread: true,
                assignmentId: assignment._id
            });
        }

        res.json({ message: 'Grade saved', submission });
    } catch (err) {
        res.status(500).json({ message: 'Error grading assignment' });
    }
};

const getRecentSubmissions = async (req, res) => {
    try {
        const assignments = await Assignment.find({ teacherId: req.user.id });
        const assignmentIds = assignments.map(a => a._id);

        const submissions = await Submission.find({ assignmentId: { $in: assignmentIds } })
            .populate('studentId', 'name email')
            .populate('assignmentId', 'title')
            .sort({ submittedAt: -1 })
            .limit(10);

        const formatted = submissions.map(s => ({
            id: s._id,
            title: s.assignmentId.title,
            studentName: s.studentId.name,
            submittedAt: new Date(s.submittedAt).toLocaleString(),
            fileName: s.attachments?.[0]?.name || 'submission.pdf',
            status: s.grade?.points !== undefined ? 'Graded' : 'Pending',
            feedback: s.grade?.feedback
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching recent submissions' });
    }
};

module.exports = { create, getAll, getById, update, remove, submit, grade, getRecentSubmissions };
