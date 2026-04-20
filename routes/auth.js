const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin@123';
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// POST /auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        // Normalize role
        let userRole = 'Student';
        if (role && typeof role === 'string' && role.toLowerCase() === 'admin') {
            return res.status(400).json({ message: 'Admin account cannot be created. Use the admin login credentials.' });
        }
        if (role && typeof role === 'string' && role.toLowerCase() === 'expert') userRole = 'Expert';

        user = new User({ name, email, password, role: userRole });
        await user.save();

        // Experts require admin approval before they can login/access the Expert module.
        if (user.role === 'Expert' && !user.isExpertApproved) {
            return res.status(201).json({
                requiresApproval: true,
                message: 'Expert account created. Admin approval is required to login.'
            });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role, email: user.email, isExpertApproved: user.isExpertApproved },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );
        res.status(201).json({ token, user: { id: user._id, name, email, role: user.role } });
    } catch (err) {
        console.error('Signup Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// POST /auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        // Enforce fixed admin password even if DB data gets modified.
        if (String(email).toLowerCase() === ADMIN_EMAIL.toLowerCase() && password !== ADMIN_PASSWORD) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        // Hard restriction: the Admin module can be accessed only by fixed credentials.
        if (user.role === 'Admin') {
            if (String(user.email).toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
                return res.status(403).json({ message: 'Admin login is restricted.' });
            }
        } else if (String(user.email).toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            // If the admin email exists but role got modified, force admin role.
            user.role = 'Admin';
            await user.save();
        }

        // Experts must be approved by Admin before they can access Expert module
        if (user.role === 'Expert' && !user.isExpertApproved) {
            return res.status(403).json({ message: 'Admin approval required to access Expert module' });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role, email: user.email, isExpertApproved: user.isExpertApproved },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// GET /auth/experts/pending -> Admin gets pending expert accounts
router.get('/experts/pending', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const experts = await User.find({ role: 'Expert', isExpertApproved: false }).select('name email isExpertApproved');
        res.json(experts);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /auth/experts/:id/approve -> Admin approves expert account
router.patch('/experts/:id/approve', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const expert = await User.findById(req.params.id);
        if (!expert) return res.status(404).json({ message: 'Expert user not found' });
        if (expert.role !== 'Expert') return res.status(400).json({ message: 'Not an expert account' });
        expert.isExpertApproved = true;
        await expert.save();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /auth/password-reset/request -> Student/Expert requests admin approval to reset password
router.post('/password-reset/request', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const normalizedEmail = String(email).trim();
        const user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' } });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role === 'Admin') return res.status(400).json({ message: 'Admin password reset is restricted.' });

        user.passwordResetRequested = true;
        user.passwordResetApproved = false;
        user.passwordResetRequestedAt = new Date();
        user.passwordResetApprovedAt = null;
        await user.save();

        res.json({ ok: true, message: 'Password reset request sent. Wait for admin approval.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /auth/password-resets/pending -> Admin sees pending reset requests
router.get('/password-resets/pending', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const users = await User.find({ passwordResetRequested: true, passwordResetApproved: false, role: { $in: ['Student', 'Expert'] } })
            .select('name email role passwordResetRequestedAt');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// PATCH /auth/password-resets/:id/approve -> Admin approves reset request
router.patch('/password-resets/:id/approve', authMiddleware, roleMiddleware(['Admin']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role === 'Admin') return res.status(400).json({ message: 'Admin password reset is restricted.' });
        if (!user.passwordResetRequested) return res.status(400).json({ message: 'No reset request found for this user.' });

        user.passwordResetApproved = true;
        user.passwordResetApprovedAt = new Date();
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /auth/password-reset/confirm -> Student/Expert updates password after admin approval
router.post('/password-reset/confirm', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        if (!email || !newPassword) return res.status(400).json({ message: 'Email and new password are required' });
        if (String(newPassword).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

        const normalizedEmail = String(email).trim();
        const user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' } });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role === 'Admin') return res.status(400).json({ message: 'Admin password reset is restricted.' });
        if (!user.passwordResetRequested) return res.status(400).json({ message: 'Reset not requested. Please request first.' });
        if (!user.passwordResetApproved) return res.status(403).json({ message: 'Admin approval required before password reset.' });

        user.password = newPassword;
        user.passwordResetRequested = false;
        user.passwordResetApproved = false;
        user.passwordResetRequestedAt = null;
        user.passwordResetApprovedAt = null;
        await user.save();

        res.json({ ok: true, message: 'Password updated successfully. Please login.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
