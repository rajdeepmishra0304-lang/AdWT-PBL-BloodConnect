/**
 * BloodConnect - Secure Document Upload Pipeline
 * Architecture: Multer disk storage, UUID file renaming, Magic Number binary signature validation,
 * file-size constraints, and orphaned file cleanup utilities.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Resolve target upload directory
const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');

// Ensure upload directory exists synchronously on startup
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Configure secure disk storage engine
 * - Strips user-controlled original filename to neutralize path traversal
 * - Prefixes cryptographically random hex bytes + timestamp
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const randomHash = crypto.randomBytes(16).toString('hex');
    const sanitizedExt = path.extname(file.originalname).toLowerCase();
    const safeFilename = `${file.fieldname}-${Date.now()}-${randomHash}${sanitizedExt}`;
    cb(null, safeFilename);
  }
});

/**
 * Strict MIME-type & extension whitelisting filter
 */
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ];

  const allowedExtensions = ['.pdf', '.jpeg', '.jpg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    const error = new Error(`Unsupported file type: '${file.mimetype}'. Only PDF, JPEG, and PNG documents are permitted.`);
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

/**
 * Verify Magic Numbers (file content signatures) to prevent file extension spoofing
 * @param {string} filePath 
 * @returns {boolean} True if binary content matches valid PDF, JPEG, or PNG signature
 */
const verifyFileSignature = (filePath) => {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // PDF signature: %PDF (0x25 0x50 0x44 0x46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return true;
    }

    // JPEG signature: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return true;
    }

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return true;
    }

    return false;
  } catch (err) {
    console.error('[File Signature Check Error]', err);
    return false;
  }
};

/**
 * Base Multer instance with 5MB limit
 */
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 Megabytes
  },
  fileFilter
});

/**
 * Safely delete an uploaded file by path or filename
 * @param {string} filePathOrName 
 */
const deleteFileSafe = (filePathOrName) => {
  if (!filePathOrName) return;
  try {
    const fileName = path.basename(filePathOrName);
    const fullPath = path.join(uploadDir, fileName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error('[File Deletion Error]', err.message);
  }
};

/**
 * Clean up all files attached to a request (req.files or req.file)
 * @param {Object} req 
 */
const cleanupRequestFiles = (req) => {
  if (req.file) {
    deleteFileSafe(req.file.path || req.file.filename);
  }
  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach(f => deleteFileSafe(f.path || f.filename));
    } else {
      Object.values(req.files).forEach(fileArr => {
        if (Array.isArray(fileArr)) {
          fileArr.forEach(f => deleteFileSafe(f.path || f.filename));
        }
      });
    }
  }
};

/**
 * Wrapper middleware to intercept Multer errors and enforce magic number validation
 */
const handleUploadWithSignatureCheck = (uploadMiddleware) => {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size limit exceeded: Maximum allowed file size is 5MB.'
          });
        }
        if (err.code === 'INVALID_FILE_TYPE') {
          return res.status(400).json({
            success: false,
            message: err.message
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: `Unexpected upload field: '${err.field}'. Please verify form field names.`
          });
        }
        return res.status(400).json({
          success: false,
          message: `File upload error: ${err.message}`
        });
      }

      // Check binary magic numbers on all uploaded files
      const filesToCheck = [];
      if (req.file) filesToCheck.push(req.file);
      if (req.files) {
        if (Array.isArray(req.files)) {
          filesToCheck.push(...req.files);
        } else {
          Object.values(req.files).forEach(arr => {
            if (Array.isArray(arr)) filesToCheck.push(...arr);
          });
        }
      }

      for (const file of filesToCheck) {
        if (!verifyFileSignature(file.path)) {
          // Immediately delete all uploaded files if any fails signature verification
          cleanupRequestFiles(req);
          return res.status(400).json({
            success: false,
            message: `File content verification failed for '${file.originalname}'. The actual file signature does not match permitted document formats (PDF, JPEG, PNG).`
          });
        }
      }

      next();
    });
  };
};

// For donor onboarding: id_proof + medical_record
const uploadDonorDocuments = handleUploadWithSignatureCheck(
  upload.fields([
    { name: 'id_proof', maxCount: 1 },
    { name: 'medical_record', maxCount: 1 }
  ])
);

// For seeker emergency requisition: doctor prescription
const uploadPrescription = handleUploadWithSignatureCheck(
  upload.single('prescription')
);

module.exports = {
  uploadDonorDocuments,
  uploadPrescription,
  uploadDir,
  deleteFileSafe,
  cleanupRequestFiles
};
