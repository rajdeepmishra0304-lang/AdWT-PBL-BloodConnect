/**
 * BloodConnect - Administrative Routes
 * Endpoints:
 *  GET    /api/admin/donors/pending              - Review queue for pending donor verifications
 *  POST   /api/admin/donors/:verificationId/audit - Approve or reject donor onboarding documents
 *  GET    /api/admin/requests/pending            - Review queue for unverified blood requisitions
 *  POST   /api/admin/requests/:requestId/audit   - Approve or reject emergency request
 *  POST   /api/admin/facilities                  - Add accredited hospital or doctor to registry
 *  PUT    /api/admin/facilities/:id              - Full replacement update of a facility (PUT requirement)
 *  GET    /api/admin/facilities                  - List accredited facilities directory
 *  PATCH  /api/admin/facilities/:id/status       - Toggle active status of facility or doctor
 *  PATCH  /api/admin/facilities/:id/toggle       - Alias for status toggle
 *  DELETE /api/admin/facilities/:id              - Delete facility with referential integrity guard
 *  GET    /api/admin/stats                       - System-wide overview metrics
 */

const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/adminController');

const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// All admin routes strictly enforce administrator authorization
router.use(authenticate, authorizeRoles('admin'));

// Audit Queues
router.get('/donors/pending', getPendingDonors);
router.post('/donors/:verificationId/audit', auditDonor);
router.patch('/donors/:verificationId/audit', auditDonor); // support PATCH as well

router.get('/requests/pending', getPendingRequests);
router.post('/requests/:requestId/audit', auditRequest);
router.patch('/requests/:requestId/audit', auditRequest); // support PATCH as well

// Accredited Medical Facility Directory Management (Full CRUD + PUT)
router.post('/facilities', addFacility);
router.put('/facilities/:id', updateFacilityPut); // PBL requirement: PUT method with full replacement
router.get('/facilities', listFacilities);
router.patch('/facilities/:id/status', toggleFacilityStatus);
router.patch('/facilities/:id/toggle', toggleFacilityStatus);
router.delete('/facilities/:id', deleteFacility);

// System Overview Metrics
router.get('/stats', getAdminOverviewStats);

module.exports = router;
