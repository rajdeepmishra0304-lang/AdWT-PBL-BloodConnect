/**
 * donor-register.js  —  BloodConnect Donor Onboarding (Multi-step)
 *
 * Flow:
 *  1. requireAuth() + requireRole('donor') — must be logged in as donor
 *  2. Multi-step form navigation (steps 1 → 2 → 3)
 *  3. On submit → build FormData → POST /api/donors/onboard (multipart)
 *  4. On success → redirect to donor/dashboard.html
 *
 * Depends on: config.js  api.js  auth.js
 */

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.requireRole(CONFIG.ROLES.DONOR);

  populateBloodGroups();
  bindGeolocation();

  document.getElementById('onboard-form').addEventListener('submit', handleOnboard);
});

/* ── Blood group dropdown ─────────────────────────────────────────────── */
function populateBloodGroups() {
  const sel = document.getElementById('blood_group');
  CONFIG.BLOOD_GROUPS.forEach(bg => {
    const opt = document.createElement('option');
    opt.value = bg;
    opt.textContent = bg;
    sel.appendChild(opt);
  });
}

/* ── Geolocation helper ───────────────────────────────────────────────── */
function bindGeolocation() {
  document.getElementById('btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) {
      Toast.show('Geolocation is not supported by your browser.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        document.getElementById('latitude').value  = pos.coords.latitude.toFixed(6);
        document.getElementById('longitude').value = pos.coords.longitude.toFixed(6);
        Toast.show('Location captured!', 'success', 2000);
      },
      () => Toast.show('Could not get location. Enter manually.', 'warning')
    );
  });
}

/* ── Step navigation ──────────────────────────────────────────────────── */
function nextStep(toStep) {
  if (!validateStep(toStep - 1)) return;
  goToStep(toStep);
}

function prevStep(toStep) {
  goToStep(toStep);
}

function goToStep(n) {
  document.querySelectorAll('.form-step').forEach(fs => fs.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');

  document.querySelectorAll('.step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.toggle('active',    s === n);
    dot.classList.toggle('completed', s < n);
  });
}

/* ── Per-step validation ──────────────────────────────────────────────── */
function validateStep(step) {
  clearAllErrors();
  let valid = true;

  if (step === 1) {
    const dob    = document.getElementById('dob').value;
    const bg     = document.getElementById('blood_group').value;
    const weight = parseFloat(document.getElementById('weight_kg').value);

    if (!dob) { showError('err-dob', 'Date of birth is required.'); valid = false; }
    else {
      const age = ageFromDob(dob);
      if (age < 18 || age > 65) { showError('err-dob', `Age must be 18–65 (yours: ${age}).`); valid = false; }
    }
    if (!bg)        { showError('err-blood_group', 'Select a blood group.'); valid = false; }
    if (!weight || weight < 50) { showError('err-weight_kg', 'Min weight is 50 kg.'); valid = false; }
  }

  if (step === 2) {
    const city = document.getElementById('city').value.trim();
    const state= document.getElementById('state').value.trim();
    const lat  = document.getElementById('latitude').value;
    const lng  = document.getElementById('longitude').value;

    if (!city)  { showError('err-city', 'City is required.'); valid = false; }
    if (!state) { showError('err-state', 'State is required.'); valid = false; }
    if (!lat)   { showError('err-latitude', 'Latitude is required.'); valid = false; }
    if (!lng)   { showError('err-longitude', 'Longitude is required.'); valid = false; }
  }

  return valid;
}

/* ── Form submit ──────────────────────────────────────────────────────── */
async function handleOnboard(e) {
  e.preventDefault();
  clearAllErrors();

  const aadhar   = document.getElementById('aadhar_number').value.trim();
  const idProof  = document.getElementById('id_proof').files[0];
  const medRec   = document.getElementById('medical_record').files[0];
  const consent  = document.getElementById('background_check_consent').checked;

  let valid = true;
  if (!/^\d{12}$/.test(aadhar)) { showError('err-aadhar_number', '12-digit Aadhar required.'); valid = false; }
  if (!idProof)  { showError('err-id_proof', 'ID proof document is required.');  valid = false; }
  if (!medRec)   { showError('err-medical_record', 'Medical record is required.'); valid = false; }
  if (!consent)  { showError('err-consent', 'You must consent to proceed.');      valid = false; }
  if (!valid) return;

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const fd = new FormData();
  fd.append('dob',              document.getElementById('dob').value);
  fd.append('blood_group',      document.getElementById('blood_group').value);
  fd.append('weight_kg',        document.getElementById('weight_kg').value);
  fd.append('medical_conditions', document.getElementById('medical_conditions').value.trim());
  fd.append('city',             document.getElementById('city').value.trim());
  fd.append('state',            document.getElementById('state').value.trim());
  fd.append('latitude',         document.getElementById('latitude').value);
  fd.append('longitude',        document.getElementById('longitude').value);
  fd.append('aadhar_number',    aadhar);
  fd.append('background_check_consent', '1');
  fd.append('id_proof',         idProof);
  fd.append('medical_record',   medRec);

  try {
    await API.postFormData('/donors/onboard', fd);
    Toast.show('Onboarding submitted! Awaiting admin verification.', 'success', 3000);
    setTimeout(() => { window.location.href = 'donor/dashboard.html'; }, 1000);
  } catch (err) {
    Toast.show(err.message || 'Submission failed.', 'error');
    btn.disabled = false;
    btn.textContent = 'Submit for Verification';
  }
}

/* ── Utility ──────────────────────────────────────────────────────────── */
function ageFromDob(dobStr) {
  const today = new Date();
  const dob   = new Date(dobStr);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearAllErrors() {
  document.querySelectorAll('.form-error').forEach(el => { el.textContent = ''; });
}
