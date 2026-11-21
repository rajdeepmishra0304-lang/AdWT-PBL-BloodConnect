/**
 * BloodConnect - Authentication Middleware
 * Architecture: JWT Token verification with explicit algorithm whitelisting,
 * database token revocation checking, and req.user context injection.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');

/**
 * Middleware to authenticate requests via JWT Bearer Token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // 1. Check for presence of Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: No Bearer token provided in Authorization header.'
      });
    }

    // 2. Extract token
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: Token missing.'
      });
    }

    // 3. Ensure JWT_SECRET is configured in environment
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[CRITICAL] JWT_SECRET is not configured in environment.');
      return res.status(500).json({
        success: false,
        message: 'Internal server configuration error.'
      });
    }

    // 4. Check if token is revoked in token_blacklist
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [revoked] = await pool.query(
      'SELECT id FROM token_blacklist WHERE token_hash = ? LIMIT 1',
      [tokenHash]
    );

    if (revoked.length > 0) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: Token has been revoked. Please log in again.'
      });
    }

    // 5. Verify JWT cryptographic signature with strict algorithm restriction
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256']
      });
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Authentication failed: Session token has expired. Please log in again.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: Invalid or tampered token.'
      });
    }

    // 6. Verify user still exists in database and fetch fresh state
    const [users] = await pool.query(
      'SELECT id, full_name, email, phone, role, is_verified, hospital_facility_id FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: The user account associated with this token no longer exists.'
      });
    }

    // 7. Attach user and raw token to request context
    req.user = users[0];
    req.token = token;
    req.tokenHash = tokenHash;
    next();

  } catch (error) {
    console.error('[Auth Middleware Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication verification.'
    });
  }
};

module.exports = {
  authenticate
};
