/**
 * BloodConnect - Match & Emergency Dispatch Controller
 * Architecture: Proximity queries with Bounding-Box pre-filtering, Haversine spherical math,
 * ABO/Rh compatibility, Concurrency-safe dispatch broadcasts, Two-step Consent Unlock,
 * Conflict prevention for concurrent donor dispatches, and Atomic Donation Completion.
 */

const { pool } = require('../config/db');
const { getCompatibleDonorBloodGroups } = require('../utils/compatibilityUtils');
const { HAVERSINE_SQL_FRAGMENT } = require('../utils/geoUtils');

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
 * Validates search radius between 1 and 100 km (default 25 km)
 */
const parseValidRadius = (val) => {
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) return 25.0;
  return Math.min(100.0, Math.max(1.0, num));
};

/**
 * Check whether the authenticated user has permission to operate on a request
 */
const checkRequestPermission = (user, bloodReq) => {
  if (user.role === 'admin') return true;
  if (user.role === 'seeker' && bloodReq.seeker_id === user.id) return true;
  if (user.role === 'hospital' && user.hospital_facility_id && user.hospital_facility_id === bloodReq.hospital_id) return true;
  return false;
};

/**
 * Core query helper: Finds all verified, available, cooldown-free compatible donors
 * within a specified kilometer radius of a patient's emergency request.
 * Incorporates a spatial bounding-box pre-filter to leverage MySQL index filtering.
 */
const findNearbyCompatibleDonors = async (request, radiusKm = 25) => {
  const compatibleBloodGroups = getCompatibleDonorBloodGroups(request.blood_group);

  if (!compatibleBloodGroups || compatibleBloodGroups.length === 0) {
    return [];
  }

  const reqLat = parseFloat(request.latitude);
  const reqLng = parseFloat(request.longitude);
  const maxRadius = parseValidRadius(radiusKm);

  // Approximate bounding box:
  // 1 deg latitude ≈ 111 km
  // 1 deg longitude ≈ 111 km * cos(latitude in radians)
  const deltaLat = maxRadius / 111.0;
  const radLat = (reqLat * Math.PI) / 180.0;
  const cosLat = Math.cos(radLat);
  const deltaLng = cosLat !== 0 ? maxRadius / (111.0 * Math.abs(cosLat)) : deltaLat;

  const minLat = reqLat - deltaLat;
  const maxLat = reqLat + deltaLat;
  const minLng = reqLng - deltaLng;
  const maxLng = reqLng + deltaLng;

  const bloodPlaceholders = compatibleBloodGroups.map(() => '?').join(', ');

  const sql = `
    SELECT 
      d.id AS donor_id,
      d.user_id,
      u.full_name AS donor_name,
      d.blood_group,
      d.city,
      d.area,
      d.latitude,
      d.longitude,
      d.availability_status,
      d.last_donation_date,
      ${HAVERSINE_SQL_FRAGMENT} AS distance_km
    FROM donors d
    JOIN users u ON d.user_id = u.id
    WHERE d.is_verified = 1
      AND d.availability_status = 'available'
      AND (d.cooldown_until IS NULL OR d.cooldown_until <= NOW())
      AND d.blood_group IN (${bloodPlaceholders})
      AND d.latitude BETWEEN ? AND ?
      AND d.longitude BETWEEN ? AND ?
    HAVING distance_km <= ?
    ORDER BY distance_km ASC
    LIMIT 50
  `;

  const queryParams = [
    reqLat, reqLng, reqLat,
    ...compatibleBloodGroups,
    minLat, maxLat, minLng, maxLng,
    maxRadius
  ];

  const [candidates] = await pool.query(sql, queryParams);
  return candidates;
};

/**
 * Preview compatible nearby donors for an emergency request
 * Route: GET /api/matches/preview/:requestId?radius=25
 */
