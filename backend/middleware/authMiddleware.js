const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Middleware to check if user is authorized
const isAuthorized = async (req, res, next) => {
    try {
        // Try to get token from Authorization header first (Bearer token)
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
        
        // Fallback to cookies if no Authorization header
        if (!token) {
            const cookies = req.cookies || {};
            token = cookies.token;
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Please log in first.' });
        }

        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

        const user = await userRepository.findById(decodedToken.id);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('Error in isAuthorized middleware:', error.message);
        return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    try {
        const { user } = req;

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not authenticated.' });
        }

        if (user.role !== 1) {
            return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
        }

        next();
    } catch (error) {
        logger.error('Error in isAdmin middleware:', error.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

module.exports = {
    isAuthorized,
    isAdmin,
};
