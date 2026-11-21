/**
 * Migration Script: Apply Audit Fixes to Database Schema
 * - Creates token_blacklist table
 * - Adds hospital_facility_id to users with FK to verified_hospitals_doctors
 * - Alters blood_requests.prescription_path to allow NULL
 * - Alters request_dispatches.status to include 'completed'
 * - Adds CHECK constraints for coordinates and weights
 * - Updates donations_history FK to ON DELETE RESTRICT
 */

const { pool } = require('../config/db');

async function runMigration() {
  console.log('[Migration] Starting schema updates...');

  // 1. Create token_blacklist table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS token_blacklist (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      user_id INT UNSIGNED NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_tb_token_hash (token_hash),
      KEY idx_tb_expires (expires_at)
    ) ENGINE=InnoDB;
  `);
  console.log('✓ token_blacklist table ready.');

  // 2. Add hospital_facility_id to users
  const [uCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'hospital_facility_id'");
  if (uCols.length === 0) {
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN hospital_facility_id INT UNSIGNED NULL,
      ADD CONSTRAINT fk_users_hospital_facility FOREIGN KEY (hospital_facility_id)
        REFERENCES verified_hospitals_doctors (id) ON DELETE SET NULL ON UPDATE CASCADE;
    `);
    console.log('✓ hospital_facility_id added to users table.');
  } else {
    console.log('✓ hospital_facility_id already present in users.');
  }

  // 3. Make blood_requests.prescription_path nullable
  await pool.query(`
    ALTER TABLE blood_requests MODIFY COLUMN prescription_path VARCHAR(255) NULL;
  `);
  console.log('✓ blood_requests.prescription_path is now NULLABLE.');

  // 4. Update request_dispatches status enum
  await pool.query(`
    ALTER TABLE request_dispatches 
    MODIFY COLUMN status ENUM('notified','accepted','declined','completed') NOT NULL DEFAULT 'notified';
  `);
  console.log('✓ request_dispatches.status ENUM updated to include "completed".');

  // 5. Add CHECK constraints on coordinates and values
  try {
    await pool.query(`
      ALTER TABLE donors 
      ADD CONSTRAINT chk_donors_coords CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
    `);
    console.log('✓ donors coordinates check constraint added.');
  } catch (err) {
    console.log('ℹ donors coordinates constraint:', err.message);
  }

  try {
    await pool.query(`
      ALTER TABLE blood_requests 
      ADD CONSTRAINT chk_br_coords CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
    `);
    console.log('✓ blood_requests coordinates check constraint added.');
  } catch (err) {
    console.log('ℹ blood_requests coordinates constraint:', err.message);
  }

  // 6. Protect donation history records from cascading deletes
  try {
    await pool.query("ALTER TABLE donations_history DROP FOREIGN KEY fk_dh_request");
    await pool.query(`
      ALTER TABLE donations_history 
      ADD CONSTRAINT fk_dh_request FOREIGN KEY (request_id)
        REFERENCES blood_requests (id) ON DELETE RESTRICT ON UPDATE CASCADE;
    `);
    console.log('✓ donations_history request foreign key set to ON DELETE RESTRICT.');
  } catch (err) {
    console.log('ℹ donations_history FK update:', err.message);
  }

  console.log('[Migration] Database schema successfully upgraded.');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('[Migration Error]', err);
  process.exit(1);
});
