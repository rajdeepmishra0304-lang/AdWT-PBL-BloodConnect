/**
 * BloodConnect - Emergency Blood Request Routes
 * Endpoints:
 *  POST  /api/requests/create       - Submit emergency blood requisition with prescription
 *  GET   /api/requests/my           - List all requests for the authenticated seeker
 *  GET   /api/requests/facilities   - Search verified hospitals & doctors directory (autocomplete)
 *  GET   /api/requests/:id          - Retrieve detailed single request
 *  PATCH /api/requests/:id/cancel   - Cancel active requisition
 */

const express = require('express');
const router = express.Router();
const {
  createBloodRequest,
  getSeekerRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
  searchVerifiedFacilities
} = require('../controllers/requestController');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const { uploadPrescription } = require('../middleware/uploadMiddleware');

// Public facility lookup for UI autocomplete
router.get('/facilities', searchVerifiedFacilities);

// Protected routes (Seeker / Hospital / Admin)
router.post('/create', authenticate, authorizeRoles('seeker', 'hospital'), uploadPrescription, createBloodRequest);
router.get('/my', authenticate, authorizeRoles('seeker', 'hospital'), getSeekerRequests);
router.get('/:id', authenticate, getRequestById);
router.patch('/:id/cancel', authenticate, authorizeRoles('seeker', 'hospital', 'admin'), cancelRequest);
router.delete('/:id', authenticate, authorizeRoles('seeker', 'hospital', 'admin'), deleteRequest);

module.exports = router;
