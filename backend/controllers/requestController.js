/**
 * BloodConnect - Emergency Blood Request Controller
 * Architecture: Requisition intake, Prescriptions handling, Cross-checking, Status lifecycles,
 * Strict location validation, and Transactional deletion protection.
 */

const { pool } = require('../config/db');
const { crossCheckFacility } = require('../utils/validatorUtils');
const { deleteFileSafe } = require('../middleware/uploadMiddleware');

const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_URGENCIES = ['critical', 'urgent', 'normal'];

/**
 * Validates integer strictly (rejects '2abc', '2.5', NaN)
 * @param {*} val 
 * @returns {number|null}
 */
const parseStrictPositiveInt = (val) => {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) return null;
  const num = parseInt(str, 10);
  return num > 0 ? num : null;
};

/**
 * Create an emergency blood request
 * Route: POST /api/requests/create
 * Middleware: authenticate, authorizeRoles('seeker', 'hospital'), uploadPrescription
 */
const createBloodRequest = async (req, res) => {
  try {
    const seekerId = req.user.id;
    const userRole = req.user.role;
    const {
      patient_name,
      blood_group,
      blood_group_needed,
      units_required,
      units_needed,
      urgency,
      urgency_level,
      hospital_name,
      doctor_name,
      doctor_license,
      city,
      latitude,
      longitude
    } = req.body;

    const rawUnits = units_required !== undefined ? units_required : units_needed;
    const resolvedUnits = parseStrictPositiveInt(rawUnits);
    const resolvedBlood = (blood_group || blood_group_needed || '').toUpperCase().trim();
    const resolvedUrgency = (urgency || urgency_level || 'urgent').toLowerCase().trim();

    // 1. Mandatory input checks
    if (!patient_name || typeof patient_name !== 'string' || patient_name.trim().length < 2) {
      if (req.file) deleteFileSafe(req.file.path || req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'Patient name must be a valid string of at least 2 characters.'
      });
    }

    if (!resolvedBlood || !VALID_BLOOD_GROUPS.includes(resolvedBlood)) {
      if (req.file) deleteFileSafe(req.file.path || req.file.filename);
      return res.status(400).json({
        success: false,
        message: `Invalid blood group. Permitted values: ${VALID_BLOOD_GROUPS.join(', ')}`
      });
    }

    if (!resolvedUnits || resolvedUnits < 1 || resolvedUnits > 20) {
      if (req.file) deleteFileSafe(req.file.path || req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'Units required must be an integer between 1 and 20.'
      });
    }

    if (!VALID_URGENCIES.includes(resolvedUrgency)) {
      if (req.file) deleteFileSafe(req.file.path || req.file.filename);
      return res.status(400).json({
        success: false,
        message: `Invalid urgency level. Permitted values: ${VALID_URGENCIES.join(', ')}`
      });
    }

    if (!hospital_name || typeof hospital_name !== 'string' || !hospital_name.trim()) {
      if (req.file) deleteFileSafe(req.file.path || req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'Hospital name is required.'
      });
    }

    if (!doctor_name || typeof doctor_name !== 'string' || !doctor_name.trim()) {
      if (req.file) deleteFileSafe(req.file.path || req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'Attending doctor name is required.'
      });
    }

    if (!city || typeof city !== 'string' || !city.trim()) {
      if (req.file) deleteFileSafe(req.file.path || req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'City is required.'
      });
    }

    const cleanCity = city.trim();

    // 2. Hospital role authorization check:
    // A hospital user can ONLY create requests for their affiliated hospital facility
    if (userRole === 'hospital') {
      if (!req.user.hospital_facility_id) {
        if (req.file) deleteFileSafe(req.file.path || req.file.filename);
        return res.status(403).json({
          success: false,
          message: 'Your hospital account is not affiliated with an accredited facility.'
        });
      }
    }

    // 3. Prescription document handling
    // If uploaded, store filename; if not, store NULL (no placeholder paths!)
    const prescriptionPath = req.file ? (req.file.filename || req.file.path) : null;

    // 4. Anti-Fraud Facility Cross-Check
    const verificationCheck = await crossCheckFacility({
      hospitalNameInput: hospital_name.trim(),
      doctorNameInput: doctor_name.trim(),
      doctorLicenseInput: doctor_license ? doctor_license.trim() : null,
      city: cleanCity
    });

    // Hospital role affiliation constraint: verify request hospital matches user hospital
    if (userRole === 'hospital' && verificationCheck.hospitalId) {
      if (verificationCheck.hospitalId !== req.user.hospital_facility_id) {
        if (req.file) deleteFileSafe(req.file.path || req.file.filename);
        return res.status(403).json({
          success: false,
          message: 'Hospital users can only submit blood requests for their own affiliated hospital.'
        });
      }
    }

    // 5. Determine coordinates with strict geographical validation
    let finalLat = null;
    let finalLng = null;

    if (verificationCheck.latitude !== null && verificationCheck.longitude !== null) {
      finalLat = parseFloat(verificationCheck.latitude);
      finalLng = parseFloat(verificationCheck.longitude);
    } else if (latitude !== undefined && longitude !== undefined) {
      const pLat = parseFloat(latitude);
      const pLng = parseFloat(longitude);
      if (!isNaN(pLat) && pLat >= -90 && pLat <= 90 && !isNaN(pLng) && pLng >= -180 && pLng <= 180) {
        finalLat = pLat;
        finalLng = pLng;
      }
    }

    if (finalLat === null || finalLng === null) {
      if (req.file) deleteFileSafe(req.file.path || req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'Valid geographic coordinates (latitude between -90 and 90, longitude between -180 and 180) are required for emergency proximity dispatch.'
      });
    }

    // 6. Security & Fraud Rule: A request without a prescription CANNOT be auto-verified
    let finalStatus = verificationCheck.status;
    let finalRemarks = verificationCheck.remarks;
    if (!prescriptionPath && finalStatus === 'auto_verified') {
      finalStatus = 'pending_audit';
      finalRemarks += ' [Routing to admin audit: Official prescription upload was not provided].';
    }

    // 7. Insert record into blood_requests table
    const [result] = await pool.query(
      `INSERT INTO blood_requests
       (seeker_id, patient_name, blood_group, units_required, urgency,
        hospital_id, doctor_id, hospital_name_input, doctor_name_input, doctor_license_input,
        city, latitude, longitude, prescription_path, status, admin_remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seekerId,
        patient_name.trim(),
        resolvedBlood,
        resolvedUnits,
        resolvedUrgency,
        verificationCheck.hospitalId,
        verificationCheck.doctorId,
        hospital_name.trim(),
        doctor_name.trim(),
        doctor_license ? doctor_license.trim() : null,
        cleanCity,
        finalLat,
        finalLng,
        prescriptionPath,
        finalStatus,
        finalRemarks
      ]
    );

    const requestId = result.insertId;

    return res.status(201).json({
      success: true,
      requestId,
      status: finalStatus,
      message: finalStatus === 'auto_verified'
        ? 'Emergency blood request verified and created successfully. Ready for donor matching dispatch.'
        : 'Emergency request registered. Routing to administrative verification queue for hospital/doctor credential audit.',
      request: {
        id: requestId,
        seeker_id: seekerId,
        patient_name: patient_name.trim(),
        blood_group: resolvedBlood,
        blood_group_needed: resolvedBlood,
        units_required: resolvedUnits,
        units_needed: resolvedUnits,
        urgency: resolvedUrgency,
        urgency_level: resolvedUrgency,
        hospital_name: hospital_name.trim(),
        doctor_name: doctor_name.trim(),
        city: cleanCity,
        latitude: finalLat,
        longitude: finalLng,
        status: finalStatus,
        is_auto_verified: finalStatus === 'auto_verified',
        remarks: finalRemarks,
        prescription_path: prescriptionPath
      }
    });

  } catch (error) {
    if (req.file) deleteFileSafe(req.file.path || req.file.filename);
    console.error('[Create Blood Request Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error creating emergency blood request.'
    });
  }
};

/**
 * Retrieve all blood requests created by the current authenticated seeker or hospital
 * Route: GET /api/requests/my
 */
const getSeekerRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = `
      SELECT r.*, 
             (SELECT COUNT(*) FROM request_dispatches rd WHERE rd.request_id = r.id) AS total_dispatched,
             (SELECT COUNT(*) FROM request_dispatches rd WHERE rd.request_id = r.id AND rd.status = 'accepted') AS total_accepted
      FROM blood_requests r
    `;
    const params = [];

    if (userRole === 'admin') {
      // Admin can view all
    } else if (userRole === 'hospital' && req.user.hospital_facility_id) {
      query += ' WHERE r.hospital_id = ? OR r.seeker_id = ?';
      params.push(req.user.hospital_facility_id, userId);
    } else {
      query += ' WHERE r.seeker_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY r.created_at DESC';

    const [rows] = await pool.query(query, params);

    // Provide consistent response mapping with aliases for frontend
    const mappedRequests = rows.map(r => ({
      ...r,
      blood_group_needed: r.blood_group,
      units_needed: r.units_required,
      urgency_level: r.urgency,
      hospital_name: r.hospital_name_input,
      doctor_name: r.doctor_name_input
    }));

    return res.status(200).json({
      success: true,
      count: mappedRequests.length,
      requests: mappedRequests
    });

  } catch (error) {
    console.error('[Get Seeker Requests Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving your requests.'
    });
  }
};

/**
 * Retrieve detailed single request by ID
 * Route: GET /api/requests/:id
 */
const getRequestById = async (req, res) => {
  try {
    const requestId = parseStrictPositiveInt(req.params.id);
    if (!requestId) {
      return res.status(400).json({ success: false, message: 'Invalid request ID.' });
    }

    const [rows] = await pool.query(
      `SELECT r.*, u.full_name AS seeker_name, u.phone AS seeker_phone 
       FROM blood_requests r
       JOIN users u ON r.seeker_id = u.id
       WHERE r.id = ? LIMIT 1`,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    const bloodReq = rows[0];

    // Access control: seeker owner, affiliated hospital, or admin
    const isOwner = bloodReq.seeker_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isHospitalAffiliated = req.user.role === 'hospital' && req.user.hospital_facility_id && req.user.hospital_facility_id === bloodReq.hospital_id;

    if (!isAdmin && !isOwner && !isHospitalAffiliated) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to view this request.'
      });
    }

    return res.status(200).json({
      success: true,
      request: {
        ...bloodReq,
        blood_group_needed: bloodReq.blood_group,
        units_needed: bloodReq.units_required,
        urgency_level: bloodReq.urgency,
        hospital_name: bloodReq.hospital_name_input,
        doctor_name: bloodReq.doctor_name_input
      }
    });

  } catch (error) {
    console.error('[Get Request By ID Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving request details.'
    });
  }
};

/**
 * Cancel an emergency blood request
 * Route: PATCH /api/requests/:id/cancel
 */
const cancelRequest = async (req, res) => {
  try {
    const requestId = parseStrictPositiveInt(req.params.id);
    const userId = req.user.id;

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'Invalid request ID.' });
    }

    const [rows] = await pool.query(
      'SELECT id, seeker_id, hospital_id, status FROM blood_requests WHERE id = ? LIMIT 1',
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    const bloodReq = rows[0];

    const isOwner = bloodReq.seeker_id === userId;
    const isAdmin = req.user.role === 'admin';
    const isHospitalAffiliated = req.user.role === 'hospital' && req.user.hospital_facility_id && req.user.hospital_facility_id === bloodReq.hospital_id;

    if (!isAdmin && !isOwner && !isHospitalAffiliated) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to cancel this request.'
      });
    }

    if (bloodReq.status === 'fulfilled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a request that has already been fulfilled.'
      });
    }

    if (bloodReq.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Request is already cancelled.'
      });
    }

    await pool.query(
      "UPDATE blood_requests SET status = 'cancelled' WHERE id = ?",
      [requestId]
    );

    return res.status(200).json({
      success: true,
      message: 'Blood request cancelled successfully.'
    });

  } catch (error) {
    console.error('[Cancel Request Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error cancelling request.'
    });
  }
};

/**
 * Permanently delete a blood request
 * Route: DELETE /api/requests/:id
 * Access: Owner or Admin
 */
const deleteRequest = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const requestId = parseStrictPositiveInt(req.params.id);
    const userId = req.user.id;

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'Invalid request ID.' });
    }

    const [rows] = await connection.query(
      'SELECT id, seeker_id, status, prescription_path FROM blood_requests WHERE id = ? LIMIT 1',
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    const bloodReq = rows[0];

    // Only owner or admin can delete
    if (req.user.role !== 'admin' && bloodReq.seeker_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot delete another user's request."
      });
    }

    // AUDIT & DATA INTEGRITY:
    // Check if donation history records exist for this request
    const [donationRows] = await connection.query(
      'SELECT id FROM donations_history WHERE request_id = ? LIMIT 1',
      [requestId]
    );

    if (donationRows.length > 0 || bloodReq.status === 'fulfilled') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete request: Completed blood donation history exists for this record. Medical compliance records cannot be deleted.'
      });
    }

    await connection.beginTransaction();

    // Remove active dispatches
    await connection.query('DELETE FROM request_dispatches WHERE request_id = ?', [requestId]);

    // Delete request
    await connection.query('DELETE FROM blood_requests WHERE id = ?', [requestId]);

    await connection.commit();

    // Clean up uploaded prescription file if it exists
    if (bloodReq.prescription_path) {
      deleteFileSafe(bloodReq.prescription_path);
    }

    return res.status(200).json({
      success: true,
      message: 'Blood request and dispatch logs permanently deleted.'
    });

  } catch (error) {
    await connection.rollback();
    console.error('[Delete Request Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting request.'
    });
  } finally {
    connection.release();
  }
};

/**
 * Search accredited facilities for form auto-completion
 * Route: GET /api/requests/facilities
 */
const searchVerifiedFacilities = async (req, res) => {
  try {
    const { query, city, type } = req.query;
    let sql = 'SELECT id, entity_type, name, license_number, city, address, latitude, longitude FROM verified_hospitals_doctors WHERE is_active = 1';
    const params = [];

    if (type && ['hospital', 'doctor'].includes(type.toLowerCase())) {
      sql += ' AND entity_type = ?';
      params.push(type.toLowerCase());
    }

    if (city && typeof city === 'string' && city.trim()) {
      sql += ' AND city = ?';
      params.push(city.trim());
    }

    if (query && typeof query === 'string' && query.trim()) {
      sql += ' AND (name LIKE ? OR license_number LIKE ?)';
      params.push(`%${query.trim()}%`, `%${query.trim()}%`);
    }

    sql += ' ORDER BY name ASC LIMIT 15';

    const [results] = await pool.query(sql, params);

    return res.status(200).json({
      success: true,
      count: results.length,
      facilities: results
    });

  } catch (error) {
    console.error('[Search Facilities Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error searching accredited facilities.'
    });
  }
};

module.exports = {
  createBloodRequest,
  getSeekerRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
  searchVerifiedFacilities
};