const previewNearbyDonors = async (req, res) => {
  try {
    const requestId = parseStrictPositiveInt(req.params.requestId);
    const radius = parseValidRadius(req.query.radius);

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'Invalid request ID parameter.' });
    }

    const [requestRows] = await pool.query(
      'SELECT id, seeker_id, hospital_id, patient_name, blood_group, units_required, city, latitude, longitude, status FROM blood_requests WHERE id = ? LIMIT 1',
      [requestId]
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    const bloodReq = requestRows[0];

    // Authorization check
    if (!checkRequestPermission(req.user, bloodReq)) {
      return res.status(403).json({ success: false, message: 'Forbidden: You are not authorized to view matches for this request.' });
    }

    // Lifecycle check: only permit preview for active verified requests
    if (['pending_audit', 'fulfilled', 'cancelled'].includes(bloodReq.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot preview matches: Request status is '${bloodReq.status}'. Only verified or dispatched requests can search donors.`
      });
    }

    const candidateDonors = await findNearbyCompatibleDonors(bloodReq, radius);

    const sanitizedCandidates = candidateDonors.map(donor => ({
      donor_id: donor.donor_id,
      blood_group: donor.blood_group,
      city: donor.city,
      area: donor.area,
      distance_km: donor.distance_km,
      last_donation_date: donor.last_donation_date
    }));

    return res.status(200).json({
      success: true,
      request: {
        id: bloodReq.id,
        blood_group: bloodReq.blood_group,
        blood_group_needed: bloodReq.blood_group,
        compatible_donor_types: getCompatibleDonorBloodGroups(bloodReq.blood_group),
        search_radius_km: radius,
        city: bloodReq.city
      },
      match_count: sanitizedCandidates.length,
      donors: sanitizedCandidates
    });

  } catch (error) {
    console.error('[Preview Donors Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving nearby donor matches.'
    });
  }
};

/**
 * Dispatch emergency alerts to all compatible nearby donors
 * Route: POST /api/matches/dispatch/:requestId
 */
const dispatchEmergencyRequest = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const requestId = parseStrictPositiveInt(req.params.requestId);
    const radius = parseValidRadius(req.body.radius || req.query.radius);

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'Invalid request ID.' });
    }

    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT id, seeker_id, hospital_id, patient_name, blood_group, units_required, urgency, 
              hospital_name_input, city, latitude, longitude, status 
       FROM blood_requests 
       WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    if (requestRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    const bloodReq = requestRows[0];

    // Authorization check
    if (!checkRequestPermission(req.user, bloodReq)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Forbidden: You are not authorized to dispatch this request.' });
    }

    if (bloodReq.status === 'pending_audit') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot dispatch: This request is currently in the administrative compliance audit queue.'
      });
    }

    if (bloodReq.status === 'fulfilled' || bloodReq.status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot dispatch: This request is already marked as '${bloodReq.status}'.`
      });
    }

    const candidateDonors = await findNearbyCompatibleDonors(bloodReq, radius);

    if (candidateDonors.length === 0) {
      await connection.rollback();
      return res.status(200).json({
        success: true,
        message: `No active, verified, eligible donors found within ${radius} km. Try expanding the search radius.`,
        dispatched_count: 0,
        candidates: []
      });
    }

    const [existingDispatches] = await connection.query(
      'SELECT donor_id FROM request_dispatches WHERE request_id = ?',
      [requestId]
    );
    const alreadyNotifiedDonorIds = new Set(existingDispatches.map(d => d.donor_id));
    const newDonorsToNotify = candidateDonors.filter(c => !alreadyNotifiedDonorIds.has(c.donor_id));

    if (newDonorsToNotify.length === 0) {
      await connection.rollback();
      return res.status(200).json({
        success: true,
        message: 'All matching nearby donors within this radius have already been notified.',
        dispatched_count: 0,
        total_already_notified: alreadyNotifiedDonorIds.size
      });
    }

    const dispatchValues = newDonorsToNotify.map(d => [
      requestId,
      d.donor_id,
      'notified',
      d.distance_km
    ]);

    await connection.query(
      `INSERT INTO request_dispatches (request_id, donor_id, status, distance_km)
       VALUES ?
       ON DUPLICATE KEY UPDATE status = status`,
      [dispatchValues]
    );

    await connection.query(
      "UPDATE blood_requests SET status = 'dispatched' WHERE id = ?",
      [requestId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `Emergency dispatch broadcasted successfully to ${newDonorsToNotify.length} nearby eligible donor(s).`,
      request_id: requestId,
      status: 'dispatched',
      dispatched_count: newDonorsToNotify.length,
      radius_km: radius,
      notified_donors: newDonorsToNotify.map(d => ({
        donor_id: d.donor_id,
        blood_group: d.blood_group,
        distance_km: d.distance_km,
        city: d.city,
        area: d.area
      }))
    });

  } catch (error) {
    await connection.rollback();
    console.error('[Dispatch Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during emergency dispatch.'
    });
  } finally {
    connection.release();
  }
};

