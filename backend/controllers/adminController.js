/**
 * BloodConnect - Administrative Audit & Facility Registry Controller
 * Architecture: Human-in-the-loop compliance oversight, Credential audit queues,
 * Cooldown preservation during audits, Registry CRUD with PUT full-replacement semantics,
 * and Referential integrity protection on deletions.
 */

const { pool } = require('../config/db');

/**
 * Validates integer strictly
 */
const parseStrictPositiveInt = (val) => {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) return null;
  const num = parseInt(str, 10);
  return num > 0 ? num : null;
};

/**
 * Retrieve all donor onboarding verifications pending admin review
 * Route: GET /api/admin/donors/pending
 * Access: Admin only
 */
const getPendingDonors = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM donor_verifications WHERE status = 'pending'"
    );
    const totalCount = countRows[0] ? countRows[0].total : 0;

    const [rows] = await pool.query(
      `SELECT 
         dv.id AS verification_id,
         dv.donor_id,
         dv.aadhar_masked,
         dv.id_document_path,
         dv.medical_document_path,
         dv.background_declaration,
         dv.status AS verification_status,
         dv.submitted_at,
         d.blood_group,
         d.date_of_birth,
         d.gender,
         d.weight_kg,
         d.city,
         d.area,
         d.cooldown_until,
         u.id AS user_id,
         u.full_name AS donor_name,
         u.email AS donor_email,
         u.phone AS donor_phone
       FROM donor_verifications dv
       JOIN donors d ON dv.donor_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE dv.status = 'pending'
       ORDER BY dv.submitted_at ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Provide consistent response mapping with aliases for frontend
    const mappedDonors = rows.map(d => ({
      ...d,
      name: d.donor_name,
      dob: d.date_of_birth,
      state: d.area || '',
      id_proof_path: d.id_document_path,
      medical_record_path: d.medical_document_path
    }));

    return res.status(200).json({
      success: true,
      count: mappedDonors.length,
      total_count: totalCount,
      page,
      limit,
      pending_donors: mappedDonors
    });

  } catch (error) {
    console.error('[Get Pending Donors Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving pending donor audits.'
    });
  }
};

/**
 * Audit a donor verification (Verify or Reject)
 * Route: POST /api/admin/donors/:verificationId/audit
 * Access: Admin only
 */
const auditDonor = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const verificationId = parseStrictPositiveInt(req.params.verificationId);
    
    // CRITICAL: Strictly enforce authenticated administrator identity (no fallback to user 1)
    if (!req.user || !req.user.id || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Valid administrator authentication required.'
      });
    }

    const adminId = req.user.id;
    const { remarks } = req.body;
    const rawAction = (req.body.action || req.body.decision || '').toLowerCase();

    let action = null;
    if (['verify', 'approve', 'approved'].includes(rawAction)) action = 'verify';
    if (['reject', 'rejected'].includes(rawAction)) action = 'reject';

    if (!verificationId) {
      return res.status(400).json({ success: false, message: 'Invalid verification ID.' });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        message: "Action must be either 'approve' or 'reject'."
      });
    }

    await connection.beginTransaction();

    // 1. Fetch verification record with row lock
    const [verRows] = await connection.query(
      'SELECT id, donor_id, status FROM donor_verifications WHERE id = ? FOR UPDATE',
      [verificationId]
    );

    if (verRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Donor verification record not found.' });
    }

    const verification = verRows[0];
    if (verification.status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `This donor verification has already been audited with status: '${verification.status}'.`
      });
    }

    const isApproved = action === 'verify';
    const newStatus = isApproved ? 'verified' : 'rejected';

    // 2. Fetch donor's current cooldown state
    const [donorData] = await connection.query(
      'SELECT id, user_id, cooldown_until FROM donors WHERE id = ? LIMIT 1',
      [verification.donor_id]
    );

    const donor = donorData[0];
    const hasActiveCooldown = donor && donor.cooldown_until && new Date(donor.cooldown_until) > new Date();

    // 3. Update donor_verifications audit log
    await connection.query(
      `UPDATE donor_verifications 
       SET status = ?, 
           admin_remarks = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW() 
       WHERE id = ?`,
      [newStatus, remarks ? remarks.trim() : null, adminId, verificationId]
    );

    // 4. Update donors and users standing:
    // MEDICAL RULE: Even if approved, if donor has active cooldown, availability MUST remain 'cooldown'
    if (isApproved) {
      const targetAvailability = hasActiveCooldown ? 'cooldown' : 'available';
      await connection.query(
        'UPDATE donors SET is_verified = 1, availability_status = ? WHERE id = ?',
        [targetAvailability, verification.donor_id]
      );
      await connection.query(
        'UPDATE users SET is_verified = 1 WHERE id = ?',
        [donor.user_id]
      );
    } else {
      // Rejection: lock account and keep unavailable
      await connection.query(
        "UPDATE donors SET is_verified = 0, availability_status = 'busy' WHERE id = ?",
        [verification.donor_id]
      );
      await connection.query(
        'UPDATE users SET is_verified = 0 WHERE id = ?',
        [donor.user_id]
      );
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: isApproved
        ? `Donor verification approved successfully. Donor status set to ${hasActiveCooldown ? 'cooldown' : 'available'}.`
        : 'Donor verification rejected. Profile remains disabled.',
      verification_id: verificationId,
      donor_id: verification.donor_id,
      status: newStatus
    });

  } catch (error) {
    await connection.rollback();
    console.error('[Audit Donor Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error processing donor audit.'
    });
  } finally {
    connection.release();
  }
};

/**
 * Retrieve all emergency blood requests pending administrative audit
 * Route: GET /api/admin/requests/pending
 * Access: Admin only
 */
const getPendingRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM blood_requests WHERE status = 'pending_audit'"
    );
    const totalCount = countRows[0] ? countRows[0].total : 0;

    const [rows] = await pool.query(
      `SELECT 
         r.*,
         u.full_name AS seeker_name,
         u.email AS seeker_email,
         u.phone AS seeker_phone
       FROM blood_requests r
       JOIN users u ON r.seeker_id = u.id
       WHERE r.status = 'pending_audit'
       ORDER BY 
         CASE r.urgency 
           WHEN 'critical' THEN 1 
           WHEN 'urgent' THEN 2 
           ELSE 3 
         END,
         r.created_at ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Provide consistent response mapping with aliases for frontend
    const mappedRequests = rows.map(r => ({
      ...r,
      blood_group_needed: r.blood_group,
      units_needed: r.units_required,
      urgency_level: r.urgency,
      hospital_name: r.hospital_name_input,
      doctor_name: r.doctor_name_input,
      required_by: r.created_at
    }));

    return res.status(200).json({
      success: true,
      count: mappedRequests.length,
      total_count: totalCount,
      page,
      limit,
      pending_requests: mappedRequests
    });

  } catch (error) {
    console.error('[Get Pending Requests Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving pending request audits.'
    });
  }
};

