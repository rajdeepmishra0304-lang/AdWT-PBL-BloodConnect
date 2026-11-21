/**
 * login.js  —  BloodConnect Login Page
 *
 * Flow:
 *  1. If already logged in → redirect to role home
 *  2. Submit form → POST /api/auth/login
 *  3. On success → Auth.setSession(token, user) → redirect to role home
 *  4. On failure → show inline error toast
 *
 * Depends on: config.js  api.js  auth.js
 */

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.redirectIfLoggedIn();   // already signed in? redirect away

  document.getElementById('login-form').addEventListener('submit', handleLogin);
});

async function handleLogin(e) {
  e.preventDefault();
  clearErrors();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn      = document.getElementById('btn-login');

  // Client-side validation
  let valid = true;
  if (!email) { showError('err-email', 'Email is required.'); valid = false; }
  if (!password) { showError('err-password', 'Password is required.'); valid = false; }
  if (!valid) return;

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const res = await API.post('/auth/login', { email, password });
    // res = { token, user: { id, name, email, role } }
    Auth.setSession(res.token, res.user);
    Toast.show(`Welcome back, ${res.user.name}!`, 'success', 2000);

    // Role-based redirect
    const home = CONFIG.ROLE_HOME[res.user.role] || '/index.html';
    setTimeout(() => { window.location.href = home; }, 500);
  } catch (err) {
    Toast.show(err.message || 'Login failed. Check your credentials.', 'error');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearErrors() {
  ['err-email', 'err-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}
