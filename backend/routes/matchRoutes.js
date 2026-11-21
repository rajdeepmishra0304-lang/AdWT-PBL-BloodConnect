/**
 * BloodConnect - Match & Emergency Dispatch Routes
 * Endpoints:
 *  GET  /api/matches/preview/:requestId   - Preview candidate nearby donors within radius
 *  POST /api/matches/dispatch/:requestId  - Broadcast emergency dispatch
 *  GET  /api/matches/donor-alerts         - Retrieve active emergency alerts for donor
 *  POST /api/matches/respond/:dispatchId  - Donor accept or decline emergency alert
 *  GET  /api/matches/request/:requestId   - Seeker live tracking & consent-unlocked contact cards
 *  GET  /api/matches/radar/:requestId     - Alias for radar tracking
 *  POST /api/matches/complete/:dispatchId - Complete blood donation & trigger 90-day cooldown
 *  POST /api/matches/complete-request/:requestId - Complete by request ID
 *  GET  /api/matches/history              - Completed donation history
 */

const express = require('express');
const router = express.Router();
const {
  previewNearbyDonors,
  dispatchEmergencyRequest,
  getDonorEmergencyAlerts,
  respondToDispatch,
  getRequestMatchedDonors,
  completeDonation,
  getDonorDonationHistory
} = require('../controllers/matchController');

const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles, requireVerified } = require('../middleware/roleMiddleware');

// Protected match preview endpoint
router.get('/preview/:requestId', authenticate, previewNearbyDonors);

// Protected emergency dispatch broadcast endpoint (Seeker, Hospital, Admin)
router.post('/dispatch/:requestId', authenticate, authorizeRoles('seeker', 'hospital', 'admin'), dispatchEmergencyRequest);

// Donor alerts retrieval
router.get('/donor-alerts', authenticate, authorizeRoles('donor'), getDonorEmergencyAlerts);

// Donor response: Accept or Decline (Donor role only + account must be verified)
router.post('/respond/:dispatchId', authenticate, authorizeRoles('donor'), requireVerified, respondToDispatch);

// Seeker live radar: View dispatches with conditional contact disclosure
router.get('/request/:requestId', authenticate, getRequestMatchedDonors);
router.get('/radar/:requestId', authenticate, getRequestMatchedDonors);

// Donation fulfillment & cooldown enforcement (Seeker, Hospital, Admin)
router.post('/complete/:dispatchId', authenticate, authorizeRoles('seeker', 'hospital', 'admin'), completeDonation);
router.post('/complete-request/:requestId', authenticate, authorizeRoles('seeker', 'hospital', 'admin'), completeDonation);

// Donor completed donation history
router.get('/history', authenticate, authorizeRoles('donor'), getDonorDonationHistory);

module.exports = router;
