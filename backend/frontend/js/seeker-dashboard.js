/**
 * seeker-dashboard.js  —  BloodConnect Seeker Live Dispatch Radar
 *
 * Responsibilities:
 *  1. requireRole('seeker', 'hospital')
 *  2. Load all requests → GET /api/requests/my → populate selector + mini list
 *  3. On request selected → show dispatch panel
 *  4. Dispatch button → POST /api/matches/dispatch/:requestId
 *  5. Poll GET /api/matches/radar/:requestId every 10 s → render donor cards
 *  6. Flip-card reveal when is_contact_unlocked === 1 or status is accepted
 *  7. Complete donation → POST /api/matches/complete/:dispatchId
 *  8. Reliable cleanup of polling intervals
 *
 * Depends on: config.js  api.js  auth.js
 */

let _pollHandle    = null;
let _selectedReqId = null;

document.addEventListener('DOMContentLoaded', async () => {
  Auth.renderNav();
  Auth.requireRole(CONFIG.ROLES.SEEKER, CONFIG.ROLES.HOSPITAL);

  const user = Auth.getUser();
  if (user) {
    const seekerNameEl = document.getElementById('seeker-name');
    if (seekerNameEl) seekerNameEl.textContent = `Welcome, ${user.name || user.full_name || 'Seeker'}`;
  }

  await loadRequests();

  const sel = document.getElementById('request-selector');
  if (sel) {
    sel.addEventListener('change', onRequestSelected);
  }

  window.addEventListener('beforeunload', () => {
    if (_pollHandle) clearInterval(_pollHandle);
  });
});

