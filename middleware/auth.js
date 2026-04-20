const jwt = require('jsonwebtoken');

const ADMIN_EMAIL = 'admin@gmail.com';

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

const roleMiddleware = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied: insufficient permissions' });
        }

        // Admin module hard restriction: only admin@gmail.com is allowed to use Admin routes.
        if (req.user.role === 'Admin') {
            if (!req.user.email || String(req.user.email).toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
                return res.status(403).json({ message: 'Admin login is restricted.' });
            }
        }

        next();
    };
};

module.exports = { authMiddleware, roleMiddleware };
