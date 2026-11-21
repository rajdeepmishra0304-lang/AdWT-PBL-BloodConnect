/**
 * admin-registry.js  —  BloodConnect Facility Registry Management
 *
 * Responsibilities:
 *  1. requireRole('admin')
 *  2. Add facility → POST /api/admin/facilities
 *  3. List facilities with Search, Filter & Pagination → GET /api/admin/facilities?page=X&limit=Y&search=Z
 *  4. Toggle active/inactive status → PATCH /api/admin/facilities/:id/status
 *  5. Permanently delete facility → DELETE /api/admin/facilities/:id
 *
 * Depends on: config.js  api.js  auth.js
 */

let _currentPage = 1;
let _totalPages = 1;
const _limit = 10;
let _currentSearch = '';

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.requireRole(CONFIG.ROLES.ADMIN);

  document.getElementById('add-facility-form').addEventListener('submit', handleAddFacility);
  
  // Debounced search/filter input
  let searchTimer;
  document.getElementById('facility-filter').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      _currentSearch = e.target.value.trim();
      _currentPage = 1;
      loadFacilities(_currentPage, _currentSearch);
    }, 300);
  });

  // Pagination navigation
  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (_currentPage > 1) {
      _currentPage--;
      loadFacilities(_currentPage, _currentSearch);
    }
  });

  document.getElementById('btn-next-page').addEventListener('click', () => {
    if (_currentPage < _totalPages) {
      _currentPage++;
      loadFacilities(_currentPage, _currentSearch);
    }
  });

  loadFacilities(_currentPage, _currentSearch);
});

/* ── Add Facility ─────────────────────────────────────────────────────── */
async function handleAddFacility(e) {
  e.preventDefault();
  document.querySelectorAll('.form-error').forEach(el => { el.textContent = ''; });

  const name   = document.getElementById('f-name').value.trim();
  const type   = document.getElementById('f-type').value;
  const city   = document.getElementById('f-city').value.trim();
  const state  = document.getElementById('f-state').value.trim();
  const reg    = document.getElementById('f-reg').value.trim();
  const phone  = document.getElementById('f-phone').value.trim();

  if (!name) { document.getElementById('err-f-name').textContent = 'Name is required.'; return; }

  const btn = document.getElementById('btn-add-facility');
  btn.disabled = true;
  btn.textContent = '⏳ Adding…';

  try {
    await API.post('/admin/facilities', {
      name,
      entity_type: type,
      city,
      state,
      license_number: reg,
      registration_number: reg,
      contact_phone: phone,
    });
    Toast.show('Facility added successfully!', 'success');
    e.target.reset();
    _currentPage = 1;
    loadFacilities(_currentPage, _currentSearch);
  } catch (err) {
    Toast.show(err.message || 'Failed to add facility.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '➕ Add Facility';
  }
}

/* ── Load Facilities with Pagination ──────────────────────────────────── */
async function loadFacilities(page = 1, search = '') {
  document.getElementById('facilities-loading').classList.remove('hidden');
  document.getElementById('facilities-table-wrap').classList.add('hidden');
  
  try {
    let url = `/admin/facilities?page=${page}&limit=${_limit}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    const data = await API.get(url);
    const facilities = data.facilities || [];
    _currentPage = data.current_page || 1;
    _totalPages = data.total_pages || 1;

    renderTable(facilities, (_currentPage - 1) * _limit);
    renderPagination(data.total_count || facilities.length);
  } catch (err) {
    document.getElementById('facilities-loading').textContent = 'Failed to load facilities.';
    Toast.show(err.message || 'Error loading facilities.', 'error');
  }
}

/* ── Render Table ─────────────────────────────────────────────────────── */
function renderTable(facilities, startIndex = 0) {
  document.getElementById('facilities-loading').classList.add('hidden');

  if (facilities.length === 0) {
    document.getElementById('facilities-table-wrap').classList.add('hidden');
    document.getElementById('facilities-loading').classList.remove('hidden');
    document.getElementById('facilities-loading').textContent = 'No facilities found.';
    return;
  }

  const tbody = document.getElementById('facilities-tbody');
  tbody.innerHTML = facilities.map((f, i) => `
    <tr id="facility-row-${f.id}">
      <td>${startIndex + i + 1}</td>
      <td>${f.entity_type === 'hospital' ? '🏥' : '👨‍⚕️'} ${f.entity_type}</td>
      <td><strong>${escHtml(f.name)}</strong></td>
      <td>${escHtml(f.city || '—')}</td>
      <td>${escHtml(f.license_number || f.registration_number || '—')}</td>
      <td>${escHtml(f.contact_phone || '—')}</td>
      <td>
        <span class="badge badge-${f.is_active ? 'success' : 'secondary'}">
          ${f.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <button class="btn btn-outline btn-sm"
                  onclick="toggleFacility(${f.id}, ${f.is_active ? 0 : 1}, this)">
            ${f.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn btn-danger btn-sm" style="padding:0.35rem 0.65rem;"
                  onclick="deleteFacility(${f.id}, this)">
            🗑️ Delete
          </button>
        </div>
      </td>
    </tr>`).join('');

  document.getElementById('facilities-table-wrap').classList.remove('hidden');
}

/* ── Render Pagination Controls ───────────────────────────────────────── */
function renderPagination(totalCount) {
  const container = document.getElementById('pagination-controls');
  const indicator = document.getElementById('page-indicator');
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');

  if (_totalPages <= 1 && totalCount <= _limit) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  indicator.textContent = `Page ${_currentPage} of ${_totalPages} (${totalCount} total)`;

  btnPrev.disabled = _currentPage <= 1;
  btnNext.disabled = _currentPage >= _totalPages;
}

/* ── Toggle Status ────────────────────────────────────────────────────── */
async function toggleFacility(facilityId, newStatus, btnEl) {
  btnEl.disabled = true;
  try {
    await API.patch(`/admin/facilities/${facilityId}/status`, { is_active: newStatus });
    Toast.show(`Facility ${newStatus ? 'activated' : 'deactivated'}.`, 'info');
    loadFacilities(_currentPage, _currentSearch);
  } catch (err) {
    Toast.show(err.message || 'Toggle failed.', 'error');
    btnEl.disabled = false;
  }
}

/* ── Delete Facility ──────────────────────────────────────────────────── */
async function deleteFacility(facilityId, btnEl) {
  if (!confirm('Are you sure you want to permanently delete this facility? This cannot be undone.')) {
    return;
  }
  btnEl.disabled = true;
  try {
    await API.delete(`/admin/facilities/${facilityId}`);
    Toast.show('Facility deleted successfully.', 'success');
    loadFacilities(_currentPage, _currentSearch);
  } catch (err) {
    Toast.show(err.message || 'Delete failed.', 'error');
    btnEl.disabled = false;
  }
}

/* ── Utility ──────────────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