/* ── Load Requests ────────────────────────────────────────────────────── */
async function loadRequests() {
  try {
    const data = await API.get('/requests/my');
    const requests = data.requests || [];

    renderMiniList(requests);

    const active = requests.filter(r =>
      ['pending_audit', 'auto_verified', 'dispatched'].includes(r.status)
    );

    const sel = document.getElementById('request-selector');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select an active blood request —</option>';

    active.forEach(r => {
      const blood = r.blood_group_needed || r.blood_group || '—';
      const hospital = r.hospital_name || r.hospital_name_input || 'Hospital';
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${blood} · ${hospital} · ${formatStatus(r.status)}`;
      sel.appendChild(opt);
    });
  } catch (err) {
    Toast.show(err.message || 'Failed to load requests.', 'error');
  }
}

/* ── Request Selected ─────────────────────────────────────────────────── */
function onRequestSelected(e) {
  const reqId = e.target.value;
  if (!reqId) {
    const panel = document.getElementById('dispatch-panel');
    if (panel) panel.classList.add('hidden');
    if (_pollHandle) clearInterval(_pollHandle);
    _selectedReqId = null;
    return;
  }
  _selectedReqId = reqId;
  const panel = document.getElementById('dispatch-panel');
  if (panel) panel.classList.remove('hidden');
  startRadarPoll(reqId);
}

/* ── Dispatch ─────────────────────────────────────────────────────────── */
async function dispatchRequest() {
  if (!_selectedReqId) return;
  const btn = document.getElementById('btn-dispatch');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Broadcasting Dispatch…';
  }

  try {
    const res = await API.post(`/matches/dispatch/${_selectedReqId}`, {});
    Toast.show(`Dispatched to ${res.dispatched_count} eligible nearby donor(s)!`, 'success', 3500);
    if (btn) btn.classList.add('hidden');
    await loadRadar(_selectedReqId);
  } catch (err) {
    Toast.show(err.message || 'Dispatch failed.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📡 Broadcast Dispatch';
    }
  }
}

/* ── Radar Polling ────────────────────────────────────────────────────── */
function startRadarPoll(reqId) {
  if (_pollHandle) clearInterval(_pollHandle);
  loadRadar(reqId);
  _pollHandle = setInterval(() => loadRadar(reqId), CONFIG.SEEKER_STATUS_POLL_MS || 10000);
}

async function loadRadar(reqId) {
  if (!reqId || reqId !== _selectedReqId) return;

  try {
    const data = await API.get(`/matches/radar/${reqId}`);
    renderRadar(data);
  } catch (err) {
    // Keep showing existing state on network errors
  }
}

function renderRadar(data) {
  const req = data.request || {};
  const dispatches = data.dispatches || [];
  const status = req.status;

  const statusMsg = document.getElementById('radar-status-msg');
  const dispatchBtn = document.getElementById('btn-dispatch');
  const donorsList = document.getElementById('donors-list');

  if (statusMsg) {
    const statusText = {
      pending_audit: '⏳ Request is pending compliance audit by administrators.',
      auto_verified: '✅ Verified by hospital cross-check. Ready to broadcast dispatch.',
      dispatched:    `📡 Live Radar Active — Broadcasted to ${data.total_dispatches || dispatches.length} donor(s).`,
      fulfilled:     '🎉 Blood requirement fulfilled! Thank you to our donors.',
      cancelled:     '❌ Request was cancelled.'
    };
    statusMsg.textContent = statusText[status] || status;
  }

  if (dispatchBtn) {
    if (status === 'auto_verified' && dispatches.length === 0) {
      dispatchBtn.classList.remove('hidden');
      dispatchBtn.disabled = false;
    } else {
      dispatchBtn.classList.add('hidden');
    }
  }

  if (!donorsList) return;

  if (dispatches.length === 0) {
    donorsList.innerHTML = '<p class="text-muted">No donor dispatches issued yet. Click Broadcast Dispatch above.</p>';
    return;
  }

  donorsList.innerHTML = dispatches.map(d => {
    const dispatchStatus = d.dispatch_status || d.donor_status;
    const isAccepted = dispatchStatus === 'accepted';
    const isCompleted = dispatchStatus === 'completed';
    const isUnlocked = d.is_contact_unlocked === 1 || isAccepted || isCompleted;

    return `
      <div class="consent-card ${isUnlocked ? 'consent-unlocked' : ''}" data-dispatch="${d.dispatch_id}">
        <div class="consent-front">
          <div class="donor-dispatch-info">
            <span class="blood-badge">${escHtml(d.blood_group)}</span>
            <span class="badge badge-${statusColor(dispatchStatus)}">${dispatchStatus?.toUpperCase()}</span>
            <span>Distance: ${d.distance_km != null ? d.distance_km.toFixed(1) + ' km' : 'Nearby'}</span>
          </div>
          ${isUnlocked ? '' : '<div class="lock-overlay">🔒 Contact details locked until donor explicitly accepts alert</div>'}
        </div>
        ${isUnlocked ? `
        <div class="consent-back">
          <strong>🩸 Donor Contact Unlocked</strong>
          <p>👤 ${escHtml(d.donor_name || 'Donor')}</p>
          <p>📞 <b>${escHtml(d.donor_phone || 'Protected')}</b></p>
          <p>📧 ${escHtml(d.donor_email || '—')}</p>
          ${status !== 'fulfilled' && !isCompleted ? `
          <button class="btn btn-primary btn-sm" onclick="completeDonation(${d.dispatch_id}, this)">
            ✅ Mark Donation Fulfilled
          </button>` : '<span class="badge badge-success">Donation Fulfilled</span>'}
        </div>` : ''}
      </div>`;
  }).join('');
}

/* ── Complete Donation ────────────────────────────────────────────────── */
async function completeDonation(dispatchId, btnEl) {
  if (!confirm('Mark this blood donation as complete? This will engage a mandatory 90-day medical recovery cooldown on the donor.')) return;
  btnEl.disabled = true;
  btnEl.textContent = '⏳ Recording…';
  try {
    await API.post(`/matches/complete/${dispatchId}`, { units: 1 });
    Toast.show('Donation successfully recorded! Donor has entered 90-day cooldown.', 'success', 4000);
    await loadRequests();
    await loadRadar(_selectedReqId);
  } catch (err) {
    Toast.show(err.message || 'Error recording donation.', 'error');
    btnEl.disabled = false;
    btnEl.textContent = '✅ Mark Donation Fulfilled';
  }
}

/* ── Mini List Helper ─────────────────────────────────────────────────── */
function renderMiniList(requests) {
  const container = document.getElementById('my-requests-list');
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = '<p class="text-muted">No requests found.</p>';
    return;
  }

  container.innerHTML = requests.slice(0, 5).map(r => {
    const blood = r.blood_group_needed || r.blood_group || '—';
    const hospital = r.hospital_name || r.hospital_name_input || 'Hospital';
    return `
      <div class="mini-request-item" onclick="selectRequestById(${r.id})">
        <div>
          <strong>${escHtml(r.patient_name)} (${escHtml(blood)})</strong>
          <div class="text-muted" style="font-size:0.8rem;">${escHtml(hospital)}</div>
        </div>
        <span class="badge badge-${statusColor(r.status)}">${formatStatus(r.status)}</span>
      </div>`;
  }).join('');
}

function selectRequestById(id) {
  const sel = document.getElementById('request-selector');
  if (sel) {
    sel.value = String(id);
    sel.dispatchEvent(new Event('change'));
  }
}

/* ── Formatting Helpers ───────────────────────────────────────────────── */
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
    notified:      'secondary',
    accepted:      'success',
    declined:      'danger',
    completed:     'success'
  }[s] || 'secondary';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
