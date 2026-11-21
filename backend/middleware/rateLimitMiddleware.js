/**
 * BloodConnect - Rate Limiting Middleware
 * In-memory sliding window rate limiter for authentication endpoints
 * Protects against brute-force attacks, credential stuffing, and automated registration spam.
 */

const createRateLimiter = ({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many requests, please try again later.' }) => {
  const requests = new Map();

  // Periodically clean expired buckets every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of requests.entries()) {
      const validTimestamps = timestamps.filter(time => now - time < windowMs);
      if (validTimestamps.length === 0) {
        requests.delete(ip);
      } else {
        requests.set(ip, validTimestamps);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const clientRequests = requests.get(ip) || [];
    const recentRequests = clientRequests.filter(time => now - time < windowMs);

    if (recentRequests.length >= max) {
      const oldest = recentRequests[0];
      const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        message,
        retryAfter: `${retryAfterSeconds} seconds`
      });
    }

    recentRequests.push(now);
    requests.set(ip, recentRequests);
    next();
  };
};

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many login attempts from this IP address. Please try again after 15 minutes.'
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Registration limit reached from this network. Please try again in an hour.'
});

module.exports = {
  loginLimiter,
  registerLimiter,
  createRateLimiter
};
