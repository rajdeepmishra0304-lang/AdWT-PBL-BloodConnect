/**
 * BloodConnect - Authentication Routes
 * Architecture: Rate-limited authentication entry points, Session verification,
 * and Server-side token invalidation.
 */

const express = require('express');
const router = express.Router();
const { register, login, getMe, logout } = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimitMiddleware');

// Public authentication endpoints with rate limiting
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);

// Protected session validation and logout endpoints
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

module.exports = router;
