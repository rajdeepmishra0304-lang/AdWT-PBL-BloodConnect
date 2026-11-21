-- =====================================================
-- BloodConnect Database Schema (MySQL 8.x)
-- =====================================================
CREATE DATABASE IF NOT EXISTS bloodconnect
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bloodconnect;

-- -----------------------------------------------------
-- 1. users
-- -----------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  phone         VARCHAR(15)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('donor','seeker','hospital','admin') NOT NULL,
  is_verified   TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 2. donors
-- -----------------------------------------------------
CREATE TABLE donors (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NOT NULL,
  blood_group         ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  date_of_birth       DATE NOT NULL,
  gender              ENUM('male','female','other') NOT NULL,
  weight_kg           DECIMAL(5,2) NOT NULL,
  city                VARCHAR(80)  NOT NULL,
  area                VARCHAR(120) NULL,
  latitude            DECIMAL(9,6) NOT NULL,
  longitude           DECIMAL(9,6) NOT NULL,
  availability_status ENUM('available','busy','cooldown') NOT NULL DEFAULT 'busy',
  is_verified         TINYINT(1) NOT NULL DEFAULT 0,
  last_donation_date  DATE NULL,
  cooldown_until      DATETIME NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_donors_user (user_id),
  KEY idx_donors_match (blood_group, availability_status, is_verified),
  KEY idx_donors_city (city),
  KEY idx_donors_geo (latitude, longitude),
  CONSTRAINT fk_donors_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_donor_weight CHECK (weight_kg >= 50),
  CONSTRAINT chk_donor_lat CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_donor_lng CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 3. donor_verifications
-- -----------------------------------------------------
CREATE TABLE donor_verifications (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  donor_id                INT UNSIGNED NOT NULL,
  aadhar_masked           CHAR(12) NOT NULL,
  id_document_path        VARCHAR(255) NOT NULL,
  medical_document_path   VARCHAR(255) NULL,
  background_declaration  TINYINT(1) NOT NULL DEFAULT 0,
  status                  ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  admin_remarks           VARCHAR(255) NULL,
  reviewed_by             INT UNSIGNED NULL,
  reviewed_at             DATETIME NULL,
  submitted_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dv_status (status),
  KEY idx_dv_donor (donor_id),
  CONSTRAINT fk_dv_donor FOREIGN KEY (donor_id)
    REFERENCES donors (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_dv_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 4. verified_hospitals_doctors
-- -----------------------------------------------------
CREATE TABLE verified_hospitals_doctors (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type       ENUM('hospital','doctor') NOT NULL,
  name              VARCHAR(150) NOT NULL,
  license_number    VARCHAR(60)  NOT NULL,
  specialization    VARCHAR(100) NULL,
  affiliated_hospital_id INT UNSIGNED NULL,
  city              VARCHAR(80)  NOT NULL,
  address           VARCHAR(255) NULL,
  latitude          DECIMAL(9,6) NULL,
  longitude         DECIMAL(9,6) NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vhd_license (license_number),
  KEY idx_vhd_type_name (entity_type, name),
  KEY idx_vhd_city (city),
  CONSTRAINT fk_vhd_affiliated FOREIGN KEY (affiliated_hospital_id)
    REFERENCES verified_hospitals_doctors (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 5. blood_requests
-- -----------------------------------------------------
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
  prescription_path     VARCHAR(255) NOT NULL,
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
  CONSTRAINT chk_br_units CHECK (units_required BETWEEN 1 AND 10),
  CONSTRAINT chk_br_fulfilled CHECK (units_fulfilled <= units_required)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 6. request_dispatches
-- -----------------------------------------------------
CREATE TABLE request_dispatches (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id    INT UNSIGNED NOT NULL,
  donor_id      INT UNSIGNED NOT NULL,
  status        ENUM('notified','accepted','declined') NOT NULL DEFAULT 'notified',
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

-- -----------------------------------------------------
-- 7. donations_history
-- -----------------------------------------------------
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
    REFERENCES donors (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_dh_request FOREIGN KEY (request_id)
    REFERENCES blood_requests (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_dh_dispatch FOREIGN KEY (dispatch_id)
    REFERENCES request_dispatches (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Triggers: automatic 90-day cooldown on donation
-- -----------------------------------------------------
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