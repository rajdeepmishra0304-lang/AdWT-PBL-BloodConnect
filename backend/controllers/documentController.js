/**
 * BloodConnect - Authenticated Document Access Controller
 * Architecture: Zero public static uploads. Every file request enforces strict
 * Role-Based Access Control and ownership checks before streaming.
 */

const path = require('path');
const fs = require('fs');
const { pool } = require('../config/db');
const { uploadDir } = require('../middleware/uploadMiddleware');

/**
 * Stream an authenticated document by filename
 * Route: GET /api/documents/file/:filename
 * Middleware: authenticate
 */
const getDocumentByFilename = async (req, res) => {
  try {
    const rawFilename = req.params.filename;
    const user = req.user;

    if (!rawFilename || typeof rawFilename !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid filename.' });
    }

    // Path traversal defense
    const sanitizedFilename = path.basename(rawFilename);
    if (sanitizedFilename !== rawFilename || rawFilename.includes('..') || rawFilename.includes('\0')) {
      return res.status(400).json({ success: false, message: 'Invalid or prohibited file path.' });
    }

    const fullFilePath = path.join(uploadDir, sanitizedFilename);
    if (!fs.existsSync(fullFilePath)) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    // 1. Check if file is a donor verification document (ID Proof or Medical Record)
    const [donorDocs] = await pool.query(
      `SELECT dv.id, dv.id_document_path, dv.medical_document_path, d.user_id
       FROM donor_verifications dv
       JOIN donors d ON dv.donor_id = d.id
       WHERE dv.id_document_path LIKE ? OR dv.medical_document_path LIKE ?
       LIMIT 1`,
      [`%${sanitizedFilename}%`, `%${sanitizedFilename}%`]
    );

    if (donorDocs.length > 0) {
      const doc = donorDocs[0];
      const isOwner = user.id === doc.user_id;
      const isAdmin = user.role === 'admin';

      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have permission to view this confidential identity document.'
        });
      }

      return res.sendFile(fullFilePath);
    }

    // 2. Check if file is a blood request prescription
    const [reqDocs] = await pool.query(
      `SELECT id, seeker_id, hospital_id, prescription_path
       FROM blood_requests
       WHERE prescription_path LIKE ?
       LIMIT 1`,
      [`%${sanitizedFilename}%`]
    );

    if (reqDocs.length > 0) {
      const bReq = reqDocs[0];
      const isSeekerOwner = user.id === bReq.seeker_id;
      const isAdmin = user.role === 'admin';
      const isAffiliatedHospital = user.role === 'hospital' && user.hospital_facility_id && user.hospital_facility_id === bReq.hospital_id;

      if (!isAdmin && !isSeekerOwner && !isAffiliatedHospital) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have permission to view this medical prescription.'
        });
      }

      return res.sendFile(fullFilePath);
    }

    // If file exists on disk but is not associated with any authorized entity, restrict to admin only
    if (user.role === 'admin') {
      return res.sendFile(fullFilePath);
    }

    return res.status(403).json({
      success: false,
      message: 'Forbidden: Unassociated document access restricted.'
    });

  } catch (error) {
    console.error('[Get Document Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving document.'
    });
  }
};

module.exports = {
  getDocumentByFilename
};
