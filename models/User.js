const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Student', 'Expert'], default: 'Student' },
    // Experts must be approved by Admin before they can access Expert module
    isExpertApproved: { type: Boolean, default: false },
    passwordResetRequested: { type: Boolean, default: false },
    passwordResetApproved: { type: Boolean, default: false },
    passwordResetRequestedAt: { type: Date, default: null },
    passwordResetApprovedAt: { type: Date, default: null }
});

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model('User', userSchema);
