const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    answers: [mongoose.Schema.Types.Mixed], // chosen options or text answers
    attempt: { type: Number, default: 1 },
    marks: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    // Recorded verification video for the attempt.
    // New submissions store files in MongoDB GridFS and save fileId metadata here.
    video: {
        fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
        path: { type: String, default: null },
        mimeType: { type: String, default: null },
        originalName: { type: String, default: null },
        size: { type: Number, default: null }
    },
    submittedAt: { type: Date, default: Date.now }
});

// Ensure one document per (exam, student, attempt)
submissionSchema.index({ exam: 1, student: 1, attempt: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);