/**
 * Audit an unverified emergency blood request (Approve or Reject)
 * Route: POST /api/admin/requests/:requestId/audit
 * Access: Admin only
 */
const auditRequest = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const requestId = parseStrictPositiveInt(req.params.requestId);

    if (!req.user || !req.user.id || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Valid administrator authentication required.'
      });
    }

    const adminId = req.user.id;
    const { remarks } = req.body;
    const rawAction = (req.body.action || req.body.decision || '').toLowerCase();

    let action = null;
    if (['verify', 'approve', 'approved'].includes(rawAction)) action = 'approve';
    if (['reject', 'rejected'].includes(rawAction)) action = 'reject';

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'Invalid request ID.' });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        message: "Action must be either 'approve' or 'reject'."
      });
    }

    await connection.beginTransaction();

    const [reqRows] = await connection.query(
      'SELECT id, status FROM blood_requests WHERE id = ? FOR UPDATE',
      [requestId]
    );

    if (reqRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    const bloodReq = reqRows[0];
    if (bloodReq.status !== 'pending_audit') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `This blood request has already been audited with status: '${bloodReq.status}'.`
      });
    }

    const isApproved = action === 'approve';
    const newStatus = isApproved ? 'auto_verified' : 'cancelled';

    await connection.query(
      `UPDATE blood_requests 
       SET status = ?, 
           admin_remarks = ?, 
           audited_by = ?, 
           audited_at = NOW() 
       WHERE id = ?`,
      [newStatus, remarks ? remarks.trim() : (isApproved ? 'Approved by admin audit' : 'Rejected by admin audit'), adminId, requestId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: isApproved
        ? 'Emergency blood request verified and approved. It is now qualified for dispatch matching.'
        : 'Emergency blood request rejected and cancelled.',
      request_id: requestId,
      status: newStatus
    });

  } catch (error) {
    await connection.rollback();
    console.error('[Audit Request Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error processing request audit.'
    });
  } finally {
    connection.release();
  }
};

