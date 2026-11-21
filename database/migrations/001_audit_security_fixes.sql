-- ============================================================================
-- BloodConnect Migration: 001_audit_security_fixes.sql
-- Non-destructive upgrade script for existing BloodConnect databases
-- ============================================================================

USE bloodconnect;

-- 1. Create token_blacklist table for session revocation & logout
CREATE TABLE IF NOT EXISTS token_blacklist (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tb_token_hash (token_hash),
  KEY idx_tb_expires (expires_at),
  CONSTRAINT fk_tb_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 2. Add hospital_facility_id to users for hospital role affiliation & audit
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = 'bloodconnect' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'hospital_facility_id');

SET @stmt := IF(@col_exists = 0, 
  'ALTER TABLE users ADD COLUMN hospital_facility_id INT UNSIGNED NULL, ADD CONSTRAINT fk_users_hospital_facility FOREIGN KEY (hospital_facility_id) REFERENCES verified_hospitals_doctors (id) ON DELETE SET NULL ON UPDATE CASCADE;',
  'SELECT "hospital_facility_id already exists";');
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- 3. Modify blood_requests prescription_path to allow NULL (no fake placeholder strings)
ALTER TABLE blood_requests MODIFY COLUMN prescription_path VARCHAR(255) NULL;

-- 4. Update request_dispatches status ENUM to include 'completed'
ALTER TABLE request_dispatches 
  MODIFY COLUMN status ENUM('notified','accepted','declined','completed') NOT NULL DEFAULT 'notified';

-- 5. Add CHECK constraints for coordinate validation and medical thresholds
ALTER TABLE donors 
  ADD CONSTRAINT chk_donors_coords CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);

ALTER TABLE blood_requests 
  ADD CONSTRAINT chk_br_coords CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);

-- 6. Enforce ON DELETE RESTRICT on donations_history to preserve completed medical records
ALTER TABLE donations_history DROP FOREIGN KEY fk_dh_request;
ALTER TABLE donations_history 
  ADD CONSTRAINT fk_dh_request FOREIGN KEY (request_id)
    REFERENCES blood_requests (id) ON DELETE RESTRICT ON UPDATE CASCADE;
