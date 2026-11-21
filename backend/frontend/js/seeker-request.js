/**
 * seeker-request.js  —  BloodConnect Emergency Request Submission
 *
 * Responsibilities:
 *  1. requireAuth() + requireRole('seeker', 'hospital')
 *  2. Blood-group dropdown population
 *  3. Facility autocomplete for hospital & doctor (GET /api/requests/facilities)
 *  4. Geolocation capture
 *  5. Build FormData → POST /api/requests/create
 *  6. Redirect to seeker/dashboard.html on success
 *
 * Depends on: config.js  api.js  auth.js
 */

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.requireRole(CONFIG.ROLES.SEEKER, CONFIG.ROLES.HOSPITAL);

  populateBloodGroups();
  bindAutocomplete('hospital-search', 'hospital-dropdown', 'hospital_name', 'hospital');
  bindAutocomplete('doctor-search', 'doctor-dropdown', 'doctor_name', 'doctor');
  bindGeolocation();
  setMinDate();

  document.getElementById('request-form').addEventListener('submit', handleSubmit);
});

/* ── Blood Groups ─────────────────────────────────────────────────────── */
function populateBloodGroups() {
  const sel = document.getElementById('blood_group_needed');
  CONFIG.BLOOD_GROUPS.forEach(bg => {
    const opt = document.createElement('option');
    opt.value = bg;
    opt.textContent = bg;
    sel.appendChild(opt);
  });
}

/* ── Facility Autocomplete ────────────────────────────────────────────── */
function bindAutocomplete(inputId, dropdownId, hiddenId, entityType) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const hidden   = document.getElementById(hiddenId);

  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    hidden.value = '';                   // reset selection on new keypress

    const q = input.value.trim();
    if (q.length < 2) { dropdown.classList.add('hidden'); return; }

    debounceTimer = setTimeout(async () => {
      try {
        const data = await API.get(`/requests/facilities?query=${encodeURIComponent(q)}&type=${entityType}`);
        const items = (data.facilities || []).filter(f => f.is_active);
        renderDropdown(items, dropdown, hidden, input);
      } catch (_) {
        dropdown.classList.add('hidden');
      }
    }, 300);
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function renderDropdown(items, dropdown, hidden, input) {
  if (items.length === 0) { dropdown.classList.add('hidden'); return; }

  dropdown.innerHTML = items.map(f => `
    <div class="autocomplete-item" data-name="${escHtml(f.name)}">
      ${f.entity_type === 'hospital' ? '🏥' : '👨‍⚕️'} ${escHtml(f.name)}
      <small class="text-muted">${escHtml(f.city || '')}</small>
    </div>`).join('');

  dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      input.value  = name;
      hidden.value = name;
      dropdown.classList.add('hidden');
    });
  });

  dropdown.classList.remove('hidden');
}

/* ── Geolocation ──────────────────────────────────────────────────────── */
function bindGeolocation() {
  document.getElementById('btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) {
      Toast.show('Geolocation not supported.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        document.getElementById('req-latitude').value  = pos.coords.latitude.toFixed(6);
        document.getElementById('req-longitude').value = pos.coords.longitude.toFixed(6);
        Toast.show('Location captured!', 'success', 2000);
      },
      () => Toast.show('Could not get location. Enter manually.', 'warning')
    );
  });
}

/* ── Set minimum date to today ────────────────────────────────────────── */
function setMinDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('required_by').min = today;
  document.getElementById('required_by').value = today;
}

/* ── Form Submit ──────────────────────────────────────────────────────── */
async function handleSubmit(e) {
  e.preventDefault();
  clearErrors();

  const patientName   = document.getElementById('patient_name').value.trim();
  const bloodGroup    = document.getElementById('blood_group_needed').value;
  const units         = document.getElementById('units_needed').value;
  const urgency       = document.getElementById('urgency_level').value;
  const requiredBy    = document.getElementById('required_by').value;
  const hospitalName  = document.getElementById('hospital_name').value.trim();
  const doctorName    = document.getElementById('doctor_name').value.trim();
  const lat           = document.getElementById('req-latitude').value;
  const lng           = document.getElementById('req-longitude').value;
  const prescription  = document.getElementById('prescription').files[0];
  const notes         = document.getElementById('additional_notes').value.trim();

  let valid = true;
  if (!patientName)  { showError('err-patient_name', 'Patient name is required.');   valid = false; }
  if (!bloodGroup)   { showError('err-blood_group_needed', 'Select a blood group.'); valid = false; }
  if (!requiredBy)   { showError('err-required_by', 'Required-by date needed.');     valid = false; }
  if (!hospitalName) { showError('err-hospital_name', 'Select a verified hospital.'); valid = false; }
  if (!doctorName)   { showError('err-doctor_name', 'Select a verified doctor.');    valid = false; }
  if (!lat || !lng)  { showError('err-latitude', 'Location is required.');           valid = false; }
  if (!valid) return;

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = '⏳ Submitting…';

  const fd = new FormData();
  fd.append('patient_name',   patientName);
  fd.append('blood_group_needed', bloodGroup);
  fd.append('units_needed',   units);
  fd.append('urgency_level',  urgency);
  fd.append('required_by',    requiredBy);
  fd.append('hospital_name',  hospitalName);
  fd.append('doctor_name',    doctorName);
  fd.append('latitude',       lat);
  fd.append('longitude',      lng);
  fd.append('additional_notes', notes);
  if (prescription) fd.append('prescription', prescription);

  try {
    const res = await API.postFormData('/requests/create', fd);
    Toast.show('Request submitted! Redirecting to dashboard…', 'success', 2000);
    setTimeout(() => { window.location.href = 'seeker/dashboard.html'; }, 1000);
  } catch (err) {
    Toast.show(err.message || 'Submission failed.', 'error');
    btn.disabled = false;
    btn.textContent = '🆘 Submit Emergency Request';
  }
}

/* ── Utility ──────────────────────────────────────────────────────────── */
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => { el.textContent = ''; });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
