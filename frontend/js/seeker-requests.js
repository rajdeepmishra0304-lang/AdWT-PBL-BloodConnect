/**
 * seeker-requests.js  —  BloodConnect Seeker Request List
 *
 * Flow:
 *  1. requireRole('seeker', 'hospital')
 *  2. GET /api/requests/my → render full table with robust field mapping
 *  3. Cancel button → PATCH /api/requests/:id/cancel
 *  4. Delete button → DELETE /api/requests/:id
 *
 * Depends on: config.js  api.js  auth.js
 */

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.requireRole(CONFIG.ROLES.SEEKER, CONFIG.ROLES.HOSPITAL);
  loadRequests();
});

async function loadRequests() {
  const loadingEl = document.getElementById('requests-loading');
  const emptyEl = document.getElementById('requests-empty');
  const tableWrapEl = document.getElementById('requests-table-wrap');

  try {
    const data = await API.get('/requests/my');
    const requests = data.requests || [];

    if (loadingEl) loadingEl.classList.add('hidden');

    if (requests.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    const tbody = document.getElementById('requests-tbody');
    if (tbody) {
      tbody.innerHTML = requests.map((r, i) => {
        const blood = r.blood_group_needed || r.blood_group || '—';
        const units = r.units_needed || r.units_required || 1;
        const hospital = r.hospital_name || r.hospital_name_input || 'Hospital';
        const doctor = r.doctor_name || r.doctor_name_input || '—';
        const urgency = r.urgency_level || r.urgency || 'urgent';

        return `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${escHtml(r.patient_name)}</strong></td>
            <td><span class="blood-badge">${escHtml(blood)}</span></td>
            <td>${units}</td>
            <td>${escHtml(hospital)}</td>
            <td>${escHtml(doctor)}</td>
            <td><span class="urgency-badge urgency-${urgency}">${urgency.toUpperCase()}</span></td>
            <td><span class="badge badge-${statusColor(r.status)}">${formatStatus(r.status)}</span></td>
            <td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
            <td>
              ${['pending_audit', 'auto_verified', 'dispatched'].includes(r.status)
                ? `<div style="display:flex; gap:0.4rem;">
                     <button class="btn btn-outline btn-sm" onclick="cancelRequest(${r.id}, this)">Cancel</button>
                     <button class="btn btn-danger btn-sm" style="padding:0.35rem 0.65rem;" onclick="deleteRequestItem(${r.id}, this)">🗑️ Delete</button>
                   </div>`
                : r.status === 'cancelled'
                ? `<button class="btn btn-danger btn-sm" style="padding:0.35rem 0.65rem;" onclick="deleteRequestItem(${r.id}, this)">🗑️ Delete</button>`
                : '<span class="text-muted">Fulfilled (Locked)</span>'}
            </td>
          </tr>`;
      }).join('');
    }

    if (tableWrapEl) tableWrapEl.classList.remove('hidden');
  } catch (err) {
    if (loadingEl) loadingEl.textContent = 'Failed to load requests.';
    Toast.show(err.message || 'Error loading requests.', 'error');
  }
}

async function cancelRequest(requestId, btnEl) {
  if (!confirm('Are you sure you want to cancel this emergency request?')) return;
  btnEl.disabled = true;
  try {
    await API.patch(`/requests/${requestId}/cancel`, {});
    Toast.show('Request cancelled.', 'info');
    await loadRequests();
  } catch (err) {
    Toast.show(err.message || 'Failed to cancel request.', 'error');
    btnEl.disabled = false;
  }
}

async function deleteRequestItem(requestId, btnEl) {
  if (!confirm('Permanently delete this blood request record?')) return;
  btnEl.disabled = true;
  try {
    await API.delete(`/requests/${requestId}`);
    Toast.show('Request permanently deleted.', 'info');
    await loadRequests();
  } catch (err) {
    Toast.show(err.message || 'Failed to delete request.', 'error');
    btnEl.disabled = false;
  }
}

function formatStatus(s) {
  return {
    pending_audit: 'Pending Audit',
    auto_verified: 'Verified',
    dispatched:    'Dispatched',
    fulfilled:     'Fulfilled',
    cancelled:     'Cancelled',
  }[s] || s;
}

function statusColor(s) {
  return {
    pending_audit: 'warning',
    auto_verified: 'info',
    dispatched:    'primary',
    fulfilled:     'success',
    cancelled:     'secondary',
  }[s] || 'secondary';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
