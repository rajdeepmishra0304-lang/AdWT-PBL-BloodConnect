/**
 * BloodConnect - Database Connection Pool Configuration
 * Architecture: mysql2/promise connection pooling
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Ensure environment variables are loaded
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bloodconnect',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

/**
 * Tests database connectivity
 * @returns {Promise<boolean>} True if connection succeeds, throws error otherwise
 */
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`[Database] Successfully connected to MySQL database: ${process.env.DB_NAME || 'bloodconnect'}`);
    connection.release();
    return true;
  } catch (error) {
    console.error('[Database Error] Failed to connect to MySQL:', error.message);
    throw error;
  }
};

module.exports = {
  pool,
  testConnection
};
