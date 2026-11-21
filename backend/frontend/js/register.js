/**
 * register.js  —  BloodConnect Registration Page
 *
 * Flow:
 *  1. Validate form fields client-side
 *  2. POST /api/auth/register
 *  3. On success:
 *       - If role === 'donor'  → redirect to donor-register.html (onboarding)
 *       - Else                 → auto-login (setSession) + redirect to role home
 *  4. On failure → Toast error
 *
 * Depends on: config.js  api.js  auth.js
 */

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.redirectIfLoggedIn();
  document.getElementById('register-form').addEventListener('submit', handleRegister);
});

async function handleRegister(e) {
  e.preventDefault();
  clearErrors();

  const name     = document.getElementById('name').value.trim();
  const email    = document.getElementById('email').value.trim();
  const phone    = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const roleEl   = document.querySelector('input[name="role"]:checked');
  const role     = roleEl ? roleEl.value : '';

  // Client-side validation
  let valid = true;
  if (!name)              { showError('err-name', 'Name is required.');           valid = false; }
  if (!email)             { showError('err-email', 'Email is required.');          valid = false; }
  if (!/^\d{10}$/.test(phone)) { showError('err-phone', 'Enter a 10-digit phone.'); valid = false; }
  if (password.length < 6){ showError('err-password', 'Min 6 characters.');       valid = false; }
  if (!role)              { showError('err-role', 'Please select a role.');        valid = false; }
  if (!valid) return;

  const btn = document.getElementById('btn-register');
  btn.disabled = true;
  btn.textContent = 'Creating account…';

  try {
    const res = await API.post('/auth/register', { name, email, phone, password, role });
    // Backend returns { token, user }
    Auth.setSession(res.token, res.user);
    Toast.show('Account created successfully!', 'success', 2000);

    if (role === 'donor') {
      // Donor must complete onboarding before they can donate
      setTimeout(() => { window.location.href = 'donor-register.html'; }, 500);
    } else {
      const home = CONFIG.ROLE_HOME[role] || 'index.html';
      setTimeout(() => { window.location.href = home; }, 500);
    }
  } catch (err) {
    Toast.show(err.message || 'Registration failed.', 'error');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearErrors() {
  ['err-name', 'err-email', 'err-phone', 'err-password', 'err-role'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}
