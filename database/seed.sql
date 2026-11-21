-- ============================================================================
-- BloodConnect: Master Seed Data Script (MySQL 8.0+)
-- Passwords:
--   Admin: admin@bloodconnect.in / Admin@1234
--   All other demo users: Password@123
-- ============================================================================

USE bloodconnect;

SET @admin_pw = '$2a$10$bSUniMo5saZXDGdpJqDoJuGZS0wkVujxXP4osrDOeuz/euDb/D4UG';
SET @user_pw  = '$2a$10$ywKB5vmXk/4/e9Dm8UPnle7j8oKtMquhA1qbjpzqNLVG.0zU5kUZ6';

-- 1. Seed Accredited Hospitals
INSERT INTO verified_hospitals_doctors
  (id, entity_type, name, license_number, specialization, affiliated_hospital_id, city, address, latitude, longitude, is_active) VALUES
(1, 'hospital', 'Maharaja Yeshwantrao Hospital (MY)',   'MP-HOSP-IND-0001', NULL, NULL, 'Indore', 'AB Road, Near Indore Main, Indore', 22.7210, 75.8570, 1),
(2, 'hospital', 'Choithram Hospital & Research Centre', 'MP-HOSP-IND-0002', NULL, NULL, 'Indore', 'Manik Bagh Road, Indore',           22.6935, 75.8737, 1),
(3, 'hospital', 'Bombay Hospital Indore',               'MP-HOSP-IND-0003', NULL, NULL, 'Indore', 'Ring Road, Indore',                 22.7507, 75.8932, 1),
(4, 'hospital', 'CHL Hospital',                         'MP-HOSP-IND-0004', NULL, NULL, 'Indore', 'AB Road, LIG Square, Indore',       22.7253, 75.8788, 1),
(5, 'hospital', 'Apollo Rajshree Hospital',             'MP-HOSP-IND-0005', NULL, NULL, 'Indore', 'Scheme 74C, Vijay Nagar, Indore',   22.7545, 75.8987, 1),
(6, 'hospital', 'Medanta Super Speciality Hospital',    'MP-HOSP-IND-0006', NULL, NULL, 'Indore', 'Ring Road, Vijay Nagar, Indore',    22.7425, 75.8920, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 2. Seed Accredited Doctors (With matching hospital affiliations)
INSERT INTO verified_hospitals_doctors
  (id, entity_type, name, license_number, specialization, affiliated_hospital_id, city, is_active) VALUES
(7,  'doctor', 'Dr. Anil Mehta',     'MPMC/2008/10345', 'Hematology',         2, 'Indore', 1),
(8,  'doctor', 'Dr. Sunita Rao',     'MPMC/2011/12876', 'General Surgery',    1, 'Indore', 1),
(9,  'doctor', 'Dr. Rajesh Bhatia',  'MPMC/2005/09123', 'Cardiology',         3, 'Indore', 1),
(10, 'doctor', 'Dr. Farah Siddiqui', 'MPMC/2014/15432', 'Obstetrics',         4, 'Indore', 1),
(11, 'doctor', 'Dr. Karan Malhotra', 'MPMC/2010/11789', 'Orthopedics',        5, 'Indore', 1),
(12, 'doctor', 'Dr. Neelam Joshi',   'MPMC/2012/13210', 'Oncology',           6, 'Indore', 1),
(13, 'doctor', 'Dr. Prakash Iyer',   'MPMC/2003/08011', 'Pediatrics',         1, 'Indore', 1),
(14, 'doctor', 'Dr. Shweta Pandey',  'MPMC/2016/17654', 'Emergency Medicine', 2, 'Indore', 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 3. Seed Users
INSERT INTO users (id, full_name, email, phone, password_hash, role, is_verified, hospital_facility_id) VALUES
(1,  'System Admin',         'admin@bloodconnect.in',        '9000000001', @admin_pw, 'admin',    1, NULL),
(2,  'Meera Kapoor',         'meera@example.com',            '9000000002', @user_pw,  'seeker',   1, NULL),
(3,  'Arjun Nair',           'arjun@example.com',            '9000000003', @user_pw,  'seeker',   1, NULL),
(4,  'Sunita Deshmukh',      'sunita@example.com',           '9000000004', @user_pw,  'seeker',   1, NULL),
(5,  'Choithram Blood Bank', 'bloodbank@choithram.example',  '9000000005', @user_pw,  'hospital', 1, 2),
(6,  'Aarav Sharma',         'aarav@example.com',            '9000000006', @user_pw,  'donor',    1, NULL),
(7,  'Priya Verma',          'priya@example.com',            '9000000007', @user_pw,  'donor',    1, NULL),
(8,  'Rohan Patel',          'rohan@example.com',            '9000000008', @user_pw,  'donor',    1, NULL),
(9,  'Sneha Joshi',          'sneha@example.com',            '9000000009', @user_pw,  'donor',    1, NULL),
(10, 'Imran Khan',           'imran@example.com',            '9000000010', @user_pw,  'donor',    1, NULL),
(11, 'Neha Agarwal',         'neha@example.com',             '9000000011', @user_pw,  'donor',    1, NULL),
(12, 'Vikram Chouhan',       'vikram@example.com',           '9000000012', @user_pw,  'donor',    1, NULL),
(13, 'Kavita Mishra',        'kavita@example.com',           '9000000013', @user_pw,  'donor',    1, NULL),
(14, 'Deepak Rathore',       'deepak@example.com',           '9000000014', @user_pw,  'donor',    1, NULL),
(15, 'Anjali Tiwari',        'anjali@example.com',           '9000000015', @user_pw,  'donor',    1, NULL),
(16, 'Rahul Gupta',          'rahul@example.com',            '9000000016', @user_pw,  'donor',    1, NULL),
(17, 'Pooja Malviya',        'pooja@example.com',            '9000000017', @user_pw,  'donor',    1, NULL),
(18, 'Manish Yadav',         'manish@example.com',           '9000000018', @user_pw,  'donor',    0, NULL),
(19, 'Ritu Saxena',          'ritu@example.com',             '9000000019', @user_pw,  'donor',    0, NULL)
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

-- 4. Seed Verified Donors Across All 8 Blood Groups
INSERT INTO donors
  (id, user_id, blood_group, date_of_birth, gender, weight_kg, city, area, latitude, longitude, availability_status, is_verified) VALUES
(1,  6,  'O+',  '1996-03-14', 'male',   72.5, 'Indore', 'Vijay Nagar',  22.7533, 75.8937, 'available', 1),
(2,  7,  'A+',  '1994-07-22', 'female', 58.0, 'Indore', 'Palasia',      22.7244, 75.8839, 'available', 1),
(3,  8,  'B+',  '1991-11-05', 'male',   80.0, 'Indore', 'Rajwada',      22.7185, 75.8553, 'available', 1),
(4,  9,  'O-',  '1998-01-30', 'female', 61.0, 'Indore', 'Bhawarkua',    22.6944, 75.8678, 'available', 1),
(5,  10, 'AB+', '1993-09-18', 'male',   76.0, 'Indore', 'Saket Nagar',  22.7000, 75.8890, 'available', 1),
(6,  11, 'A-',  '1997-05-09', 'female', 55.5, 'Indore', 'Scheme 78',    22.7500, 75.9000, 'available', 1),
(7,  12, 'B-',  '1990-12-25', 'male',   85.0, 'Indore', 'Rau',          22.6370, 75.8000, 'available', 1),
(8,  13, 'AB-', '1995-04-02', 'female', 62.0, 'Indore', 'Khajrana',     22.7420, 75.9070, 'available', 1),
(9,  14, 'O+',  '1992-08-16', 'male',   78.0, 'Indore', 'Sudama Nagar', 22.7040, 75.8350, 'busy',      1),
(10, 15, 'A+',  '1999-02-11', 'female', 57.0, 'Mhow',   'Mhow Cantt',   22.5522, 75.7618, 'available', 1),
(11, 16, 'O+',  '1994-10-27', 'male',   70.0, 'Indore', 'Annapurna',    22.6860, 75.8300, 'available', 1),
(12, 17, 'O+',  '1996-06-08', 'female', 59.5, 'Indore', 'Palasia',      22.7260, 75.8810, 'available', 1),
(13, 18, 'B+',  '1993-03-21', 'male',   74.0, 'Indore', 'Sarafa',       22.7195, 75.8560, 'busy',      0),
(14, 19, 'A+',  '1995-12-01', 'female', 64.0, 'Indore', 'Bhawarkua',    22.6950, 75.8690, 'busy',      0)
ON DUPLICATE KEY UPDATE blood_group=VALUES(blood_group);

-- 5. Seed Donor Verifications
INSERT INTO donor_verifications
  (id, donor_id, aadhar_masked, id_document_path, medical_document_path, background_declaration, status, admin_remarks, reviewed_by, reviewed_at) VALUES
(1,  1,  'XXXXXXXX1001', 'uploads/seed/d1_id.pdf',  'uploads/seed/d1_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(2,  2,  'XXXXXXXX1002', 'uploads/seed/d2_id.pdf',  'uploads/seed/d2_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(3,  3,  'XXXXXXXX1003', 'uploads/seed/d3_id.pdf',  'uploads/seed/d3_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(4,  4,  'XXXXXXXX1004', 'uploads/seed/d4_id.pdf',  'uploads/seed/d4_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(5,  5,  'XXXXXXXX1005', 'uploads/seed/d5_id.pdf',  'uploads/seed/d5_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(6,  6,  'XXXXXXXX1006', 'uploads/seed/d6_id.pdf',  'uploads/seed/d6_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(7,  7,  'XXXXXXXX1007', 'uploads/seed/d7_id.pdf',  'uploads/seed/d7_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(8,  8,  'XXXXXXXX1008', 'uploads/seed/d8_id.pdf',  'uploads/seed/d8_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(9,  9,  'XXXXXXXX1009', 'uploads/seed/d9_id.pdf',  'uploads/seed/d9_med.pdf',  1, 'verified', 'Documents valid', 1, NOW()),
(10, 10, 'XXXXXXXX1010', 'uploads/seed/d10_id.pdf', 'uploads/seed/d10_med.pdf', 1, 'verified', 'Documents valid', 1, NOW()),
(11, 11, 'XXXXXXXX1011', 'uploads/seed/d11_id.pdf', 'uploads/seed/d11_med.pdf', 1, 'verified', 'Documents valid', 1, NOW()),
(12, 12, 'XXXXXXXX1012', 'uploads/seed/d12_id.pdf', 'uploads/seed/d12_med.pdf', 1, 'verified', 'Documents valid', 1, NOW()),
(13, 13, 'XXXXXXXX1013', 'uploads/seed/d13_id.pdf', NULL,                       1, 'pending',  NULL,              NULL, NULL),
(14, 14, 'XXXXXXXX1014', 'uploads/seed/d14_id.pdf', 'uploads/seed/d14_med.pdf', 1, 'rejected', 'ID unreadable, please re-upload', 1, NOW())
ON DUPLICATE KEY UPDATE status=VALUES(status);
