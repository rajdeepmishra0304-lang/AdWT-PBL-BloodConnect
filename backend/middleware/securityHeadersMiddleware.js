/**
 * BloodConnect - HTTP Security Headers Middleware
 * Implements defensive HTTP headers without breaking Vanilla frontend DOM execution
 */

const securityHeaders = (req, res, next) => {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent Clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Cross-site scripting legacy filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy (allows geolocation for emergency donor/seeker proximity)
  res.setHeader('Permissions-Policy', 'geolocation=(self)');

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://localhost:5000 http://localhost:3000 http://localhost:5500 http://127.0.0.1:5000 http://127.0.0.1:3000 http://127.0.0.1:5500; font-src 'self';"
  );

  next();
};

module.exports = {
  securityHeaders
};
