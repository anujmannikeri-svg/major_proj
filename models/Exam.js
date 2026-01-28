const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    duration: { type: Number, required: true }, // in minutes
    maxAttempts: { type: Number, default: 1 },
    passMarks: { type: Number, default: 0 },
    allowResume: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
