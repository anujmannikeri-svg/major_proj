const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// POST /submit/:examId -> Student
router.post('/:examId', authMiddleware, roleMiddleware(['Student']), async (req, res) => {
    try {
        const { answers } = req.body;
        const exam = await Exam.findById(req.params.examId);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        // Calculate marks
        let marks = 0;
        exam.questions.forEach((q, index) => {
            if (answers[index] === q.correctAnswer) {
                marks++;
            }
        });

        const submission = new Submission({
            exam: req.params.examId,
            student: req.user.id,
            answers,
            marks
        });

        await submission.save();
        res.status(201).json(submission);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'You have already submitted this exam' });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /my-results -> Student
router.get('/my-results', authMiddleware, roleMiddleware(['Student']), async (req, res) => {
    try {
        const results = await Submission.find({ student: req.user.id }).populate('exam', 'title date');
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