/**
 * Add a new accredited hospital or licensed doctor to the registry
 * Route: POST /api/admin/facilities
 * Access: Admin only
 */
const addFacility = async (req, res) => {
  try {
    const {
      entity_type,
      name,
      license_number,
      specialization,
      affiliated_hospital_id,
      city,
      address,
      latitude,
      longitude
    } = req.body;

    // Strict validation
    if (!entity_type || !name || !license_number || !city) {
      return res.status(400).json({
        success: false,
        message: 'entity_type, name, license_number, and city are mandatory.'
      });
    }

    const cleanType = entity_type.toLowerCase().trim();
    if (!['hospital', 'doctor'].includes(cleanType)) {
      return res.status(400).json({
        success: false,
        message: "entity_type must be either 'hospital' or 'doctor'."
      });
    }

    // Coordinates validation
    let pLat = null;
    let pLng = null;
    if (latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null) {
      pLat = parseFloat(latitude);
      pLng = parseFloat(longitude);
      if (isNaN(pLat) || pLat < -90 || pLat > 90 || isNaN(pLng) || pLng < -180 || pLng > 180) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180.'
        });
      }
    }

    // If doctor, validate affiliated_hospital_id references an accredited hospital
    let parsedAffiliatedId = null;
    if (cleanType === 'doctor') {
      if (affiliated_hospital_id) {
        parsedAffiliatedId = parseStrictPositiveInt(affiliated_hospital_id);
        if (!parsedAffiliatedId) {
          return res.status(400).json({ success: false, message: 'Invalid affiliated_hospital_id.' });
        }

        const [hospRows] = await pool.query(
          "SELECT id FROM verified_hospitals_doctors WHERE id = ? AND entity_type = 'hospital' AND is_active = 1 LIMIT 1",
          [parsedAffiliatedId]
        );

        if (hospRows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'affiliated_hospital_id must reference an existing active hospital record.'
          });
        }
      }
    }

    // Check duplicate license
    const [existing] = await pool.query(
      'SELECT id FROM verified_hospitals_doctors WHERE license_number = ? LIMIT 1',
      [license_number.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A facility or doctor with this license number is already registered.'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO verified_hospitals_doctors 
       (entity_type, name, license_number, specialization, affiliated_hospital_id, city, address, latitude, longitude, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        cleanType,
        name.trim(),
        license_number.trim(),
        specialization ? specialization.trim() : null,
        parsedAffiliatedId,
        city.trim(),
        address ? address.trim() : null,
        pLat,
        pLng
      ]
    );

    return res.status(201).json({
      success: true,
      message: `${cleanType === 'hospital' ? 'Hospital' : 'Doctor'} added to accredited directory.`,
      facility_id: result.insertId
    });

  } catch (error) {
    console.error('[Add Facility Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error registering facility.'
    });
  }
};

/**
 * Full replacement update of a facility or doctor (PUT semantics)
 * Route: PUT /api/admin/facilities/:id
 * Access: Admin only
 */
