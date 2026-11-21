/**
 * donor-history.js  —  BloodConnect Donor Donation History
 *
 * Flow:
 *  1. requireRole('donor')
 *  2. GET /api/donors/history → render donations table + cooldown banner
 *
 * Depends on: config.js  api.js  auth.js
 */

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.requireRole(CONFIG.ROLES.DONOR);
  loadHistory();
});

async function loadHistory() {
  const loadingEl = document.getElementById('history-loading');
  const emptyEl = document.getElementById('history-empty');
  const tableWrapEl = document.getElementById('history-table-wrap');

  try {
    const data = await API.get('/donors/history');

    // Cooldown section
    const cooldownDays = data.cooldown_remaining_days || 0;
    if (cooldownDays > 0) {
      const cooldownDateStr = data.cooldown_until ? new Date(data.cooldown_until).toLocaleDateString('en-IN') : '90 days';
      const cooldownInfoEl = document.getElementById('cooldown-info');
      const cooldownBannerEl = document.getElementById('cooldown-banner');
      if (cooldownInfoEl) {
        cooldownInfoEl.textContent = `You are currently in mandatory 90-day post-donation recovery cooldown. ${cooldownDays} day(s) remaining (until ${cooldownDateStr}).`;
      }
      if (cooldownBannerEl) cooldownBannerEl.classList.remove('hidden');
    }

    const donations = data.donations || data.history || [];
    if (loadingEl) loadingEl.classList.add('hidden');

    if (donations.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    const tbody = document.getElementById('history-tbody');
    if (tbody) {
      tbody.innerHTML = donations.map((d, i) => {
        const donationDate = d.donated_on || d.donated_at;
        const recipient = d.patient_name || d.recipient_name || 'Emergency Patient';
        const bloodGroup = d.blood_group || '—';
        const hospital = d.hospital_name || d.hospital_city || 'Hospital';
        const units = d.units_donated ?? 1;

        return `
          <tr>
            <td>${i + 1}</td>
            <td>${donationDate ? new Date(donationDate).toLocaleDateString('en-IN') : '—'}</td>
            <td>${escHtml(recipient)}</td>
            <td><span class="blood-badge">${escHtml(bloodGroup)}</span></td>
            <td>${escHtml(hospital)}</td>
            <td>${units}</td>
            <td><span class="badge badge-success">Completed</span></td>
          </tr>`;
      }).join('');
    }

    if (tableWrapEl) tableWrapEl.classList.remove('hidden');
  } catch (err) {
    if (loadingEl) loadingEl.textContent = 'Failed to load donation history.';
    Toast.show(err.message || 'Error loading history.', 'error');
  }
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