/**
 * Retrieve incoming emergency blood alerts for the authenticated donor
 * Route: GET /api/matches/donor-alerts
 */
const getDonorEmergencyAlerts = async (req, res) => {
  try {
    const userId = req.user.id;

    const [donorRows] = await pool.query(
      'SELECT id, blood_group, city, availability_status, is_verified, cooldown_until FROM donors WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (donorRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Donor profile not found.' });
    }

    const donor = donorRows[0];

    // If unverified or on cooldown, don't return active emergency alerts
    if (donor.is_verified !== 1 || (donor.cooldown_until && new Date(donor.cooldown_until) > new Date())) {
      return res.status(200).json({
        success: true,
        count: 0,
        alerts: []
      });
    }

    const [alerts] = await pool.query(
      `SELECT 
         rd.id AS dispatch_id,
         rd.request_id,
         rd.status AS dispatch_status,
         rd.status AS donor_status,
         rd.distance_km,
         rd.notified_at,
         r.patient_name,
         r.blood_group AS blood_group_needed,
         r.blood_group,
         r.units_required AS units_needed,
         r.units_required,
         r.units_fulfilled,
         r.urgency AS urgency_level,
         r.urgency,
         r.hospital_name_input AS hospital_name,
         r.city AS hospital_city,
         r.created_at,
         r.created_at AS request_created_at
       FROM request_dispatches rd
       JOIN blood_requests r ON rd.request_id = r.id
       WHERE rd.donor_id = ?
         AND rd.status = 'notified'
         AND r.status = 'dispatched'
       ORDER BY 
         CASE r.urgency 
           WHEN 'critical' THEN 1 
           WHEN 'urgent' THEN 2 
           ELSE 3 
         END,
         rd.distance_km ASC`,
      [donor.id]
    );

    return res.status(200).json({
      success: true,
      count: alerts.length,
      alerts
    });

  } catch (error) {
    console.error('[Donor Alerts Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving emergency donor alerts.'
    });
  }
};

/**
 * Donor accepts or declines an emergency dispatch alert (Two-step Consent Protocol)
 * Route: POST /api/matches/respond/:dispatchId
 * Access: Authenticated (Donor only)
 */
