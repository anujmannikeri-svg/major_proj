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

        // Enforce max attempts
        const previousAttempts = await Submission.countDocuments({
            exam: req.params.examId,
            student: req.user.id
        });

        if (previousAttempts >= (exam.maxAttempts || 1)) {
            return res.status(400).json({ message: 'Maximum attempts reached for this exam' });
        }

        const attempt = previousAttempts + 1;

        // Calculate marks with question-specific marks and types
        let marks = 0;
        exam.questions.forEach((q, index) => {
            const ans = answers[index];
            const type = q.type || 'MCQ';

            if (type === 'ShortAnswer') {
                if (
                    typeof ans === 'string' &&
                    typeof q.correctTextAnswer === 'string' &&
                    ans.trim().toLowerCase() === q.correctTextAnswer.trim().toLowerCase()
                ) {
                    marks += q.marks || 1;
                }
            } else {
                // MCQ or TrueFalse, compare index
                if (Number(ans) === q.correctAnswer) {
                    marks += q.marks || 1;
                }
            }
        });

        const passed = marks >= (exam.passMarks || 0);

        const submission = new Submission({
            exam: req.params.examId,
            student: req.user.id,
            answers,
            attempt,
            marks,
            passed
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
        const results = await Submission.find({ student: req.user.id })
            .populate('exam', 'title date duration passMarks maxAttempts')
            .sort({ submittedAt: 1 });
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /student/:studentId -> Admin - per-student analytics and history
router.get('/student/:studentId', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const { studentId } = req.params;
        const results = await Submission.find({ student: studentId })
            .populate('exam', 'title date duration passMarks maxAttempts')
            .populate('student', 'name email')
            .sort({ submittedAt: 1 });

        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
