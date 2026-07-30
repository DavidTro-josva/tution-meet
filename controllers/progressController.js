'use strict';
const Progress = require('../models/Progress');

const track = async (req, res) => {
    try {
        const { lessonId, subjectId, watchTimeSeconds } = req.body;
        if (!lessonId || !subjectId) return res.status(400).json({ message: 'lessonId and subjectId required' });

        const progress = await Progress.findOneAndUpdate(
            { studentId: req.user.id, lessonId },
            { studentId: req.user.id, lessonId, subjectId, watched: true, watchTimeSeconds: watchTimeSeconds || 0, completedAt: new Date() },
            { upsert: true, new: true }
        );
        res.json(progress);
    } catch (err) {
        console.error('Progress track error:', err);
        res.status(500).json({ message: 'Error tracking progress' });
    }
};

const getSummary = async (req, res) => {
    try {
        const records = await Progress.find({ studentId: req.user.id });
        const bySubject = {};
        let totalWatchTime = 0;

        records.forEach(r => {
            const subId = r.subjectId?._id?.toString() || r.subjectId || 'unknown';
            if (!bySubject[subId]) bySubject[subId] = { name: r.subjectName || r.subjectId?.name || 'Subject', watched: 0 };
            bySubject[subId].watched++;
            totalWatchTime += r.watchTimeSeconds || 0;
        });

        res.json({ totalLessonsWatched: records.length, totalStudyHours: Math.round(totalWatchTime / 3600 * 10) / 10, subjects: Object.values(bySubject) });
    } catch (err) {
        console.error('Progress summary error:', err);
        res.status(500).json({ message: 'Error fetching progress' });
    }
};

module.exports = { track, getSummary };