const updateFacilityPut = async (req, res) => {
  try {
    const facilityId = parseStrictPositiveInt(req.params.id);
    if (!facilityId) {
      return res.status(400).json({ success: false, message: 'Invalid facility ID.' });
    }

    const {
      entity_type,
      name,
      license_number,
      specialization,
      affiliated_hospital_id,
      city,
      address,
      latitude,
      longitude,
      is_active
    } = req.body;

    if (!entity_type || !name || !license_number || !city) {
      return res.status(400).json({
        success: false,
        message: 'Full replacement requires entity_type, name, license_number, and city.'
      });
    }

    const cleanType = entity_type.toLowerCase().trim();
    if (!['hospital', 'doctor'].includes(cleanType)) {
      return res.status(400).json({ success: false, message: "entity_type must be 'hospital' or 'doctor'." });
    }

    const [existing] = await pool.query(
      'SELECT id FROM verified_hospitals_doctors WHERE id = ? LIMIT 1',
      [facilityId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Facility not found.' });
    }

    // Check duplicate license on other records
    const [dup] = await pool.query(
      'SELECT id FROM verified_hospitals_doctors WHERE license_number = ? AND id != ? LIMIT 1',
      [license_number.trim(), facilityId]
    );

    if (dup.length > 0) {
      return res.status(409).json({ success: false, message: 'Another facility has this license number.' });
    }

    const activeFlag = is_active === 1 || is_active === '1' || is_active === true ? 1 : 0;
    const parsedAffiliatedId = cleanType === 'doctor' && affiliated_hospital_id
      ? parseStrictPositiveInt(affiliated_hospital_id)
      : null;

    const pLat = latitude !== undefined && latitude !== null ? parseFloat(latitude) : null;
    const pLng = longitude !== undefined && longitude !== null ? parseFloat(longitude) : null;

    await pool.query(
      `UPDATE verified_hospitals_doctors 
       SET entity_type = ?, name = ?, license_number = ?, specialization = ?,
           affiliated_hospital_id = ?, city = ?, address = ?, latitude = ?, longitude = ?, is_active = ?
       WHERE id = ?`,
      [
        cleanType,
        name.trim(),
        license_number.trim(),
        specialization ? specialization.trim() : null,
        parsedAffiliatedId,
        city.trim(),
        address ? address.trim() : null,
        pLat,
        pLng,
        activeFlag,
        facilityId
      ]
    );

    return res.status(200).json({
      success: true,
      message: 'Facility updated successfully with full replacement semantics.',
      facility: {
        id: facilityId,
        entity_type: cleanType,
        name: name.trim(),
        license_number: license_number.trim(),
        city: city.trim(),
        is_active: activeFlag
      }
    });

  } catch (error) {
    console.error('[Update Facility PUT Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error updating facility.'
    });
  }
};

/**
 * List all accredited facilities & doctors with filtering & pagination
 * Route: GET /api/admin/facilities
 * Access: Admin only
 */
const listFacilities = async (req, res) => {
  try {
    const { type, city, search, active } = req.query;
    let sql = 'SELECT * FROM verified_hospitals_doctors WHERE 1=1';
    const params = [];

    if (type && ['hospital', 'doctor'].includes(type.toLowerCase())) {
      sql += ' AND entity_type = ?';
      params.push(type.toLowerCase());
    }

    if (city && typeof city === 'string' && city.trim()) {
      sql += ' AND city = ?';
      params.push(city.trim());
    }

    if (active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(active === '1' || active === 'true' ? 1 : 0);
    }

    if (search && typeof search === 'string' && search.trim()) {
      sql += ' AND (name LIKE ? OR license_number LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    // Pagination support
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countRows] = await pool.query(countSql, params);
    const totalCount = countRows[0] ? countRows[0].total : 0;
    const totalPages = Math.ceil(totalCount / limit);

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const queryParams = [...params, limit, offset];

    const [rows] = await pool.query(sql, queryParams);

    return res.status(200).json({
      success: true,
      count: rows.length,
      total_count: totalCount,
      total_pages: totalPages,
      current_page: page,
      limit,
      facilities: rows
    });

  } catch (error) {
    console.error('[List Facilities Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving facilities.'
    });
  }
};

/**
 * Toggle active status of a facility or doctor
 * Route: PATCH /api/admin/facilities/:id/status
 * Access: Admin only
 */
