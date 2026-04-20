const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { applyPassFieldsToExamPayload } = require('../utils/examPass');

function isPastDateOnly(dateValue) {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return true;
    const selected = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return selected < startOfToday;
}

// POST /exams -> Admin, Expert
router.post('/', authMiddleware, roleMiddleware(['Admin', 'Expert']), async (req, res) => {
    try {
        if (req.user.role === 'Expert' && !req.user.isExpertApproved) {
            return res.status(403).json({ message: 'Admin approval required to access Expert module' });
        }

        const base = { ...req.body, createdBy: req.user.id };
        if (!base.date || isPastDateOnly(base.date)) {
            return res.status(400).json({ message: 'Exam date cannot be in the past.' });
        }

        // Compute total marks for percentage calculation
        const questions = Array.isArray(base.questions) ? base.questions : [];
        base.totalMarks = questions.reduce((sum, q) => sum + (parseInt(q.marks, 10) || 1), 0);
        applyPassFieldsToExamPayload(base, base.totalMarks, { isCreate: true });

        // Experts can only create Expert module exams which must be approved by Admin later
        if (req.user.role === 'Expert') {
            base.moduleType = 'Expert';
            base.isApproved = false;
            base.adminCorrectionsSubmittedAt = null;
        }

        // Admin-created exams are approved by default
        if (req.user.role === 'Admin' && typeof base.isApproved === 'undefined') {
            base.isApproved = true;
        }

        const exam = new Exam(base);
        await exam.save();
        res.status(201).json(exam);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /exams -> Admin, Expert, Student
router.get('/', authMiddleware, async (req, res) => {
    try {
        if (req.user.role === 'Expert' && !req.user.isExpertApproved) {
            return res.status(403).json({ message: 'Admin approval required to access Expert module' });
        }

        let query = {};

        if (req.user.role === 'Student') {
            // Students can see all regular exams, and only approved Expert module exams
            query = {
                $or: [
                    { moduleType: { $ne: 'Expert' } },
                    { moduleType: 'Expert', isApproved: true }
                ]
            };
        } else if (req.user.role === 'Expert') {
            // Experts can only see exams they created.
            query = { createdBy: req.user.id };
        }

        const exams = await Exam.find(query).select('-questions.correctAnswer -questions.correctTextAnswer');

        // Backfill totalMarks for older exams
        exams.forEach((e) => {
            if (!e.totalMarks || e.totalMarks <= 0) {
                const qs = Array.isArray(e.questions) ? e.questions : [];
                e.totalMarks = qs.reduce((sum, q) => sum + (parseInt(q.marks, 10) || 1), 0);
            }
        });

        // Optimization: Don't send correct answers to students in the list view
        res.json(exams);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /exams/:id -> Admin, Expert, Student
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role === 'Expert' && !req.user.isExpertApproved) {
            return res.status(403).json({ message: 'Admin approval required to access Expert module' });
        }

        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });
        if (req.user.role === 'Expert' && String(exam.createdBy) !== String(req.user.id)) {
            return res.status(403).json({ message: 'You can access only exams created by you.' });
        }

        // Backfill totalMarks for older exams
        if (!exam.totalMarks || exam.totalMarks <= 0) {
            const qs = Array.isArray(exam.questions) ? exam.questions : [];
            exam.totalMarks = qs.reduce((sum, q) => sum + (parseInt(q.marks, 10) || 1), 0);
        }

        // Students cannot access unapproved Expert exams
        if (req.user.role === 'Student' && exam.moduleType === 'Expert' && !exam.isApproved) {
            return res.status(403).json({ message: 'Exam not yet approved by admin' });
        }

        // Students shouldn't see correct answers before submission
        const examData = exam.toObject();
        if (req.user.role !== 'Admin') {
            examData.questions.forEach(q => {
                delete q.correctAnswer;
                delete q.correctTextAnswer;
            });
        }

        res.json(examData);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /exams/:id -> Admin
router.put('/:id', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const existing = await Exam.findById(req.params.id);
        if (!existing) return res.status(404).json({ message: 'Exam not found' });

        if (Array.isArray(req.body.questions)) {
            req.body.totalMarks = req.body.questions.reduce((sum, q) => sum + (parseInt(q.marks, 10) || 1), 0);
        }
        if (req.body.date && isPastDateOnly(req.body.date)) {
            return res.status(400).json({ message: 'Exam date cannot be in the past.' });
        }

        const totalForPass = Array.isArray(req.body.questions)
            ? req.body.totalMarks
            : (existing.totalMarks || 0);
        const hasPassInput = (typeof req.body.passPercentage === 'number' && !Number.isNaN(req.body.passPercentage))
            || (typeof req.body.passMarks === 'number' && !Number.isNaN(req.body.passMarks));
        if (hasPassInput) {
            applyPassFieldsToExamPayload(req.body, totalForPass, { isCreate: false });
        } else {
            delete req.body.passMarks;
        }

        // Expert module: drafts track admin corrections for first approval; published exams stay approved when edited.
        if (existing.moduleType === 'Expert') {
            if (existing.isApproved) {
                delete req.body.isApproved;
                delete req.body.adminCorrectionsSubmittedAt;
            } else {
                req.body.isApproved = false;
                req.body.adminCorrectionsSubmittedAt = new Date();
            }
        }

        const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(exam);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /exams/:id -> Admin
router.delete('/:id', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const exam = await Exam.findByIdAndDelete(req.params.id);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });
        res.json({ message: 'Exam deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /results/:examId -> Admin
router.get('/results/:examId', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const Submission = require('../models/Submission');
        const results = await Submission.find({ exam: req.params.examId }).populate('student', 'name email');
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /exam-status/:examId -> Student - check remaining attempts
router.get('/exam-status/:examId', authMiddleware, roleMiddleware(['Student']), async (req, res) => {
    try {
        const Submission = require('../models/Submission');
        const exam = await Exam.findById(req.params.examId);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        if (exam.moduleType === 'Expert' && !exam.isApproved) {
            return res.status(403).json({ message: 'Exam not yet approved by admin' });
        }

        const attempts = await Submission.countDocuments({
            exam: req.params.examId,
            student: req.user.id
        });

        res.json({
            attempts,
            maxAttempts: exam.maxAttempts || 1,
            remainingAttempts: Math.max(0, (exam.maxAttempts || 1) - attempts),
            canAttempt: attempts < (exam.maxAttempts || 1)
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /exams/:id/approve -> Admin approves Expert exam
router.patch('/:id/approve', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        // Enforce: Admin must edit + save corrected questions before approval for Expert module exams.
        if (exam.moduleType === 'Expert' && !exam.adminCorrectionsSubmittedAt) {
            return res.status(400).json({ message: 'Admin must edit and save corrected questions before submitting approval.' });
        }

        exam.isApproved = true;
        await exam.save();

        res.json(exam);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
