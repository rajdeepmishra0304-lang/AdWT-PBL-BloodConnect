-- ============================================================================
-- BloodConnect: Smart Blood Donor Finder & Emergency Dispatch System
-- Master Database DDL - Fresh Install Schema (MySQL 8.0+)
--
-- Notice: This file initializes the database from scratch.
-- For non-destructive upgrades of an existing database, run:
--   database/migrations/001_audit_security_fixes.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS bloodconnect
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bloodconnect;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS token_blacklist;
DROP TABLE IF EXISTS donations_history;
DROP TABLE IF EXISTS request_dispatches;
DROP TABLE IF EXISTS blood_requests;
DROP TABLE IF EXISTS donor_verifications;
DROP TABLE IF EXISTS donors;
DROP TABLE IF EXISTS verified_hospitals_doctors;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 1. ACCREDITED MEDICAL FACILITIES & LICENSED PHYSICIANS
-- ============================================================================
CREATE TABLE verified_hospitals_doctors (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type     ENUM('hospital','doctor','blood_bank') NOT NULL,
  name            VARCHAR(150) NOT NULL,
  license_number  VARCHAR(60)  NOT NULL,
  specialization  VARCHAR(100) NULL,
  affiliated_hospital_id INT UNSIGNED NULL,
  city            VARCHAR(80)  NOT NULL,
  address         VARCHAR(255) NULL,
  latitude        DECIMAL(9,6) NULL,
  longitude       DECIMAL(9,6) NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vhd_license (license_number),
  KEY idx_vhd_type_name (entity_type, name),
  KEY idx_vhd_city (city),
  CONSTRAINT fk_vhd_affiliated FOREIGN KEY (affiliated_hospital_id)
    REFERENCES verified_hospitals_doctors (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_vhd_coords CHECK (
    (latitude IS NULL AND longitude IS NULL) OR 
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
) ENGINE=InnoDB;

-- ============================================================================
-- 2. USERS TABLE
-- ============================================================================
CREATE TABLE users (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name             VARCHAR(100) NOT NULL,
  email                 VARCHAR(150) NOT NULL,
  phone                 VARCHAR(15)  NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  role                  ENUM('donor','seeker','hospital','admin') NOT NULL,
  is_verified           TINYINT(1) NOT NULL DEFAULT 0,
  hospital_facility_id  INT UNSIGNED NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role (role),
  CONSTRAINT fk_users_hospital_facility FOREIGN KEY (hospital_facility_id)
    REFERENCES verified_hospitals_doctors (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 3. DONORS PROFILE TABLE
-- ============================================================================
CREATE TABLE donors (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id               INT UNSIGNED NOT NULL,
  blood_group           ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  date_of_birth         DATE NOT NULL,
  gender                ENUM('male','female','other') NOT NULL,
  weight_kg             DECIMAL(4,1) NOT NULL,
  city                  VARCHAR(80)  NOT NULL,
  area                  VARCHAR(100) NULL,
  latitude              DECIMAL(9,6) NOT NULL,
  longitude             DECIMAL(9,6) NOT NULL,
  availability_status   ENUM('available','busy','cooldown') NOT NULL DEFAULT 'busy',
  is_verified           TINYINT(1) NOT NULL DEFAULT 0,
  last_donation_date    DATE NULL,
  cooldown_until        DATE NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_donors_user (user_id),
  KEY idx_donors_bg_avail (blood_group, availability_status, is_verified),
  KEY idx_donors_coords (latitude, longitude),
  KEY idx_donors_city (city),
  CONSTRAINT fk_donors_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_donors_weight CHECK (weight_kg >= 45.0),
  CONSTRAINT chk_donors_coords CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- ============================================================================
-- 4. DONOR AUDIT & VERIFICATION RECORDS
-- ============================================================================
CREATE TABLE donor_verifications (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  donor_id              INT UNSIGNED NOT NULL,
  aadhar_masked         VARCHAR(12)  NOT NULL,
  id_document_path      VARCHAR(255) NOT NULL,
  medical_document_path VARCHAR(255) NULL,
  background_declaration TINYINT(1)  NOT NULL DEFAULT 0,
  status                ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  admin_remarks         VARCHAR(255) NULL,
  reviewed_by           INT UNSIGNED NULL,
  reviewed_at           DATETIME NULL,
  submitted_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dv_status (status),
  KEY idx_dv_donor (donor_id),
  CONSTRAINT fk_dv_donor FOREIGN KEY (donor_id)
    REFERENCES donors (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_dv_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 5. BLOOD REQUESTS REQUISITION TABLE
-- ============================================================================
CREATE TABLE blood_requests (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  seeker_id             INT UNSIGNED NOT NULL,
  patient_name          VARCHAR(100) NOT NULL,
  blood_group           ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  units_required        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  units_fulfilled       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  urgency               ENUM('critical','urgent','normal') NOT NULL DEFAULT 'urgent',
  hospital_id           INT UNSIGNED NULL,
  doctor_id             INT UNSIGNED NULL,
  hospital_name_input   VARCHAR(150) NOT NULL,
  doctor_name_input     VARCHAR(150) NOT NULL,
  doctor_license_input  VARCHAR(60)  NULL,
  city                  VARCHAR(80)  NOT NULL,
  latitude              DECIMAL(9,6) NOT NULL,
  longitude             DECIMAL(9,6) NOT NULL,
  prescription_path     VARCHAR(255) NULL,
  status                ENUM('pending_audit','auto_verified','dispatched','fulfilled','cancelled')
                        NOT NULL DEFAULT 'pending_audit',
  admin_remarks         VARCHAR(255) NULL,
  audited_by            INT UNSIGNED NULL,
  audited_at            DATETIME NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_br_status (status),
  KEY idx_br_seeker (seeker_id),
  KEY idx_br_group_city (blood_group, city),
  CONSTRAINT fk_br_seeker FOREIGN KEY (seeker_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_br_hospital FOREIGN KEY (hospital_id)
    REFERENCES verified_hospitals_doctors (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_br_doctor FOREIGN KEY (doctor_id)
    REFERENCES verified_hospitals_doctors (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_br_auditor FOREIGN KEY (audited_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_br_units CHECK (units_required BETWEEN 1 AND 20),
  CONSTRAINT chk_br_fulfilled CHECK (units_fulfilled <= units_required),
  CONSTRAINT chk_br_coords CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- ============================================================================
-- 6. REQUEST DISPATCHES (RADAR NOTIFICATION QUEUE)
-- ============================================================================
CREATE TABLE request_dispatches (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id    INT UNSIGNED NOT NULL,
  donor_id      INT UNSIGNED NOT NULL,
  status        ENUM('notified','accepted','declined','completed') NOT NULL DEFAULT 'notified',
  distance_km   DECIMAL(6,2) NOT NULL,
  notified_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dispatch_request_donor (request_id, donor_id),
  KEY idx_rd_donor_status (donor_id, status),
  KEY idx_rd_request_status (request_id, status),
  CONSTRAINT fk_rd_request FOREIGN KEY (request_id)
    REFERENCES blood_requests (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rd_donor FOREIGN KEY (donor_id)
    REFERENCES donors (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 7. DONATIONS HISTORY & 90-DAY COOLDOWN LOG
-- ============================================================================
CREATE TABLE donations_history (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  donor_id        INT UNSIGNED NOT NULL,
  request_id      INT UNSIGNED NOT NULL,
  dispatch_id     INT UNSIGNED NOT NULL,
  units_donated   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  donated_on      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cooldown_until  DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dh_dispatch (dispatch_id),
  KEY idx_dh_donor (donor_id, donated_on),
  CONSTRAINT fk_dh_donor FOREIGN KEY (donor_id)
    REFERENCES donors (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_dh_request FOREIGN KEY (request_id)
    REFERENCES blood_requests (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_dh_dispatch FOREIGN KEY (dispatch_id)
    REFERENCES request_dispatches (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_dh_units CHECK (units_donated >= 1)
) ENGINE=InnoDB;

-- ============================================================================
-- 8. TOKEN REVOCATION / BLACKLIST TABLE (LOGOUT SESSIONS)
-- ============================================================================
CREATE TABLE token_blacklist (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash  VARCHAR(64) NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  expires_at  DATETIME NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tb_token_hash (token_hash),
  KEY idx_tb_expires (expires_at),
  CONSTRAINT fk_tb_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- TRIGGERS: AUTOMATIC 90-DAY COOLDOWN ON DONATION COMPLETION
-- ============================================================================
DELIMITER $$

CREATE TRIGGER trg_donation_set_cooldown
BEFORE INSERT ON donations_history
FOR EACH ROW
BEGIN
  IF NEW.cooldown_until IS NULL THEN
    SET NEW.cooldown_until = DATE_ADD(NEW.donated_on, INTERVAL 90 DAY);
  END IF;
END$$

CREATE TRIGGER trg_donation_lock_donor
AFTER INSERT ON donations_history
FOR EACH ROW
BEGIN
  UPDATE donors
     SET availability_status = 'cooldown',
         last_donation_date  = DATE(NEW.donated_on),
         cooldown_until      = NEW.cooldown_until
   WHERE id = NEW.donor_id;
END$$

DELIMITER ;
