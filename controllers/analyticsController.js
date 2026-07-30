'use strict';
const User = require('../models/User');
const Subject = require('../models/Subject');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const Submission = require('../models/Submission');

const getTeacherAnalytics = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const subjects = await Subject.find({ teacherId });
        const subjectIds = subjects.map(s => s._id);

        const allStudentIds = new Set();
        subjects.forEach(s => s.enrolledStudents?.forEach(id => allStudentIds.add(id.toString())));

        const assignments = await Assignment.find({ teacherId });
        const assignmentIds = assignments.map(a => a._id);

        const submissions = await Submission.find({ assignmentId: { $in: assignmentIds } });

        let totalSubmissions = submissions.length;
        let gradedSubmissions = submissions.filter(s => s.grade?.points !== undefined).length;

        const sessions = await Attendance.find({ teacherId });
        let totalAttendees = 0;
        sessions.forEach(s => { totalAttendees += s.records?.length || 0; });
        const avgAttendance = sessions.length > 0 ? Math.round(totalAttendees / sessions.length) : 0;

        const recentSessions = sessions
            .sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate))
            .slice(0, 5)
            .map(s => ({
                roomId: s.roomId,
                title: s.sessionTitle || s.roomId,
                date: s.sessionDate,
                attendees: s.records?.length || 0,
                recordingUrl: s.recordingUrl || null
            }));

        res.json({
            totalStudents: allStudentIds.size,
            totalSubjects: subjects.length,
            totalAssignments: assignments.length,
            totalSubmissions,
            gradedSubmissions,
            pendingGrades: totalSubmissions - gradedSubmissions,
            totalSessions: sessions.length,
            avgAttendance,
            recentSessions,
            subjectNames: subjects.map(s => ({ id: s._id, name: s.name, students: s.enrolledStudents?.length || 0 })),
        });
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).json({ message: 'Error fetching analytics' });
    }
};

const getStudentAnalytics = async (req, res) => {
    try {
        const studentId = req.user.id;
        const subjects = await Subject.find({ enrolledStudents: studentId });
        const assignments = await Assignment.find({ status: 'published' });
        const assignmentIds = assignments.map(a => a._id);

        const submissions = await Submission.find({
            studentId,
            assignmentId: { $in: assignmentIds }
        });

        let submitted = submissions.length;
        let totalGrade = 0;
        let gradedCount = 0;

        submissions.forEach(s => {
            if (s.grade?.points !== undefined) {
                totalGrade += s.grade.points;
                gradedCount++;
            }
        });

        const allAttendance = await Attendance.find({});
        let sessionsAttended = 0;
        let totalStudyMinutes = 0;
        allAttendance.forEach(a => {
            const record = a.records?.find(r => r.userId?.toString() === studentId);
            if (record) { sessionsAttended++; totalStudyMinutes += (record.duration || 0) / 60; }
        });

        res.json({
            enrolledSubjects: subjects.length,
            totalAssignments: assignments.length,
            submittedAssignments: submitted,
            averageGrade: gradedCount > 0 ? Math.round(totalGrade / gradedCount) : null,
            sessionsAttended,
            studyHours: Math.round(totalStudyMinutes / 60 * 10) / 10,
            subjectProgress: subjects.map(s => ({ id: s._id, name: s.name, totalLessons: s.lessons?.length || 0 })),
        });
    } catch (err) {
        console.error('Student analytics error:', err);
        res.status(500).json({ message: 'Error fetching student analytics' });
    }
};

module.exports = { getTeacherAnalytics, getStudentAnalytics };
