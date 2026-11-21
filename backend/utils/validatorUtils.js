/**
 * BloodConnect - Verification & Anti-Fraud Cross-Check Utilities
 * Architecture: Deterministic cross-referencing against state-accredited medical registry
 * with hospital-doctor affiliation validation and city-level scoping.
 */

const { pool } = require('../config/db');

/**
 * Cross-references a blood request's medical facility and attending doctor
 * against the official registry to prevent fraudulent blood requisitions.
 * 
 * Rules:
 *  1. Hospital must be active in the accredited registry (exact license match or exact name match in city).
 *  2. Attending doctor must be active and registered.
 *  3. Critical Affiliation Check: Doctor's affiliated_hospital_id MUST match the verified hospital's ID.
 *  4. Any partial match, missing affiliation, or unregistered facility is routed to manual administrative review.
 * 
 * @param {Object} params
 * @param {string} params.hospitalNameInput - Hospital name or license number
 * @param {string} params.doctorNameInput - Doctor name
 * @param {string} params.doctorLicenseInput - Doctor registration license number
 * @param {string} [params.city] - City of the facility
 * @returns {Promise<Object>} Verification outcome with matched records or audit routing
 */
const crossCheckFacility = async ({
  hospitalNameInput,
  doctorNameInput,
  doctorLicenseInput,
  city
}) => {
  try {
    let matchedHospital = null;
    let matchedDoctor = null;
    const cleanCity = city ? city.trim() : '';

    // 1. Search for hospital: check exact license first, then exact name match in city
    if (hospitalNameInput && hospitalNameInput.trim()) {
      const cleanInput = hospitalNameInput.trim();

      // Exact license search
      let [hRows] = await pool.query(
        `SELECT id, name, license_number, city, latitude, longitude, is_active 
         FROM verified_hospitals_doctors 
         WHERE entity_type = 'hospital' AND is_active = 1 AND license_number = ?
         LIMIT 1`,
        [cleanInput]
      );

      // Name search scoped by city if city is provided
      if (hRows.length === 0) {
        if (cleanCity) {
          [hRows] = await pool.query(
            `SELECT id, name, license_number, city, latitude, longitude, is_active 
             FROM verified_hospitals_doctors 
             WHERE entity_type = 'hospital' AND is_active = 1 AND name = ? AND city = ?
             LIMIT 1`,
            [cleanInput, cleanCity]
          );
        } else {
          [hRows] = await pool.query(
            `SELECT id, name, license_number, city, latitude, longitude, is_active 
             FROM verified_hospitals_doctors 
             WHERE entity_type = 'hospital' AND is_active = 1 AND name = ?
             LIMIT 1`,
            [cleanInput]
          );
        }
      }

      if (hRows.length > 0) {
        matchedHospital = hRows[0];
      }
    }

    // 2. Search for doctor: exact license number takes precedence, then exact name match
    if ((doctorLicenseInput && doctorLicenseInput.trim()) || (doctorNameInput && doctorNameInput.trim())) {
      const cleanDocLicense = doctorLicenseInput ? doctorLicenseInput.trim() : '';
      const cleanDocName = doctorNameInput ? doctorNameInput.trim() : '';

      let [dRows] = [];
      if (cleanDocLicense) {
        [dRows] = await pool.query(
          `SELECT id, name, license_number, affiliated_hospital_id, is_active 
           FROM verified_hospitals_doctors 
           WHERE entity_type = 'doctor' AND is_active = 1 AND license_number = ?
           LIMIT 1`,
          [cleanDocLicense]
        );
      } else if (cleanDocName) {
        [dRows] = await pool.query(
          `SELECT id, name, license_number, affiliated_hospital_id, is_active 
           FROM verified_hospitals_doctors 
           WHERE entity_type = 'doctor' AND is_active = 1 AND name = ?
           LIMIT 1`,
          [cleanDocName]
        );
      }

      if (dRows && dRows.length > 0) {
        matchedDoctor = dRows[0];
      }
    }

    // 3. Validation Logic:
    // Both hospital and doctor must be accredited AND doctor's affiliation must match hospital
    if (matchedHospital && matchedDoctor) {
      if (matchedDoctor.affiliated_hospital_id === matchedHospital.id) {
        return {
          isAutoVerified: true,
          status: 'auto_verified',
          hospitalId: matchedHospital.id,
          doctorId: matchedDoctor.id,
          hospitalName: matchedHospital.name,
          doctorName: matchedDoctor.name,
          latitude: matchedHospital.latitude,
          longitude: matchedHospital.longitude,
          city: matchedHospital.city,
          remarks: 'Automated verification successful: Hospital and affiliated doctor confirmed in accredited registry.'
        };
      } else {
        // Doctor is real, hospital is real, but doctor is NOT affiliated with this hospital!
        return {
          isAutoVerified: false,
          status: 'pending_audit',
          hospitalId: matchedHospital.id,
          doctorId: matchedDoctor.id,
          hospitalName: matchedHospital.name,
          doctorName: matchedDoctor.name,
          latitude: matchedHospital.latitude,
          longitude: matchedHospital.longitude,
          city: matchedHospital.city,
          remarks: 'Flagged for audit: Attending doctor is registered with another hospital, not the specified facility.'
        };
      }
    }

    // 4. Missing or Unverified Entity: Route to administrative audit queue
    const auditReasons = [];
    if (!matchedHospital) auditReasons.push('Hospital facility not found or inactive in accredited registry');
    if (!matchedDoctor) auditReasons.push('Doctor license/credentials unverified in registry');

    return {
      isAutoVerified: false,
      status: 'pending_audit',
      hospitalId: matchedHospital ? matchedHospital.id : null,
      doctorId: matchedDoctor ? matchedDoctor.id : null,
      hospitalName: matchedHospital ? matchedHospital.name : (hospitalNameInput || ''),
      doctorName: matchedDoctor ? matchedDoctor.name : (doctorNameInput || ''),
      latitude: matchedHospital ? matchedHospital.latitude : null,
      longitude: matchedHospital ? matchedHospital.longitude : null,
      city: matchedHospital ? matchedHospital.city : cleanCity,
      remarks: `Pending administrative verification: ${auditReasons.join('; ')}.`
    };

  } catch (error) {
    console.error('[CrossCheck Error]', error);
    return {
      isAutoVerified: false,
      status: 'pending_audit',
      hospitalId: null,
      doctorId: null,
      remarks: 'Automated cross-check encountered an internal error; routed to manual audit queue.'
    };
  }
};

module.exports = {
  crossCheckFacility
};
