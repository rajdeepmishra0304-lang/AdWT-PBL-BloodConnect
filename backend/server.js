/**
 * BloodConnect - Server Entry Point
 * Architecture: Express.js REST API with Security Middlewares,
 * Controlled CORS Origin Whitelist, Authenticated Document Streaming,
 * Centralized Error Pipeline, and Connection-Pooled MySQL Database.
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// 1. Load environment variables (supports running from repo root or backend directory)
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config(); // fallback to current working directory if present

// 2. Validate critical environment configurations at startup
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
  console.error('[CRITICAL SECURITY ERROR] JWT_SECRET is missing or insufficiently random (minimum 32 characters required).');
  console.error('Server startup aborted.');
  process.exit(1);
}

const { testConnection, pool } = require('./config/db');
const { securityHeaders } = require('./middleware/securityHeadersMiddleware');
const { errorHandler } = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

// ========================================================
// Security & Global Middlewares
// ========================================================

// Defensive HTTP Security Headers
app.use(securityHeaders);

// CORS with explicit environment allowlist
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5000,http://localhost:5500,http://127.0.0.1:3000,http://127.0.0.1:5500';
const allowedOrigins = rawAllowedOrigins.split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser agents (Postman, curl, server-to-server) or matched origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// NOTE: Public static serving of the uploads directory has been REMOVED for patient confidentiality.
// All sensitive healthcare and identification documents are served exclusively through
// authenticated routes at /api/documents/file/:filename with role & ownership checks.

// ========================================================
// Health Check Endpoint (Safe Minimal Operational Probe)
// ========================================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({
      status: 'UP',
      service: 'BloodConnect REST API',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Health Check DB Probe Failed]', err.message);
    return res.status(503).json({
      status: 'DEGRADED',
      service: 'BloodConnect REST API',
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================================
// Mount Routes
// ========================================================
const authRoutes = require('./routes/authRoutes');
const donorRoutes = require('./routes/donorRoutes');
const requestRoutes = require('./routes/requestRoutes');
const matchRoutes = require('./routes/matchRoutes');
const adminRoutes = require('./routes/adminRoutes');
const documentRoutes = require('./routes/documentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/documents', documentRoutes);

// Public landing page statistics alias
const { getPublicPlatformStats } = require('./controllers/donorController');
app.get('/api/stats/public', getPublicPlatformStats);

// Serve frontend static assets if the directory exists (enables unified single-host deployment)
const frontendDir = path.join(__dirname, 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// Root informational endpoint or landing page
app.get('/', (req, res) => {
  const indexHtmlPath = path.join(__dirname, 'frontend', 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    return res.sendFile(indexHtmlPath);
  }
  res.json({
    message: 'Welcome to BloodConnect REST API',
    healthCheck: '/api/health'
  });
});

// 404 Route Handler
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      message: `API route not found: ${req.method} ${req.originalUrl}`
    });
  }
  const indexHtmlPath = path.join(__dirname, 'frontend', 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    return res.status(404).sendFile(indexHtmlPath);
  }
  res.status(404).send('Page not found');
});

// Centralized Error Handling Middleware (Catches all thrown errors safely)
app.use(errorHandler);

// ========================================================
// Server Startup & DB Handshake
// ========================================================
const startServer = async () => {
  try {
    await testConnection();
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` BloodConnect Backend running on http://localhost:${PORT}`);
      console.log(` Health check available at http://localhost:${PORT}/api/health`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('[Critical Error] Server startup aborted due to database connection failure.');
    process.exit(1);
  }
};

startServer();

module.exports = app;
