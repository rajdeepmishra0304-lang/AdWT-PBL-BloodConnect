/**
 * config.js
 * Global configuration constants for BloodConnect frontend.
 * All pages load this file first so CONFIG is always available.
 */
const CONFIG = {
  API_BASE_URL: '/api',

  // localStorage key names — centralised so a rename only touches here
  TOKEN_KEY:    'bc_token',
  USER_KEY:     'bc_user',

  // Polling intervals (ms)
  DONOR_ALERT_POLL_MS:   15_000,  // donor dashboard: check new dispatches every 15 s
  SEEKER_STATUS_POLL_MS: 10_000,  // seeker dashboard: check request status every 10 s

  // Blood-group master list (matches DB enum order)
  BLOOD_GROUPS: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],

  // Canonical role names (must match users.role DB enum)
  ROLES: {
    DONOR:    'donor',
    SEEKER:   'seeker',
    HOSPITAL: 'hospital',
    ADMIN:    'admin',
  },

  // Role → home-page redirect map
  ROLE_HOME: {
    donor:    '/donor/dashboard.html',
    seeker:   '/seeker/dashboard.html',
    hospital: '/seeker/dashboard.html', // hospitals use seeker flow
    admin:    '/admin/dashboard.html',
  },
};
