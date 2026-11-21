/**
 * BloodConnect - Blood Compatibility Matrix & Antigen Matching
 * Architecture: Human ABO and Rh Factor Clinical Compatibility Standard
 */

/**
 * Maps each recipient blood group to the list of clinically compatible donor blood groups
 * for whole blood / packed red blood cells (PRBC) transfusions.
 */
const RECIPIENT_TO_DONOR_MATRIX = {
  // O Negative: Only receives from O- (Universal RBC Donor)
  'O-': ['O-'],

  // O Positive: Receives from O+ and O-
  'O+': ['O+', 'O-'],

  // A Negative: Receives from A- and O-
  'A-': ['A-', 'O-'],

  // A Positive: Receives from A+, A-, O+, O-
  'A+': ['A+', 'A-', 'O+', 'O-'],

  // B Negative: Receives from B- and O-
  'B-': ['B-', 'O-'],

  // B Positive: Receives from B+, B-, O+, O-
  'B+': ['B+', 'B-', 'O+', 'O-'],

  // AB Negative: Receives from AB-, A-, B-, O-
  'AB-': ['AB-', 'A-', 'B-', 'O-'],

  // AB Positive: Universal Recipient (Receives from all 8 blood groups)
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-']
};

/**
 * Returns array of compatible donor blood groups for a given recipient
 * @param {string} recipientBloodGroup e.g. 'A+', 'O-'
 * @returns {string[]} Array of donor blood types
 */
const getCompatibleDonorBloodGroups = (recipientBloodGroup) => {
  const normalized = (recipientBloodGroup || '').toUpperCase().trim();
  return RECIPIENT_TO_DONOR_MATRIX[normalized] || [];
};

/**
 * Checks whether a specific donor blood group can donate to a recipient
 * @param {string} donorBloodGroup 
 * @param {string} recipientBloodGroup 
 * @returns {boolean} True if compatible, false otherwise
 */
const isBloodCompatible = (donorBloodGroup, recipientBloodGroup) => {
  const compatibleDonors = getCompatibleDonorBloodGroups(recipientBloodGroup);
  return compatibleDonors.includes((donorBloodGroup || '').toUpperCase().trim());
};

module.exports = {
  RECIPIENT_TO_DONOR_MATRIX,
  getCompatibleDonorBloodGroups,
  isBloodCompatible
};
