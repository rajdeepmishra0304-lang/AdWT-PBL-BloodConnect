/**
 * BloodConnect - Authentication Controller
 * Architecture: Bcrypt password hashing, Strict input validation, JWT token issuance,
 * Public role restriction, and Server-Side Token Revocation (Logout).
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');

// Strictly permitted public registration roles.
// SECURITY RULE: 'admin' is explicitly excluded from public registration.
const PUBLIC_REGISTRATION_ROLES = ['donor', 'seeker', 'hospital'];

/**
 * Helper to generate JWT Token
 * @param {Object} user 
 * @returns {string} JWT Token
 */
const generateToken = (user) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is missing.');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      is_verified: user.is_verified
    },
    jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
};

/**
 * Register a new user
 * Route: POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { full_name, name, email, phone, password, role, hospital_facility_id } = req.body;
    
    // 1. Type validation
    if (
      (full_name !== undefined && typeof full_name !== 'string') ||
      (name !== undefined && typeof name !== 'string') ||
      typeof email !== 'string' ||
      typeof phone !== 'string' ||
      typeof password !== 'string' ||
      typeof role !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload: All input fields must be valid strings.'
      });
    }

    const resolvedName = (full_name || name || '').trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    const normalizedRole = role.toLowerCase().trim();

    // 2. Validate mandatory fields and lengths
    if (!resolvedName || !cleanEmail || !cleanPhone || !password || !normalizedRole) {
      return res.status(400).json({
        success: false,
        message: 'All fields (name/full_name, email, phone, password, role) are required.'
      });
    }

    if (resolvedName.length < 2 || resolvedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be between 2 and 100 characters.'
      });
    }

    // 3. CRITICAL SECURITY: Block public admin registration
    if (normalizedRole === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Administrator accounts cannot be created through public registration. Contact system owner.'
      });
    }

    if (!PUBLIC_REGISTRATION_ROLES.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Permitted public roles: ${PUBLIC_REGISTRATION_ROLES.join(', ')}`
      });
    }

    // 4. Email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail) || cleanEmail.length > 150) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address (max 150 characters).'
      });
    }

    // 5. Phone format check (Indian/standard mobile: 10-15 digits)
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10 to 15-digit phone number.'
      });
    }

    // 6. Strong password policy: min 8 characters, at least 1 letter and 1 number
    if (password.length < 8 || !/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long and contain both letters and numbers.'
      });
    }

    // 7. Hospital role verification requirement
    let parsedHospitalId = null;
    if (normalizedRole === 'hospital') {
      if (!hospital_facility_id) {
        return res.status(400).json({
          success: false,
          message: 'Hospital accounts must provide a valid accredited hospital_facility_id.'
        });
      }
      parsedHospitalId = parseInt(hospital_facility_id, 10);
      if (isNaN(parsedHospitalId) || parsedHospitalId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid hospital_facility_id.'
        });
      }

      // Verify facility exists in accredited registry
      const [facRows] = await pool.query(
        "SELECT id, is_active FROM verified_hospitals_doctors WHERE id = ? AND entity_type = 'hospital' LIMIT 1",
        [parsedHospitalId]
      );
      if (facRows.length === 0 || facRows[0].is_active !== 1) {
        return res.status(400).json({
          success: false,
          message: 'The selected hospital facility is not registered or currently inactive.'
        });
      }
    }

    // 8. Check for existing email or phone
    const [existing] = await pool.query(
      'SELECT id, email, phone FROM users WHERE email = ? OR phone = ? LIMIT 1',
      [cleanEmail, cleanPhone]
    );

    if (existing.length > 0) {
      const conflictField = existing[0].email === cleanEmail ? 'email' : 'phone number';
      return res.status(409).json({
        success: false,
        message: `An account with this ${conflictField} already exists.`
      });
    }

    // 9. Hash password with bcrypt (10 rounds)
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Initial verification state: Seekers are auto-verified; Donors & Hospitals require compliance review
    const is_verified = normalizedRole === 'seeker' ? 1 : 0;

    // 10. Insert new user into database
    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, is_verified, hospital_facility_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [resolvedName, cleanEmail, cleanPhone, password_hash, normalizedRole, is_verified, parsedHospitalId]
    );

    const newUser = {
      id: result.insertId,
      full_name: resolvedName,
      name: resolvedName,
      email: cleanEmail,
      phone: cleanPhone,
      role: normalizedRole,
      is_verified,
      hospital_facility_id: parsedHospitalId
    };

    // 11. Issue JWT token
    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: newUser
    });

  } catch (error) {
    console.error('[Register Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration.'
    });
  }
};

/**
 * Login user
 * Route: POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate inputs
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid email and password are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 2. Fetch user by email
    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone, password_hash, role, is_verified, hospital_facility_id FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = rows[0];

    // 3. Compare password hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // 4. If donor, retrieve donor-specific profile if it exists
    let donorProfile = null;
    if (user.role === 'donor') {
      const [donorRows] = await pool.query(
        `SELECT id, blood_group, city, area, availability_status, is_verified, cooldown_until, last_donation_date 
         FROM donors WHERE user_id = ? LIMIT 1`,
        [user.id]
      );
      if (donorRows.length > 0) {
        donorProfile = donorRows[0];
      }
    }

    // 5. Generate token
    const token = generateToken(user);

    // Exclude password_hash from response
    delete user.password_hash;

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        ...user,
        name: user.full_name,
        donorProfile
      }
    });

  } catch (error) {
    console.error('[Login Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.'
    });
  }
};

/**
 * Get current authenticated user session & profile
 * Route: GET /api/auth/me (Protected by authenticate middleware)
 */
const getMe = async (req, res) => {
  try {
    const user = { ...req.user };
    let donorProfile = null;

    if (user.role === 'donor') {
      const [donorRows] = await pool.query(
        `SELECT id, blood_group, city, area, availability_status, is_verified, cooldown_until, last_donation_date 
         FROM donors WHERE user_id = ? LIMIT 1`,
        [user.id]
      );
      if (donorRows.length > 0) {
        donorProfile = donorRows[0];
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        name: user.full_name,
        donorProfile
      }
    });
  } catch (error) {
    console.error('[GetMe Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching user profile.'
    });
  }
};

/**
 * Logout current user & revoke active JWT on the server
 * Route: POST /api/auth/logout (Protected by authenticate middleware)
 */
const logout = async (req, res) => {
  try {
    const token = req.token;
    const tokenHash = req.tokenHash || crypto.createHash('sha256').update(token).digest('hex');
    const userId = req.user.id;

    // Decode token to extract exact expiration timestamp
    const decoded = jwt.decode(token);
    const expiresAt = decoded && decoded.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Insert into token_blacklist table
    await pool.query(
      `INSERT INTO token_blacklist (token_hash, user_id, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)`,
      [tokenHash, userId, expiresAt]
    );

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully. Session token has been invalidated on the server.'
    });
  } catch (error) {
    console.error('[Logout Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during logout.'
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  logout,
  generateToken
};
