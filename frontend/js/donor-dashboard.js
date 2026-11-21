/**
 * donor-dashboard.js  —  BloodConnect Donor Control Center
 *
 * Responsibilities:
 *  1. requireRole('donor')
 *  2. Load donor profile → GET /api/donors/profile
 *  3. Display stats & availability status; handle toggle PATCH /api/donors/availability
 *  4. Poll GET /api/donors/alerts every 15 s → render dispatch cards
 *  5. Accept / Decline buttons → POST /api/matches/respond/:dispatchId
 *  6. Cooldown countdown widget
 *  7. Reliable interval cleanup on page unload
 *
 * Depends on: config.js  api.js  auth.js
 */

let _pollHandle   = null;
let _donorProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
  Auth.renderNav();
  Auth.requireRole(CONFIG.ROLES.DONOR);

  await loadProfile();
  startAlertPolling();

  // Clean polling interval on unload
  window.addEventListener('beforeunload', () => {
    if (_pollHandle) clearInterval(_pollHandle);
  });
});

/* ── Profile ──────────────────────────────────────────────────────────── */
async function loadProfile() {
  try {
    const data = await API.get('/donors/profile');
    _donorProfile = data.donor;
    renderProfile(_donorProfile);
  } catch (err) {
    if (err.status === 404) {
      Toast.show('Please complete donor onboarding first.', 'warning', 5000);
      setTimeout(() => { window.location.href = '../donor-register.html'; }, 1500);
    } else {
      Toast.show(err.message || 'Failed to load profile.', 'error');
    }
  }
}

