const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { submissionPassed } = require('../utils/examPass');
const multer = require('multer');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const destPath = path.join(__dirname, '..', 'storage');
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
        }
        cb(null, destPath);
    },
    filename: function (req, file, cb) {
        const safeName = String(file.originalname || `exam_${req.params.examId}_${Date.now()}.webm`).replace(/[^\w.\-]/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 200 * 1024 * 1024 // 200MB guardrail
    },
    fileFilter: (req, file, cb) => {
        const allowed = /^video\//i.test(file.mimetype || '');
        if (!allowed) return cb(new Error('Only video uploads are allowed.'));
        cb(null, true);
    }
});

// POST /submit/:examId -> Student
router.post('/:examId', authMiddleware, roleMiddleware(['Student']), upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Video recording is required for submission.' });
        }

        let { answers } = req.body;
        if (typeof answers === 'string') {
            try {
                answers = JSON.parse(answers);
            } catch {
                // leave as-is below
            }
        }

        // Backward/alternate formats: { answers: [...] }
        if (answers && typeof answers === 'object' && !Array.isArray(answers) && Array.isArray(answers.answers)) {
            answers = answers.answers;
        }

        if (!Array.isArray(answers)) {
            return res.status(400).json({ message: 'Invalid answers payload.' });
        }
        const exam = await Exam.findById(req.params.examId);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        if (exam.moduleType === 'Expert' && !exam.isApproved) {
            return res.status(403).json({ message: 'Exam not yet approved by admin' });
        }

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

        const passed = submissionPassed(marks, exam);

        let videoData = {
            path: req.file.filename,
            mimeType: req.file.mimetype,
            originalName: req.file.originalname,
            size: req.file.size || null
        };

        if (mongoose.connection.db) {
            const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'submissionVideos' });
            const uploadStream = bucket.openUploadStream(videoData.originalName || `exam_${req.params.examId}_${Date.now()}.webm`, {
                contentType: videoData.mimeType
            });
            const readStream = fs.createReadStream(req.file.path);
            
            await new Promise((resolve, reject) => {
                readStream.pipe(uploadStream)
                    .on('error', reject)
                    .on('finish', resolve);
            });
            
            videoData.fileId = uploadStream.id;
            
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Failed to delete temp video file:', err);
            });
        }

        const submission = new Submission({
            exam: req.params.examId,
            student: req.user.id,
            answers,
            attempt,
            marks,
            passed,
            video: videoData
        });

        await submission.save();
        res.status(201).json(submission);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'You have already submitted this exam' });
        }
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// GET /submit/certificate/:submissionId -> Student/Admin downloads pass certificate as PDF
router.get('/certificate/:submissionId', authMiddleware, roleMiddleware(['Admin', 'Student']), async (req, res) => {
    try {
        const submission = await Submission.findById(req.params.submissionId)
            .populate('student', 'name email')
            .populate('exam', 'title totalMarks passPercentage passMarks');

        if (!submission) return res.status(404).json({ message: 'Submission not found' });
        if (req.user.role === 'Student' && String(submission.student?._id || submission.student) !== String(req.user.id)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        if (!submission.passed) {
            return res.status(400).json({ message: 'Certificate is available only for passed submissions.' });
        }

        const exam = submission.exam || {};
        const student = submission.student || {};
        const totalMarks = Number(exam.totalMarks) || 0;
        const marks = Number(submission.marks) || 0;
        const percentage = totalMarks > 0 ? ((marks / totalMarks) * 100) : 0;
        const passPct = typeof exam.passPercentage === 'number' && !Number.isNaN(exam.passPercentage)
            ? exam.passPercentage
            : (totalMarks > 0 && typeof exam.passMarks === 'number' ? (exam.passMarks / totalMarks) * 100 : 40);

        const safeStudent = String(student.name || 'Student').replace(/[^\w.\- ]/g, '_').trim() || 'Student';
        const safeExam = String(exam.title || 'Exam').replace(/[^\w.\- ]/g, '_').trim() || 'Exam';
        const filename = `Certificate_${safeStudent}_${safeExam}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margin: 50
        });
        doc.pipe(res);

        const width = doc.page.width;
        const height = doc.page.height;

        // Background
        doc.rect(0, 0, width, height).fill('#f8fafc');

        // Outer Border
        doc.rect(20, 20, width - 40, height - 40)
           .lineWidth(8)
           .stroke('#4f46e5');

        // Inner Border
        doc.rect(32, 32, width - 64, height - 64)
           .lineWidth(2)
           .stroke('#eab308');

        // Corner Decorations
        const decSize = 15;
        doc.rect(32, 32, decSize, decSize).fillAndStroke('#4f46e5', '#4f46e5');
        doc.rect(width - 32 - decSize, 32, decSize, decSize).fillAndStroke('#4f46e5', '#4f46e5');
        doc.rect(32, height - 32 - decSize, decSize, decSize).fillAndStroke('#4f46e5', '#4f46e5');
        doc.rect(width - 32 - decSize, height - 32 - decSize, decSize, decSize).fillAndStroke('#4f46e5', '#4f46e5');

        doc.moveDown(3);
        doc.font('Times-Bold')
           .fontSize(42)
           .fillColor('#1e3a8a')
           .text('CERTIFICATE OF ACHIEVEMENT', { align: 'center' });

        doc.moveDown(1.5);
        doc.font('Helvetica')
           .fontSize(14)
           .fillColor('#4b5563')
           .text('THIS PROUDLY CERTIFIES THAT', { align: 'center', characterSpacing: 2 });

        doc.moveDown(1);
        doc.font('Times-Italic')
           .fontSize(36)
           .fillColor('#111827')
           .text(String(student.name || 'Student'), { align: 'center' });

        const nameWidth = doc.widthOfString(String(student.name || 'Student'));
        doc.moveTo((width - nameWidth) / 2 - 20, doc.y + 5)
           .lineTo((width + nameWidth) / 2 + 20, doc.y + 5)
           .lineWidth(1)
           .stroke('#eab308');

        doc.moveDown(2);
        doc.font('Helvetica')
           .fontSize(14)
           .fillColor('#4b5563')
           .text('HAS SUCCESSFULLY COMPLETED AND PASSED THE EXAMINATION:', { align: 'center' });

        doc.moveDown(0.5);
        doc.font('Times-Bold')
           .fontSize(24)
           .fillColor('#1e3a8a')
           .text(String(exam.title || 'Exam'), { align: 'center' });

        doc.moveDown(2.5);
        const detailsY = doc.y;
        
        // Left Column (Date & Attempt)
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor('#111827');
        doc.text(`Date: ${new Date(submission.submittedAt || Date.now()).toLocaleDateString()}`, 100, detailsY + 15);
        doc.font('Helvetica').text(`Attempt: ${submission.attempt || 1}`, 100, detailsY + 35);

        // Center Column (Score box)
        doc.rect(width / 2 - 80, detailsY, 160, 60)
           .lineWidth(2)
           .stroke('#4f46e5')
           .fill('#ffffff'); // white box
        
        doc.font('Helvetica-Bold')
           .fontSize(14)
           .fillColor('#1e3a8a')
           .text(`Score: ${percentage.toFixed(1)}%`, width / 2 - 80, detailsY + 15, { width: 160, align: 'center' });
        doc.font('Helvetica')
           .fontSize(11)
           .fillColor('#4b5563')
           .text(`Marks: ${marks} / ${totalMarks}`, width / 2 - 80, detailsY + 35, { width: 160, align: 'center' });

        // Right Column (Signature Line)
        doc.moveTo(width - 250, detailsY + 40)
           .lineTo(width - 100, detailsY + 40)
           .lineWidth(1)
           .stroke('#111827');
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor('#111827')
           .text('Administrator Signature', width - 250, detailsY + 45, { width: 150, align: 'center' });

        // Footer
        doc.font('Helvetica-Oblique')
           .fontSize(10)
           .fillColor('#94a3b8')
           .text('Verified by ExaMinds Online Examination System', 0, height - 50, { align: 'center' });

        doc.end();
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /my-results -> Student
router.get('/my-results', authMiddleware, roleMiddleware(['Student']), async (req, res) => {
    try {
        const results = await Submission.find({ student: req.user.id })
            .populate('exam', 'title date duration passPercentage passMarks maxAttempts totalMarks questions.marks')
            .sort({ submittedAt: 1 });

        // Backfill totalMarks for older exams
        results.forEach((r) => {
            if (!r.exam.totalMarks || r.exam.totalMarks <= 0) {
                const qs = Array.isArray(r.exam.questions) ? r.exam.questions : [];
                r.exam.totalMarks = qs.reduce((sum, q) => sum + (parseInt(q.marks, 10) || 1), 0);
            }
        });
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
            .populate('exam', 'title date duration passPercentage passMarks maxAttempts totalMarks questions.marks')
            .populate('student', 'name email')
            .sort({ submittedAt: 1 });

        results.forEach((r) => {
            if (!r.exam.totalMarks || r.exam.totalMarks <= 0) {
                const qs = Array.isArray(r.exam.questions) ? r.exam.questions : [];
                r.exam.totalMarks = qs.reduce((sum, q) => sum + (parseInt(q.marks, 10) || 1), 0);
            }
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /submit/video/:submissionId -> Admin streams recorded exam video
router.get('/video/:submissionId', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const submission = await Submission.findById(req.params.submissionId).select('video');
        if (!submission || !submission.video) {
            return res.status(404).json({ message: 'Submission video not found' });
        }

        const { fileId, mimeType, path: relativePath, originalName } = submission.video;
        if (fileId) {
            if (!mongoose.connection.db) {
                return res.status(503).json({ message: 'Database not ready' });
            }

            const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'submissionVideos' });
            const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;

            const files = await bucket.find({ _id: objectId }).toArray();
            if (!files || files.length === 0) {
                return res.status(404).json({ message: 'Stored video file not found' });
            }

            const fileSize = files[0].length;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': mimeType || 'video/webm',
                });

                const readStream = bucket.openDownloadStream(objectId, { start, end: end + 1 });
                readStream.on('error', () => {
                    if (!res.headersSent) res.end();
                });
                return readStream.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': mimeType || 'video/webm',
                });
                const readStream = bucket.openDownloadStream(objectId);
                readStream.on('error', () => {
                    if (!res.headersSent) res.end();
                });
                return readStream.pipe(res);
            }
        }

        // Backward compatibility: stream legacy files stored on disk.
        if (relativePath) {
            const absolutePath = path.join(__dirname, '..', 'storage', relativePath);
            if (!fs.existsSync(absolutePath)) {
                return res.status(404).json({ message: 'Legacy video file not found' });
            }
            res.setHeader('Content-Type', mimeType || 'video/webm');
            if (originalName) {
                res.setHeader('Content-Disposition', `inline; filename="${String(originalName).replace(/"/g, '')}"`);
            }
            return fs.createReadStream(absolutePath).pipe(res);
        }

        return res.status(404).json({ message: 'Submission video not found' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
