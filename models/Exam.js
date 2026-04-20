const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, default: 'General' },
    moduleType: {
        type: String,
        enum: ['Regular', 'Expert'],
        default: 'Regular'
    },
    isApproved: { type: Boolean, default: true },
    date: { type: Date, required: true },
    duration: { type: Number, required: true }, // in minutes
    maxAttempts: { type: Number, default: 1 },
    // Minimum percentage (0–100) of total marks required to pass. Replaces legacy passMarks.
    passPercentage: { type: Number, default: 40, min: 0, max: 100 },
    /** @deprecated Legacy absolute pass marks; used only if passPercentage is missing (derived as passMarks/totalMarks). */
    passMarks: { type: Number },
    totalMarks: { type: Number, default: 0 },
    allowResume: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Track when Admin saved corrected questions for an Expert module draft.
    // Admin must save corrections before the exam can be approved (published).
    adminCorrectionsSubmittedAt: { type: Date, default: null },
    questions: [{
        questionText: String,
        options: [String],
        correctAnswer: Number, // index of options for MCQ/TrueFalse
        type: {
            type: String,
            enum: ['MCQ', 'TrueFalse', 'ShortAnswer'],
            default: 'MCQ'
        },
        marks: { type: Number, default: 1 },
        correctTextAnswer: String // for short answer questions
    }]
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);
