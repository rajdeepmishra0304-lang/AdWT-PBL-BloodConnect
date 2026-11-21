/**
 * BloodConnect - Authenticated Document Access Routes
 * Architecture: All document streams require valid authentication and ownership validation
 */

const express = require('express');
const router = express.Router();
const { getDocumentByFilename } = require('../controllers/documentController');
const { authenticate } = require('../middleware/authMiddleware');

// Authenticated document retrieval route
router.get('/file/:filename', authenticate, getDocumentByFilename);

module.exports = router;
