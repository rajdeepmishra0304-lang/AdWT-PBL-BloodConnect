/**
 * BloodConnect - Centralized Error Handling Middleware
 * Intercepts uncaught exceptions, multer errors, and database errors,
 * formatting safe, generic JSON error responses without exposing internal details.
 */

const errorHandler = (err, req, res, next) => {
  // Always log detailed stack trace server-side only
  console.error('[Unhandled Application Error]', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size limit exceeded: Maximum allowed file size is 5MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`
    });
  }

  // Handle JSON parsing errors in request body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON payload in request body.'
    });
  }

  // Safe status code determination
  const statusCode = err.statusCode || err.status || 500;

  // Generic, safe response message to client (never expose raw SQL or internal paths)
  const safeMessage = statusCode === 500
    ? 'An unexpected server error occurred. Please try again later or contact support.'
    : (err.message || 'Error processing request.');

  return res.status(statusCode).json({
    success: false,
    message: safeMessage
  });
};

module.exports = {
  errorHandler
};
