const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    duration: { type: Number, required: true }, // in minutes
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    questions: [{
        questionText: String,
        options: [String],
        correctAnswer: Number // index of options
    }]
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);