const respondToDispatch = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const dispatchId = parseStrictPositiveInt(req.params.dispatchId);
    const userId = req.user.id;
    const { action } = req.body;

    if (!dispatchId) {
      return res.status(400).json({ success: false, message: 'Invalid dispatch ID parameter.' });
    }

    if (!action || !['accept', 'decline'].includes(action.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be either 'accept' or 'decline'."
      });
    }

    await connection.beginTransaction();

    // 1. Fetch donor record with lock
    const [donorRows] = await connection.query(
      'SELECT id, is_verified, availability_status, cooldown_until FROM donors WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    if (donorRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Donor profile not found.' });
    }

    const donor = donorRows[0];
    const isAccepting = action.toLowerCase() === 'accept';

    // Verification check
    if (isAccepting && donor.is_verified !== 1) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: 'Cannot accept dispatch: Your donor profile is pending compliance verification.'
      });
    }

    // Cooldown check
    if (isAccepting && donor.cooldown_until && new Date(donor.cooldown_until) > new Date()) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot accept dispatch: You are currently in active medical recovery cooldown.'
      });
    }

    // Check for conflicting active accepted dispatches
    if (isAccepting) {
      const [activeCommitments] = await connection.query(
        `SELECT rd.id, rd.request_id 
         FROM request_dispatches rd
         JOIN blood_requests r ON rd.request_id = r.id
         WHERE rd.donor_id = ? AND rd.status = 'accepted' AND r.status NOT IN ('fulfilled', 'cancelled')
         LIMIT 1`,
        [donor.id]
      );

      if (activeCommitments.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'You already have an active accepted emergency dispatch in progress. Please complete or resolve your existing commitment before accepting new requests.'
        });
      }
    }

    // 2. Fetch dispatch record with row lock
    const [dispatchRows] = await connection.query(
      `SELECT rd.id, rd.request_id, rd.donor_id, rd.status, r.status AS request_status 
       FROM request_dispatches rd
       JOIN blood_requests r ON rd.request_id = r.id
       WHERE rd.id = ? AND rd.donor_id = ? FOR UPDATE`,
      [dispatchId, donor.id]
    );

    if (dispatchRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Dispatch record not found or not addressed to your account.'
      });
    }

    const dispatch = dispatchRows[0];

    if (dispatch.status !== 'notified') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `You have already responded to this dispatch with status: '${dispatch.status}'.`
      });
    }

    if (dispatch.request_status === 'fulfilled' || dispatch.request_status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `This emergency request has already been ${dispatch.request_status}.`
      });
    }

    const newStatus = isAccepting ? 'accepted' : 'declined';

    // 3. Update dispatch record
    await connection.query(
      'UPDATE request_dispatches SET status = ?, responded_at = NOW() WHERE id = ?',
      [newStatus, dispatchId]
    );

    // 4. If accepted, set donor availability status to 'busy' to prevent conflicting alert floods
    if (isAccepting) {
      await connection.query(
        "UPDATE donors SET availability_status = 'busy' WHERE id = ?",
        [donor.id]
      );
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: isAccepting
        ? 'Emergency request accepted! Your verified contact details have been conditionally shared with the hospital/seeker for donation coordination.'
        : 'Emergency dispatch declined. Your privacy is preserved and no contact details were shared.',
      dispatch_id: dispatchId,
      status: newStatus
    });

  } catch (error) {
    await connection.rollback();
    console.error('[Respond Dispatch Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error processing dispatch response.'
    });
  } finally {
    connection.release();
  }
};

/**
 * Seeker Live Tracking: Retrieve all responded donors for a request
 * Conditional Contact Disclosure Enforcement:
 *  - Dispatches with status 'accepted': Contact UNLOCKED (Phone, Email, Full Name revealed)
 *  - Dispatches with status 'notified' or 'declined': Contact MASKED / Anonymized
 * Route: GET /api/matches/radar/:requestId (also aliased as /api/matches/request/:requestId)
 * Access: Authenticated (Seeker owner, Affiliated Hospital, Admin)
 */
const getRequestMatchedDonors = async (req, res) => {
  try {
    const requestId = parseStrictPositiveInt(req.params.requestId);

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'Invalid request ID.' });
    }

    // 1. Fetch request and check ownership
    const [requestRows] = await pool.query(
      'SELECT id, seeker_id, hospital_id, patient_name, blood_group, units_required, units_fulfilled, status FROM blood_requests WHERE id = ? LIMIT 1',
      [requestId]
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    const bloodReq = requestRows[0];

    // Authorization check
    if (!checkRequestPermission(req.user, bloodReq)) {
      return res.status(403).json({ success: false, message: 'Forbidden: You are not authorized to view matches for this request.' });
    }

    // 2. Query dispatches with selective disclosure projection
    const [dispatches] = await pool.query(
      `SELECT 
         rd.id AS dispatch_id,
         rd.donor_id,
         rd.status AS dispatch_status,
         rd.status AS donor_status,
         rd.distance_km,
         rd.notified_at,
         rd.responded_at,
         d.blood_group,
         d.city AS donor_city,
         d.area AS donor_area,
         -- CONDITIONAL CONTACT DISCLOSURE (Only upon explicit donor acceptance):
         CASE 
           WHEN rd.status = 'accepted' OR rd.status = 'completed' THEN u.full_name 
           ELSE CONCAT('Potential Donor #', d.id) 
         END AS donor_name,
         CASE 
           WHEN rd.status = 'accepted' OR rd.status = 'completed' THEN u.phone 
           ELSE NULL 
         END AS donor_phone,
         CASE 
           WHEN rd.status = 'accepted' OR rd.status = 'completed' THEN u.email 
           ELSE NULL 
         END AS donor_email,
         CASE 
           WHEN rd.status = 'accepted' OR rd.status = 'completed' THEN 1 
           ELSE 0 
         END AS is_contact_unlocked
       FROM request_dispatches rd
       JOIN donors d ON rd.donor_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE rd.request_id = ?
       ORDER BY 
         CASE rd.status 
           WHEN 'accepted' THEN 1 
           WHEN 'completed' THEN 2
           WHEN 'notified' THEN 3 
           ELSE 4 
         END,
         rd.distance_km ASC`,
      [requestId]
    );

    return res.status(200).json({
      success: true,
      request: {
        ...bloodReq,
        blood_group_needed: bloodReq.blood_group,
        units_needed: bloodReq.units_required
      },
      total_dispatches: dispatches.length,
      accepted_count: dispatches.filter(d => d.dispatch_status === 'accepted' || d.dispatch_status === 'completed').length,
      dispatches
    });

  } catch (error) {
    console.error('[Get Request Matched Donors Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving matched donors.'
    });
  }
};

