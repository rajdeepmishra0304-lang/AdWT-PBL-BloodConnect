/**
 * index.js  —  BloodConnect Public Landing Page
 *
 * Responsibilities:
 *  1. Render navbar (guest state)
 *  2. Redirect already-logged-in users to their home page
 *  3. Load live public aggregate stats from GET /api/donors/public-stats
 *  4. Populate blood-group quick-search dropdown
 *  5. Handle donor search form (GET /api/donors/public-search)
 *  6. Load & filter accredited facility list (GET /api/requests/facilities)
 *
 * Depends on: config.js  api.js  auth.js  (loaded first by index.html)
 */

/* ── Init ─────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.redirectIfLoggedIn();   // already logged in? go home

  populateBloodGroupDropdown();
  loadStats();
  loadFacilities();
  bindSearchForm();
  bindFacilitySearch();
});

/* ── Blood-Group Dropdown ─────────────────────────────────────────────── */
function populateBloodGroupDropdown() {
  const sel = document.getElementById('q-blood-group');
  if (!sel) return;
  CONFIG.BLOOD_GROUPS.forEach(bg => {
    const opt = document.createElement('option');
    opt.value = bg;
    opt.textContent = bg;
    sel.appendChild(opt);
  });
}

/* ── Live Stats ───────────────────────────────────────────────────────── */
async function loadStats() {
  try {
    // Uses unauthenticated public stats endpoint
    const data = await API.get('/donors/public-stats');
    document.getElementById('stat-donors').textContent   = data.total_verified_donors   ?? '—';
    document.getElementById('stat-requests').textContent = data.total_fulfilled_requests ?? '—';
    document.getElementById('stat-hospitals').textContent= data.total_facilities         ?? '—';
    document.getElementById('stat-active').textContent   = data.available_donors         ?? '—';
  } catch (_) {
    // Stats are non-critical — silent fail is acceptable on the public page
  }
}

/* ── Donor Quick-Search ───────────────────────────────────────────────── */
function bindSearchForm() {
  const form = document.getElementById('quick-search-form');
  if (form) {
    form.addEventListener('submit', handleDonorSearch);
  }
}

async function handleDonorSearch(e) {
  if (e) e.preventDefault();
  const bloodGroup = document.getElementById('q-blood-group').value.trim();
  const city       = document.getElementById('q-city').value.trim();

  const resultsSection = document.getElementById('search-results');
  const resultsList    = document.getElementById('results-list');
  const emptyState     = document.getElementById('search-empty');
  const heading        = document.getElementById('results-heading');
  const btn            = document.getElementById('btn-search');

  btn.disabled = true;
  btn.textContent = 'Searching…';
  resultsList.innerHTML = '';
  resultsSection.classList.add('hidden');
  emptyState.classList.add('hidden');

  try {
    const params = new URLSearchParams();
    if (bloodGroup) params.set('blood_group', bloodGroup);
    if (city)       params.set('city', city);

    const data = await API.get(`/donors/public-search?${params.toString()}`);
    const donors = data.donors || [];

    if (donors.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      heading.textContent = `${donors.length} donor(s) found in directory`;
      resultsList.innerHTML = donors.map(d => `
        <div class="card donor-result-card">
          <div class="donor-blood-badge badge-${(d.blood_group || '').replace('+','pos').replace('-','neg')}">${escHtml(d.blood_group)}</div>
          <div class="donor-info">
            <strong>${escHtml(d.city || 'Metro Area')}${d.area ? ' · ' + escHtml(d.area) : ''}</strong>
            <span class="text-muted">${d.distance_km != null ? d.distance_km.toFixed(1) + ' km away' : 'Location verified'}</span>
          </div>
          <div class="badge badge-success">Available</div>
        </div>`).join('');
      resultsSection.classList.remove('hidden');
    }
  } catch (err) {
    Toast.show(err.message || 'Search failed. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search Donors';
  }
}

/* ── Facility List ────────────────────────────────────────────────────── */
let _allFacilities = [];

async function loadFacilities() {
  const list  = document.getElementById('facility-list');
  const empty = document.getElementById('facility-empty');

  try {
    const data = await API.get('/requests/facilities');
    _allFacilities = data.facilities || [];
    renderFacilities(_allFacilities);
  } catch (_) {
    if (list) list.innerHTML = '<p class="text-muted">Could not load facilities.</p>';
  }
}

function renderFacilities(facilities) {
  const list  = document.getElementById('facility-list');
  const empty = document.getElementById('facility-empty');
  if (!list) return;

  if (facilities.length === 0) {
    list.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');
  list.innerHTML = facilities.map(f => `
    <div class="card facility-card">
      <div class="facility-icon">${f.entity_type === 'hospital' ? '🏥' : '👨‍⚕️'}</div>
      <div class="facility-details">
        <strong>${escHtml(f.name)}</strong>
        <span class="text-muted">${escHtml(f.city || '')}${f.license_number ? ' · Reg# ' + escHtml(f.license_number) : ''}</span>
      </div>
      <span class="badge badge-${f.is_active ? 'success' : 'secondary'}">${f.is_active ? 'Active' : 'Inactive'}</span>
    </div>`).join('');
}

function bindFacilitySearch() {
  const input = document.getElementById('facility-search-input');
  if (!input) return;
  input.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = _allFacilities.filter(f =>
      f.name.toLowerCase().includes(q) || (f.city || '').toLowerCase().includes(q)
    );
    renderFacilities(filtered);
  });
}

/* ── Utility ──────────────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
