/**
 * BloodConnect - Donor Controller
 * Architecture: Health eligibility checks, Aadhar masking, Document verification,
 * Cooldown calculation, Availability management, and Public donor discovery.
 * 
 * Medical Scope Notice:
 * Age, weight, and 90-day cooldown checks implemented here are preliminary application-level
 * screening filters. They do not constitute a complete clinical assessment or certify donors
 * medically. All blood transfusions require on-site clinical screening, hemoglobin testing,
 * and serological cross-matching at an authorized blood bank or hospital.
 */

const { pool } = require('../config/db');
const { cleanupRequestFiles } = require('../middleware/uploadMiddleware');
const { calculateDistanceKm, HAVERSINE_SQL_FRAGMENT } = require('../utils/geoUtils');

// Valid blood groups & genders
const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_GENDERS = ['male', 'female', 'other'];

/**
 * Validates whether a string is a valid ISO calendar date (YYYY-MM-DD)
 * @param {string} dateString 
 * @returns {Date|null} Date object if valid, null otherwise
 */
const parseValidCalendarDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const match = dateString.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const dateObj = new Date(year, month - 1, day);
  // Check rollover (e.g. Feb 31 -> Mar 3)
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    return null;
  }

  return dateObj;
};

/**
 * Calculate age in full years from a verified birth Date object
 * @param {Date} birthDate 
 * @returns {number} Age in full years
 */
const calculateAge = (birthDate) => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

/**
 * Mask 12-digit Aadhar number into XXXXXXXX1234
 * @param {string} aadhar 
 * @returns {string} Masked Aadhar string
 */
const maskAadhar = (aadhar) => {
  if (!aadhar || typeof aadhar !== 'string') {
    throw new Error('Aadhar number must be provided as a string.');
  }
  const cleaned = aadhar.replace(/[\s-]/g, '');
  if (cleaned.length !== 12 || !/^\d{12}$/.test(cleaned)) {
    throw new Error('Aadhar number must be exactly 12 digits.');
  }
  return 'XXXXXXXX' + cleaned.substring(8);
};

/**
 * Onboard a donor with health eligibility, KYC, and document uploads
 * Route: POST /api/donors/onboard
 */