/**
 * Mark a blood donation as completed:
 *  - Atomic transaction with row locking
 *  - Records completed donation in donations_history
 *  - Enforces automatic 90-day cooldown on the donor
 *  - Locks donor availability status to 'cooldown'
 *  - Updates dispatch status to 'completed'
 *  - Increments blood_requests.units_fulfilled
 *  - Marks request 'fulfilled' if satisfied
 * Route: POST /api/matches/complete/:dispatchId (also aliased for requestId in tests)
 * Access: Authenticated (Seeker owner, Affiliated Hospital, Admin)
 */
const completeDonation = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const rawParamId = parseStrictPositiveInt(req.params.dispatchId || req.params.requestId);
    const units = parseStrictPositiveInt(req.body.units || 1) || 1;

    if (!rawParamId) {
      return res.status(400).json({ success: false, message: 'Invalid dispatch or request ID.' });
    }

    await connection.beginTransaction();

    // 1. Locate dispatch record (by dispatch_id or request_id) with row locking
    let [dispatchRows] = await connection.query(
      `SELECT rd.id, rd.request_id, rd.donor_id, rd.status AS dispatch_status,
              r.seeker_id, r.hospital_id, r.units_required, r.units_fulfilled, r.status AS request_status,
              d.user_id AS donor_user_id
       FROM request_dispatches rd
       JOIN blood_requests r ON rd.request_id = r.id
       JOIN donors d ON rd.donor_id = d.id
       WHERE rd.id = ? FOR UPDATE`,
      [rawParamId]
    );

    // If param was a request_id, find the first accepted dispatch for it
    if (dispatchRows.length === 0) {
      [dispatchRows] = await connection.query(
        `SELECT rd.id, rd.request_id, rd.donor_id, rd.status AS dispatch_status,
                r.seeker_id, r.hospital_id, r.units_required, r.units_fulfilled, r.status AS request_status,
                d.user_id AS donor_user_id
         FROM request_dispatches rd
         JOIN blood_requests r ON rd.request_id = r.id
         JOIN donors d ON rd.donor_id = d.id
         WHERE rd.request_id = ? AND rd.status = 'accepted'
         LIMIT 1 FOR UPDATE`,
        [rawParamId]
      );
    }

    if (dispatchRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Active accepted dispatch record not found.' });
    }

    const dispatch = dispatchRows[0];

    // Authorization check
    if (!checkRequestPermission(req.user, dispatch)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Forbidden: You are not authorized to confirm this donation.' });
    }

    // Must be in accepted status
    if (dispatch.dispatch_status !== 'accepted') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot complete donation: Dispatch status is '${dispatch.dispatch_status}'. Donor must accept first.`
      });
    }

    if (dispatch.request_status === 'fulfilled' || dispatch.request_status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot complete donation: Blood request is already marked as '${dispatch.request_status}'.`
      });
    }

    // Check if donation already recorded for this dispatch
    const [existingHistory] = await connection.query(
      'SELECT id FROM donations_history WHERE dispatch_id = ? LIMIT 1',
      [dispatch.id]
    );

    if (existingHistory.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'This donation has already been confirmed and recorded in history.'
      });
    }

    // Validate units remaining
    const remainingUnits = dispatch.units_required - dispatch.units_fulfilled;
    if (units > remainingUnits) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Donated units (${units}) cannot exceed remaining units required (${remainingUnits}).`
      });
    }

    // 2. Compute 90-day cooldown
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() + 90);

    // 3. Insert into donations_history
    await connection.query(
      `INSERT INTO donations_history (donor_id, request_id, dispatch_id, units_donated, donated_on, cooldown_until)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [dispatch.donor_id, dispatch.request_id, dispatch.id, units, cooldownDate]
    );

    // 4. Update dispatch status to 'completed'
    await connection.query(
      "UPDATE request_dispatches SET status = 'completed' WHERE id = ?",
      [dispatch.id]
    );

    // 5. Update donor profile: enforce cooldown and lock availability
    await connection.query(
      `UPDATE donors 
       SET last_donation_date = CURRENT_DATE,
           cooldown_until = ?,
           availability_status = 'cooldown'
       WHERE id = ?`,
      [cooldownDate, dispatch.donor_id]
    );

    // 6. Increment fulfilled units and check if satisfied
    const newFulfilled = dispatch.units_fulfilled + units;
    const isFullySatisfied = newFulfilled >= dispatch.units_required;
    const newRequestStatus = isFullySatisfied ? 'fulfilled' : 'dispatched';

    await connection.query(
      'UPDATE blood_requests SET units_fulfilled = ?, status = ? WHERE id = ?',
      [newFulfilled, newRequestStatus, dispatch.request_id]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `Blood donation successfully confirmed! 90-day medical recovery cooldown engaged for donor until ${cooldownDate.toLocaleDateString()}.`,
      donation: {
        dispatch_id: dispatch.id,
        request_id: dispatch.request_id,
        donor_id: dispatch.donor_id,
        units_donated: units,
        units_fulfilled_total: newFulfilled,
        request_status: newRequestStatus,
        donor_cooldown_until: cooldownDate
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('[Complete Donation Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error completing blood donation.'
    });
  } finally {
    connection.release();
  }
};