const toggleFacilityStatus = async (req, res) => {
  try {
    const facilityId = parseStrictPositiveInt(req.params.id);
    const { is_active } = req.body;

    if (!facilityId) {
      return res.status(400).json({ success: false, message: 'Invalid facility ID.' });
    }

    const activeFlag = is_active === 1 || is_active === '1' || is_active === true ? 1 : 0;

    const [result] = await pool.query(
      'UPDATE verified_hospitals_doctors SET is_active = ? WHERE id = ?',
      [activeFlag, facilityId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Facility not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Facility status updated to ${activeFlag === 1 ? 'active' : 'inactive'}.`,
      is_active: activeFlag
    });

  } catch (error) {
    console.error('[Toggle Facility Status Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error updating facility status.'
    });
  }
};

/**
 * Get system-wide platform metrics for the admin control center
 * Route: GET /api/admin/stats
 * Access: Admin only
 */
const getAdminOverviewStats = async (req, res) => {
  try {
    const [userStats] = await pool.query(
      `SELECT 
         COUNT(*) AS total_users,
         SUM(CASE WHEN role = 'donor' THEN 1 ELSE 0 END) AS total_donors,
         SUM(CASE WHEN role = 'seeker' THEN 1 ELSE 0 END) AS total_seekers,
         SUM(CASE WHEN role = 'hospital' THEN 1 ELSE 0 END) AS total_hospitals
       FROM users`
    );

    const [donorStats] = await pool.query(
      `SELECT 
         SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) AS total_verified_donors,
         SUM(CASE WHEN is_verified = 1 AND availability_status = 'available' THEN 1 ELSE 0 END) AS available_donors,
         SUM(CASE WHEN availability_status = 'cooldown' THEN 1 ELSE 0 END) AS donors_in_cooldown
       FROM donors`
    );

    const [auditStats] = await pool.query(
      `SELECT 
         (SELECT COUNT(*) FROM donor_verifications WHERE status = 'pending') AS pending_donor_verifications,
         (SELECT COUNT(*) FROM blood_requests WHERE status = 'pending_audit') AS pending_request_audits,
         (SELECT COUNT(*) FROM blood_requests) AS total_requests,
         (SELECT COUNT(*) FROM blood_requests WHERE status = 'dispatched') AS active_dispatches,
         (SELECT COUNT(*) FROM blood_requests WHERE status = 'fulfilled') AS total_fulfilled_requests,
         (SELECT COUNT(*) FROM verified_hospitals_doctors WHERE is_active = 1) AS total_facilities,
         (SELECT COUNT(*) FROM donations_history) AS total_donations_completed
       `
    );

    const users = userStats[0];
    const donors = donorStats[0];
    const audits = auditStats[0];

    return res.status(200).json({
      success: true,
      // Flat properties for frontend dashboard consumption
      total_verified_donors: donors.total_verified_donors || 0,
      available_donors: donors.available_donors || 0,
      total_requests: audits.total_requests || 0,
      total_fulfilled_requests: audits.total_fulfilled_requests || 0,
      total_facilities: audits.total_facilities || 0,
      pending_donor_verifications: audits.pending_donor_verifications || 0,
      pending_request_audits: audits.pending_request_audits || 0,
      // Nested objects for detailed diagnostics
      users,
      donors,
      audits
    });

  } catch (error) {
    console.error('[Get Admin Stats Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error calculating overview statistics.'
    });
  }
};

/**
 * Delete a facility from registry with referential integrity protection
 * Route: DELETE /api/admin/facilities/:id
 * Access: Admin only
 */
const deleteFacility = async (req, res) => {
  try {
    const facilityId = parseStrictPositiveInt(req.params.id);
    if (!facilityId) {
      return res.status(400).json({ success: false, message: 'Invalid facility ID.' });
    }

    // Check if facility exists
    const [facRows] = await pool.query(
      'SELECT id, name FROM verified_hospitals_doctors WHERE id = ? LIMIT 1',
      [facilityId]
    );

    if (facRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Facility not found.' });
    }

    // 1. Check if referenced by blood requests
    const [reqRefs] = await pool.query(
      'SELECT id FROM blood_requests WHERE hospital_id = ? OR doctor_id = ? LIMIT 1',
      [facilityId, facilityId]
    );

    if (reqRefs.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot permanently delete facility: It is referenced by existing medical blood requests. Please deactivate it instead to preserve audit history.'
      });
    }

    // 2. Check if referenced by doctors as an affiliated hospital
    const [docRefs] = await pool.query(
      'SELECT id FROM verified_hospitals_doctors WHERE affiliated_hospital_id = ? LIMIT 1',
      [facilityId]
    );

    if (docRefs.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot permanently delete hospital: Accredited doctors are affiliated with this facility. Please reassign or deactivate the doctors first.'
      });
    }

    // 3. Delete facility
    const [result] = await pool.query(
      'DELETE FROM verified_hospitals_doctors WHERE id = ?',
      [facilityId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Facility not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Facility permanently removed from registry.'
    });

  } catch (error) {
    console.error('[Delete Facility Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting facility.'
    });
  }
};

module.exports = {
  getPendingDonors,
  auditDonor,
  getPendingRequests,
  auditRequest,
  addFacility,
  updateFacilityPut,
  listFacilities,
  toggleFacilityStatus,
  deleteFacility,
  getAdminOverviewStats
};