const onboardDonor = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const {
      blood_group,
      date_of_birth,
      dob,
      gender,
      weight_kg,
      city,
      area,
      state,
      latitude,
      longitude,
      aadhar_number,
      background_declaration,
      background_check_consent,
      last_donation_date
    } = req.body;

    const rawDob = date_of_birth || dob;
    const resolvedGender = (gender || 'other').toLowerCase().trim();
    const resolvedArea = area || state || '';
    const resolvedBackground = background_declaration !== undefined ? background_declaration : background_check_consent;

    // 1. Check if user already completed onboarding
    const [existing] = await connection.query(
      'SELECT id, is_verified FROM donors WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (existing.length > 0) {
      cleanupRequestFiles(req);
      return res.status(409).json({
        success: false,
        message: 'A donor profile has already been submitted for this account.'
      });
    }

    // 2. Validate uploaded documents
    if (!req.files || !req.files.id_proof || req.files.id_proof.length === 0) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Government identity proof (id_proof) document is required for verification.'
      });
    }

    const idDocumentPath = req.files.id_proof[0].filename || req.files.id_proof[0].path;
    const medicalDocumentPath = req.files.medical_record && req.files.medical_record.length > 0
      ? (req.files.medical_record[0].filename || req.files.medical_record[0].path)
      : null;

    // 3. Health eligibility: Strict Date of Birth check (18 - 65 years)
    const birthDateObj = parseValidCalendarDate(rawDob);
    if (!birthDateObj) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Valid date of birth in YYYY-MM-DD format is required.'
      });
    }

    if (birthDateObj > new Date()) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Date of birth cannot be in the future.'
      });
    }

    const age = calculateAge(birthDateObj);
    if (isNaN(age) || age < 18 || age > 65) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: `Medical eligibility requirement failed: Donors must be between 18 and 65 years of age (Calculated age: ${age}).`
      });
    }

    // 4. Health eligibility: Weight check (>= 45.0 kg per national guidelines)
    const weight = parseFloat(weight_kg);
    if (isNaN(weight) || weight < 45.0 || weight > 250.0) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Medical eligibility requirement failed: Donors must weigh at least 45.0 kg for safe blood donation.'
      });
    }

    // 5. Blood group and gender validation
    const normalizedBlood = (blood_group || '').toUpperCase().trim();
    if (!VALID_BLOOD_GROUPS.includes(normalizedBlood)) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: `Invalid blood group. Permitted values: ${VALID_BLOOD_GROUPS.join(', ')}`
      });
    }

    if (!VALID_GENDERS.includes(resolvedGender)) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: `Invalid gender. Permitted values: ${VALID_GENDERS.join(', ')}`
      });
    }

    // 6. Coordinates & Location check
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Valid latitude (-90 to 90) and longitude (-180 to 180) coordinates are required for proximity matching.'
      });
    }

    if (!city || typeof city !== 'string' || city.trim().length === 0) {
      cleanupRequestFiles(req);
      return res.status(400).json({ success: false, message: 'City is required.' });
    }

    // 7. Background declaration check
    const isCleanBackground = resolvedBackground === 'true' || resolvedBackground === true || resolvedBackground === '1' || resolvedBackground === 1;
    if (!isCleanBackground) {
      cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: 'You must confirm the self-declaration confirming no criminal record or unlawful blood commercialization.'
      });
    }

    // 8. Mask Aadhar
    let maskedAadhar;
    try {
      maskedAadhar = maskAadhar(aadhar_number || '');
    } catch (aadharErr) {
      cleanupRequestFiles(req);
      return res.status(400).json({ success: false, message: aadharErr.message });
    }

    // 9. Cooldown computation from last donation date
    let cooldownUntil = null;
    let formattedLastDonation = null;
    if (last_donation_date && String(last_donation_date).trim()) {
      const donationDateObj = parseValidCalendarDate(String(last_donation_date).trim());
      if (!donationDateObj) {
        cleanupRequestFiles(req);
        return res.status(400).json({
          success: false,
          message: 'Invalid last donation date format. Please use YYYY-MM-DD.'
        });
      }

      if (donationDateObj > new Date()) {
        cleanupRequestFiles(req);
        return res.status(400).json({
          success: false,
          message: 'Last donation date cannot be in the future.'
        });
      }

      formattedLastDonation = donationDateObj.toISOString().split('T')[0];
      // Mandatory 90-day cooldown interval
      cooldownUntil = new Date(donationDateObj);
      cooldownUntil.setDate(cooldownUntil.getDate() + 90);
    }

    // 10. Execute Transaction
    await connection.beginTransaction();

    const formattedDobStr = birthDateObj.toISOString().split('T')[0];
    const initialAvailability = cooldownUntil && cooldownUntil > new Date() ? 'cooldown' : 'busy';

    const [donorInsert] = await connection.query(
      `INSERT INTO donors 
       (user_id, blood_group, date_of_birth, gender, weight_kg, city, area, latitude, longitude, availability_status, is_verified, last_donation_date, cooldown_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        userId,
        normalizedBlood,
        formattedDobStr,
        resolvedGender,
        weight,
        city.trim(),
        resolvedArea ? resolvedArea.trim() : null,
        lat,
        lng,
        initialAvailability,
        formattedLastDonation,
        cooldownUntil
      ]
    );

    const donorId = donorInsert.insertId;

    await connection.query(
      `INSERT INTO donor_verifications
       (donor_id, aadhar_masked, id_document_path, medical_document_path, background_declaration, status)
       VALUES (?, ?, ?, ?, 1, 'pending')`,
      [
        donorId,
        maskedAadhar,
        idDocumentPath,
        medicalDocumentPath
      ]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Donor profile and verification documents submitted successfully. Account is pending admin compliance audit.',
      donor: {
        id: donorId,
        user_id: userId,
        blood_group: normalizedBlood,
        city: city.trim(),
        area: resolvedArea ? resolvedArea.trim() : null,
        availability_status: initialAvailability,
        is_verified: 0,
        aadhar_masked: maskedAadhar,
        verification_status: 'pending',
        cooldown_until: cooldownUntil
      }
    });

  } catch (error) {
    await connection.rollback();
    cleanupRequestFiles(req);
    console.error('[Donor Onboard Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during donor onboarding.'
    });
  } finally {
    connection.release();
  }
};

/**
 * Retrieve detailed donor profile & verification history
 * Route: GET /api/donors/profile
 */
const getDonorProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const [donorRows] = await pool.query(
      `SELECT d.*, u.full_name, u.email, u.phone 
       FROM donors d
       JOIN users u ON d.user_id = u.id
       WHERE d.user_id = ? LIMIT 1`,
      [userId]
    );

    if (donorRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Donor profile not found. Please complete donor onboarding.'
      });
    }

    const donor = donorRows[0];

    // Fetch verification record
    const [verifications] = await pool.query(
      `SELECT id, aadhar_masked, status, admin_remarks, submitted_at, reviewed_at 
       FROM donor_verifications 
       WHERE donor_id = ? 
       ORDER BY submitted_at DESC LIMIT 1`,
      [donor.id]
    );

    const verification = verifications.length > 0 ? verifications[0] : null;

    // Check count of total completed donations
    const [historyRows] = await pool.query(
      'SELECT COUNT(*) AS total_donations FROM donations_history WHERE donor_id = ?',
      [donor.id]
    );
    const totalDonations = historyRows[0] ? historyRows[0].total_donations : 0;

    // Check if cooldown is currently active
    const now = new Date();
    const isCoolingDown = donor.cooldown_until && new Date(donor.cooldown_until) > now;

    return res.status(200).json({
      success: true,
      donor: {
        ...donor,
        name: donor.full_name,
        state: donor.area || '',
        total_donations: totalDonations,
        last_donated_at: donor.last_donation_date,
        verification,
        is_in_cooldown: isCoolingDown
      }
    });

  } catch (error) {
    console.error('[Get Donor Profile Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving donor profile.'
    });
  }
};

/**
 * Toggle donor availability status (available / busy)
 * Route: PATCH /api/donors/availability
 */
const toggleAvailability = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.body;

    if (!status || !['available', 'busy'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'available' or 'busy'."
      });
    }

    // Retrieve donor record
    const [donorRows] = await pool.query(
      'SELECT id, is_verified, availability_status, cooldown_until FROM donors WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (donorRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Donor profile not found.'
      });
    }

    const donor = donorRows[0];

    // Business Rule 1: Cannot mark available if account is unverified by admin
    if (status === 'available' && donor.is_verified !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot toggle availability: Your profile is currently pending administrator verification.'
      });
    }

    // Business Rule 2: Cannot mark available if under active 90-day cooldown
    if (status === 'available' && donor.cooldown_until) {
      const cooldownDate = new Date(donor.cooldown_until);
      const now = new Date();
      if (cooldownDate > now) {
        const remainingDays = Math.ceil((cooldownDate - now) / (1000 * 60 * 60 * 24));
        return res.status(400).json({
          success: false,
          message: `Cannot toggle availability: You are in mandatory medical cooldown for ${remainingDays} more day(s) until ${cooldownDate.toLocaleDateString()}.`
        });
      }
    }

    // Update availability
    await pool.query(
      'UPDATE donors SET availability_status = ? WHERE id = ?',
      [status, donor.id]
    );

    return res.status(200).json({
      success: true,
      message: `Availability updated to '${status}'.`,
      availability_status: status
    });

  } catch (error) {
    console.error('[Toggle Availability Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error updating availability.'
    });
  }
};

/**
 * Public Donor Search — no authentication required
 * Route: GET /api/donors/public-search?blood_group=A%2B&city=Indore&lat=22.7&lng=75.8
 * Returns anonymised list (NO PII: no names, no phone numbers, no exact street addresses)
 * of available, verified donors.
 */
const publicDonorSearch = async (req, res) => {
  try {
    const { blood_group, city, lat, lng } = req.query;

    const queryParams = [];
    let distanceSelect = 'NULL AS distance_km';
    let orderByClause = 'd.city ASC';

    const hasCoords = lat !== undefined && lng !== undefined && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng));
    if (hasCoords) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      distanceSelect = `${HAVERSINE_SQL_FRAGMENT} AS distance_km`;
      queryParams.push(userLat, userLng, userLat);
      orderByClause = 'distance_km ASC';
    }

    let query = `
      SELECT
        d.id AS donor_ref,
        d.blood_group,
        d.city,
        d.area,
        ${distanceSelect}
      FROM donors d
      WHERE d.is_verified = 1
        AND d.availability_status = 'available'
        AND (d.cooldown_until IS NULL OR d.cooldown_until <= NOW())
    `;

    if (blood_group && VALID_BLOOD_GROUPS.includes(blood_group.toUpperCase().trim())) {
      query += ' AND d.blood_group = ?';
      queryParams.push(blood_group.toUpperCase().trim());
    }

    if (city && typeof city === 'string' && city.trim().length > 0) {
      query += ' AND (d.city LIKE ? OR d.area LIKE ?)';
      queryParams.push(`%${city.trim()}%`, `%${city.trim()}%`);
    }

    query += ` ORDER BY ${orderByClause} LIMIT 50`;

    const [rows] = await pool.query(query, queryParams);

    const formattedDonors = rows.map(r => ({
      blood_group: r.blood_group,
      city: r.city,
      area: r.area || 'Metro Area',
      state: r.area || '',
      distance_km: r.distance_km !== null ? parseFloat(r.distance_km) : null
    }));

    return res.status(200).json({
      success: true,
      count: formattedDonors.length,
      donors: formattedDonors
    });

  } catch (error) {
    console.error('[Public Donor Search Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error processing donor search.'
    });
  }
};

/**
 * Public Statistics Endpoint for landing page counters
 * Route: GET /api/donors/public-stats
 */
const getPublicPlatformStats = async (req, res) => {
  try {
    const [donorCounts] = await pool.query(
      `SELECT 
         COUNT(*) AS total_verified_donors,
         SUM(CASE WHEN availability_status = 'available' THEN 1 ELSE 0 END) AS available_donors
       FROM donors WHERE is_verified = 1`
    );

    const [reqCounts] = await pool.query(
      `SELECT 
         COUNT(*) AS total_requests,
         SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END) AS total_fulfilled_requests
       FROM blood_requests`
    );

    const [facCounts] = await pool.query(
      "SELECT COUNT(*) AS total_facilities FROM verified_hospitals_doctors WHERE is_active = 1"
    );

    const totalVerified = donorCounts[0] ? (donorCounts[0].total_verified_donors || 0) : 0;
    const available = donorCounts[0] ? (donorCounts[0].available_donors || 0) : 0;
    const totalRequests = reqCounts[0] ? (reqCounts[0].total_requests || 0) : 0;
    const totalFulfilled = reqCounts[0] ? (reqCounts[0].total_fulfilled_requests || 0) : 0;
    const totalFacilities = facCounts[0] ? (facCounts[0].total_facilities || 0) : 0;

    return res.status(200).json({
      success: true,
      total_verified_donors: totalVerified,
      available_donors: available,
      total_requests: totalRequests,
      total_fulfilled_requests: totalFulfilled,
      total_facilities: totalFacilities
    });

  } catch (error) {
    console.error('[Public Stats Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error calculating platform stats.'
    });
  }
};

module.exports = {
  onboardDonor,
  getDonorProfile,
  toggleAvailability,
  publicDonorSearch,
  getPublicPlatformStats,
  calculateAge,
  maskAadhar,
  parseValidCalendarDate
};
