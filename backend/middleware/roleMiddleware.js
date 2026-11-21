/**
 * BloodConnect - Role-Based Access Control (RBAC) Middleware
 * Architecture: Least Privilege Access Principle, Verification Gates, and Facility Affiliation Checks
 */

const { pool } = require('../config/db');

/**
 * Higher-order middleware factory to enforce role-based permissions
 * @param  {...string} allowedRoles - Array of allowed roles: 'donor', 'seeker', 'hospital', 'admin'
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // 1. Guard check: ensure authMiddleware has run first
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User authentication required prior to role verification.'
      });
    }

    // 2. Normalize and compare role
    const userRole = req.user.role.toLowerCase();
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access denied. Role '${userRole}' does not have sufficient permissions.`
      });
    }

    next();
  };
};

/**
 * Middleware to enforce account verification status (e.g. for donor dispatch responses, hospital actions)
 */
const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: User authentication required.'
    });
  }

  if (req.user.is_verified !== 1) {
    return res.status(403).json({
      success: false,
      message: 'Action restricted: Your account is currently pending compliance verification by administrators.'
    });
  }

  next();
};

/**
 * Middleware to verify that a hospital account is affiliated with an active registered hospital
 */
const requireHospitalAffiliation = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Authentication required.' });
  }

  // Admins bypass hospital affiliation check
  if (req.user.role === 'admin') {
    return next();
  }

  if (req.user.role === 'hospital') {
    if (!req.user.hospital_facility_id) {
      return res.status(403).json({
        success: false,
        message: 'Hospital account is not associated with an accredited hospital facility. Please contact administrator.'
      });
    }

    const [rows] = await pool.query(
      "SELECT id, name, is_active FROM verified_hospitals_doctors WHERE id = ? AND entity_type = 'hospital' LIMIT 1",
      [req.user.hospital_facility_id]
    );

    if (rows.length === 0 || rows[0].is_active !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Affiliated hospital record is inactive or unverified.'
      });
    }
  }

  next();
};

module.exports = {
  authorizeRoles,
  requireVerified,
  requireHospitalAffiliation
};
