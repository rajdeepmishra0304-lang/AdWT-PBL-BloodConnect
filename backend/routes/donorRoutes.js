/**
 * BloodConnect - Donor Routes
 * Architecture: Onboarding wizard, Profile retrieval, Availability toggle,
 * Alerts polling, History, and Public anonymous donor discovery.
 */

const express = require('express');
const router = express.Router();
const {
  onboardDonor,
  getDonorProfile,
  toggleAvailability,
  publicDonorSearch,
  getPublicPlatformStats
} = require('../controllers/donorController');

const {
  getDonorEmergencyAlerts,
  getDonorDonationHistory
} = require('../controllers/matchController');

const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles, requireVerified } = require('../middleware/roleMiddleware');
const { uploadDonorDocuments } = require('../middleware/uploadMiddleware');

// Public endpoints (no authentication required)
router.get('/public-search', publicDonorSearch);
router.get('/search', publicDonorSearch); // alias for landing page
router.get('/public-stats', getPublicPlatformStats);

// Protected donor endpoints
router.post('/onboard', authenticate, authorizeRoles('donor'), uploadDonorDocuments, onboardDonor);
router.get('/profile', authenticate, authorizeRoles('donor'), getDonorProfile);
router.patch('/availability', authenticate, authorizeRoles('donor'), requireVerified, toggleAvailability);

// Donor alerts and donation history aliases
router.get('/alerts', authenticate, authorizeRoles('donor'), getDonorEmergencyAlerts);
router.get('/history', authenticate, authorizeRoles('donor'), getDonorDonationHistory);

module.exports = router;
