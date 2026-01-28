const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// POST /exams -> Admin
router.post('/', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const exam = new Exam({ ...req.body, createdBy: req.user.id });
        await exam.save();
        res.status(201).json(exam);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /exams -> Admin, Student
router.get('/', authMiddleware, async (req, res) => {
    try {
        const exams = await Exam.find().select('-questions.correctAnswer -questions.correctTextAnswer');
        // Optimization: Don't send correct answers to students in the list view
        res.json(exams);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /exams/:id -> Admin, Student
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

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
        const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!exam) return res.status(404).json({ message: 'Exam not found' });
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

module.exports = router;