function renderProfile(donor) {
  const user = Auth.getUser();
  document.getElementById('donor-name').textContent  = user ? (user.name || user.full_name) : 'Donor';
  document.getElementById('donor-blood').textContent = donor.blood_group;
  document.getElementById('donor-blood').className   = `blood-badge`;
  document.getElementById('donor-city').textContent  = `${donor.city || ''}${donor.area || donor.state ? ', ' + (donor.area || donor.state) : ''}`;

  // Verification banner
  const banner = document.getElementById('verification-banner');
  if (banner) {
    if (!donor.is_verified) {
      banner.textContent = '⏳ Your account is pending admin verification. You cannot receive alerts yet.';
      banner.className = 'alert-banner alert-warning';
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  // Availability toggle
  const toggle = document.getElementById('availability-toggle');
  const isOnCooldown = donor.availability_status === 'cooldown' || donor.is_in_cooldown;

  if (isOnCooldown) {
    toggle.disabled = true;
    toggle.checked  = false;
    renderCooldown(donor.cooldown_until);
  } else {
    toggle.checked  = donor.availability_status === 'available';
    toggle.disabled = !donor.is_verified;
    // Remove previous listeners to prevent multiple triggers
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);
    newToggle.addEventListener('change', handleAvailabilityToggle);
  }

  updateAvailabilityLabel(isOnCooldown ? 'cooldown' : donor.availability_status);

  // Stat cards
  document.getElementById('stat-total').textContent = donor.total_donations ?? 0;
  const lastDonated = donor.last_donated_at || donor.last_donation_date;
  document.getElementById('stat-last').textContent  = lastDonated
    ? new Date(lastDonated).toLocaleDateString('en-IN')
    : 'Never';
}

function updateAvailabilityLabel(status) {
  const labels = { available: '🟢 Available', busy: '🔴 Busy', cooldown: '⏳ Cooldown' };
  const labelEl = document.getElementById('availability-label');
  if (labelEl) labelEl.textContent = labels[status] || status;
}

/* ── Availability Toggle ──────────────────────────────────────────────── */
async function handleAvailabilityToggle(e) {
  const newStatus = e.target.checked ? 'available' : 'busy';
  try {
    await API.patch('/donors/availability', { status: newStatus });
    updateAvailabilityLabel(newStatus);
    Toast.show(`Status set to ${newStatus}.`, 'success', 2000);
  } catch (err) {
    e.target.checked = !e.target.checked;   // revert on failure
    Toast.show(err.message || 'Could not update status.', 'error');
  }
}

/* ── Cooldown Countdown ───────────────────────────────────────────────── */
function renderCooldown(cooldownUntilStr) {
  const msgEl = document.getElementById('cooldown-msg');
  if (!msgEl || !cooldownUntilStr) return;
  msgEl.classList.remove('hidden');

  function tick() {
    const now    = new Date();
    const until  = new Date(cooldownUntilStr);
    const diffMs = until - now;
    if (diffMs <= 0) {
      msgEl.textContent = '✅ Cooldown ended. Refresh to update.';
      return;
    }
    const days  = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    const mins  = Math.floor((diffMs % 3600000) / 60000);
    msgEl.textContent = `⏳ 90-day cooldown: ${days}d ${hours}h ${mins}m remaining`;
  }
  tick();
}

/* ── Alert Polling ────────────────────────────────────────────────────── */
function startAlertPolling() {
  if (_pollHandle) clearInterval(_pollHandle);
  loadAlerts();
  _pollHandle = setInterval(loadAlerts, CONFIG.DONOR_ALERT_POLL_MS || 15000);
}

async function loadAlerts() {
  try {
    const data    = await API.get('/donors/alerts');
    const alerts  = data.alerts || [];

    const alertsCountEl = document.getElementById('alerts-count');
    const pendingStatEl = document.getElementById('stat-pending');

    if (alertsCountEl) alertsCountEl.textContent = alerts.length;
    if (pendingStatEl) pendingStatEl.textContent = alerts.length;

    renderAlerts(alerts);
  } catch (_) {
    // Keep showing existing state on temporary network blips
  }
}

function renderAlerts(alerts) {
  const container = document.getElementById('alerts-container');
  const noAlerts  = document.getElementById('no-alerts');
  if (!container) return;

  if (alerts.length === 0) {
    if (noAlerts) noAlerts.classList.remove('hidden');
    container.querySelectorAll('.dispatch-card').forEach(c => c.remove());
    return;
  }

  if (noAlerts) noAlerts.classList.add('hidden');

  container.querySelectorAll('.dispatch-card').forEach(c => c.remove());

  alerts.forEach(alert => {
    const id = String(alert.dispatch_id);
    const urgency = (alert.urgency_level || alert.urgency || 'urgent').toLowerCase();
    const urgencyClass = urgency === 'critical' ? 'urgency-critical' : (urgency === 'urgent' ? 'urgency-high' : 'urgency-normal');
    const bloodNeeded = alert.blood_group_needed || alert.blood_group || '—';
    const hospital = alert.hospital_name || alert.hospital_city || 'Hospital';
    const createdAt = alert.created_at || alert.request_created_at;
    const units = alert.units_needed || alert.units_required || 1;

    const card = document.createElement('div');
    card.className = `dispatch-card ${urgencyClass}`;
    card.dataset.dispatchId = id;
    card.innerHTML = `
      <div class="dispatch-header">
        <span class="urgency-badge ${urgencyClass}">${urgency.toUpperCase()}</span>
        <span class="dispatch-time">${timeAgo(createdAt)}</span>
      </div>
      <div class="dispatch-body">
        <div class="dispatch-info">
          <strong>🏥 ${escHtml(hospital)}</strong>
          <span>Blood: <b>${escHtml(bloodNeeded)}</b> (${units} unit(s))</span>
          <span>Distance: <b>${alert.distance_km != null ? alert.distance_km.toFixed(1) + ' km' : 'Nearby'}</b></span>
        </div>
        <div class="dispatch-actions">
          <button class="btn btn-primary btn-sm btn-accept" onclick="respondAlert(${id}, 'accept', this)">
            ✅ Accept
          </button>
          <button class="btn btn-outline btn-sm btn-decline" onclick="respondAlert(${id}, 'decline', this)">
            ❌ Decline
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/* ── Respond to Alert ─────────────────────────────────────────────────── */
async function respondAlert(dispatchId, action, btnEl) {
  const card = btnEl.closest('.dispatch-card');
  if (card) {
    card.querySelectorAll('button').forEach(b => b.disabled = true);
  }

  try {
    const res = await API.post(`/matches/respond/${dispatchId}`, { action });
    Toast.show(res.message || `Alert ${action}ed!`, action === 'accept' ? 'success' : 'info', 3500);
    if (card) card.remove();
    await loadProfile();
    await loadAlerts();
  } catch (err) {
    Toast.show(err.message || 'Failed to submit response.', 'error');
    if (card) {
      card.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  }
}

/* ── Utility ──────────────────────────────────────────────────────────── */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