/**
 * Retrieve completed donation history for authenticated donor
 * Route: GET /api/matches/history (aliased as /api/donors/history)
 */
const getDonorDonationHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const [donorRows] = await pool.query(
      'SELECT id, cooldown_until, last_donation_date FROM donors WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (donorRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Donor profile not found.' });
    }

    const donor = donorRows[0];

    const [donations] = await pool.query(
      `SELECT 
         dh.id AS donation_id,
         dh.units_donated,
         dh.donated_on,
         dh.donated_on AS donated_at,
         dh.cooldown_until,
         r.patient_name,
         r.patient_name AS recipient_name,
         r.blood_group,
         r.hospital_name_input AS hospital_name,
         r.city AS hospital_city
       FROM donations_history dh
       JOIN blood_requests r ON dh.request_id = r.id
       WHERE dh.donor_id = ?
       ORDER BY dh.donated_on DESC`,
      [donor.id]
    );

    // Calculate remaining cooldown days
    const now = new Date();
    let cooldownRemainingDays = 0;
    if (donor.cooldown_until && new Date(donor.cooldown_until) > now) {
      cooldownRemainingDays = Math.ceil((new Date(donor.cooldown_until) - now) / (1000 * 60 * 60 * 24));
    }

    return res.status(200).json({
      success: true,
      donor_id: donor.id,
      total_donations: donations.length,
      cooldown_until: donor.cooldown_until,
      cooldown_remaining_days: cooldownRemainingDays,
      is_in_cooldown: cooldownRemainingDays > 0,
      donations,
      history: donations
    });

  } catch (error) {
    console.error('[Get Donor History Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving donation history.'
    });
  }
};

module.exports = {
  findNearbyCompatibleDonors,
  previewNearbyDonors,
  dispatchEmergencyRequest,
  getDonorEmergencyAlerts,
  respondToDispatch,
  getRequestMatchedDonors,
  completeDonation,
  getDonorDonationHistory
};
