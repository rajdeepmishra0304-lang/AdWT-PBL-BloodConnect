/**
 * admin.js  —  BloodConnect Admin Dashboard
 *
 * Responsibilities:
 *  1. requireRole('admin')
 *  2. Load & render stats from GET /api/admin/stats
 *  3. Load pending donor verifications → GET /api/admin/donors/pending
 *     Approve / Reject → POST /api/admin/donors/:verificationId/audit
 *  4. Load pending request audits → GET /api/admin/requests/pending
 *     Approve / Reject → POST /api/admin/requests/:requestId/audit
 *  5. Secure authenticated document viewing via Auth.viewDocument()
 *
 * Depends on: config.js  api.js  auth.js
 */

document.addEventListener('DOMContentLoaded', () => {
  Auth.renderNav();
  Auth.requireRole(CONFIG.ROLES.ADMIN);
  loadAll();
});

async function loadAll() {
  await Promise.allSettled([loadStats(), loadPendingDonors(), loadPendingRequests()]);
}

/* ── Stats ────────────────────────────────────────────────────────────── */
async function loadStats() {
  try {
    const d = await API.get('/admin/stats');
    document.getElementById('s-donors').textContent          = d.total_verified_donors   ?? '—';
    document.getElementById('s-available').textContent       = d.available_donors         ?? '—';
    document.getElementById('s-requests').textContent        = d.total_requests           ?? '—';
    document.getElementById('s-fulfilled').textContent       = d.total_fulfilled_requests ?? '—';
    document.getElementById('s-facilities').textContent      = d.total_facilities         ?? '—';
    document.getElementById('s-pending-donors').textContent  = d.pending_donor_verifications ?? '—';
  } catch (_) {}
}

/* ── Pending Donors ───────────────────────────────────────────────────── */
async function loadPendingDonors() {
  const container = document.getElementById('pending-donors-container');
  const loader = document.getElementById('donors-loading');
  if (loader) loader.classList.remove('hidden');

  try {
    const data = await API.get('/admin/donors/pending');
    const donors = data.pending_donors || [];
    if (loader) loader.classList.add('hidden');

    if (donors.length === 0) {
      container.innerHTML = '<p class="text-muted">✅ No pending donor verifications.</p>';
      return;
    }

    container.innerHTML = `<div class="audit-cards">${donors.map(d => {
      const donorName = d.name || d.donor_name || 'Donor';
      const bloodGroup = d.blood_group || '—';
      const cityArea = `${d.city || ''}${d.area || d.state ? ', ' + (d.area || d.state) : ''}`;
      const dobVal = d.dob || d.date_of_birth;
      const idDoc = d.id_document_path || d.id_proof_path;
      const medDoc = d.medical_document_path || d.medical_record_path;

      return `
        <div class="audit-card" id="donor-card-${d.verification_id}">
          <div class="audit-info">
            <strong>${escHtml(donorName)}</strong>
            <span class="blood-badge">${escHtml(bloodGroup)}</span>
            <span class="text-muted">📍 ${escHtml(cityArea)}</span>
            <span class="text-muted">⚖️ ${d.weight_kg} kg · Age: ${calcAge(dobVal)}</span>
            <span class="text-muted">🪪 Aadhar: ${escHtml(d.aadhar_masked || '—')}</span>
            <div class="doc-links">
              ${idDoc
                ? `<button type="button" class="btn btn-outline btn-sm" onclick="Auth.viewDocument('${escAttr(idDoc)}')">📄 View ID Proof</button>`
                : ''}
              ${medDoc
                ? `<button type="button" class="btn btn-outline btn-sm" onclick="Auth.viewDocument('${escAttr(medDoc)}')">🏥 View Medical Record</button>`
                : ''}
            </div>
          </div>
          <div class="audit-actions">
            <button class="btn btn-primary btn-sm"
                    onclick="auditDonor(${d.verification_id}, 'approved', this)">
              ✅ Approve
            </button>
            <button class="btn btn-outline btn-sm"
                    onclick="auditDonor(${d.verification_id}, 'rejected', this)">
              ❌ Reject
            </button>
          </div>
        </div>`;
    }).join('')}</div>`;
  } catch (err) {
    if (loader) loader.classList.add('hidden');
    container.innerHTML = '<p class="text-muted">Failed to load pending donors.</p>';
  }
}

async function auditDonor(verificationId, decision, btnEl) {
  const remarks = decision === 'rejected'
    ? prompt('Rejection reason (optional):') || ''
    : '';
  btnEl.disabled = true;
  try {
    await API.post(`/admin/donors/${verificationId}/audit`, { decision, remarks });
    Toast.show(`Donor ${decision}.`, decision === 'approved' ? 'success' : 'info', 3000);
    document.getElementById(`donor-card-${verificationId}`)?.remove();
    loadStats();
  } catch (err) {
    Toast.show(err.message || 'Audit failed.', 'error');
    btnEl.disabled = false;
  }
}

/* ── Pending Requests ─────────────────────────────────────────────────── */
async function loadPendingRequests() {
  const container = document.getElementById('pending-requests-container');
  const loader = document.getElementById('requests-loading');
  if (loader) loader.classList.remove('hidden');

  try {
    const data = await API.get('/admin/requests/pending');
    const requests = data.pending_requests || [];
    if (loader) loader.classList.add('hidden');

    if (requests.length === 0) {
      container.innerHTML = '<p class="text-muted">✅ No pending request audits.</p>';
      return;
    }

    container.innerHTML = `<div class="audit-cards">${requests.map(r => {
      const bloodGroup = r.blood_group_needed || r.blood_group || '—';
      const urgency = r.urgency_level || r.urgency || 'urgent';
      const hospital = r.hospital_name || r.hospital_name_input || 'Hospital';
      const doctor = r.doctor_name || r.doctor_name_input || 'Doctor';
      const prescription = r.prescription_path;

      return `
        <div class="audit-card" id="req-card-${r.id}">
          <div class="audit-info">
            <strong>${escHtml(r.patient_name)}</strong>
            <span class="blood-badge">${escHtml(bloodGroup)}</span>
            <span class="urgency-badge urgency-${urgency}">${urgency.toUpperCase()}</span>
            <span class="text-muted">🏥 ${escHtml(hospital)}</span>
            <span class="text-muted">👨‍⚕️ ${escHtml(doctor)}</span>
            <span class="text-muted">📅 Submitted: ${new Date(r.created_at).toLocaleDateString('en-IN')}</span>
            ${prescription
              ? `<button type="button" class="btn btn-outline btn-sm" onclick="Auth.viewDocument('${escAttr(prescription)}')">📄 View Prescription</button>`
              : '<span class="text-muted">⚠️ No prescription document attached</span>'}
          </div>
          <div class="audit-actions">
            <button class="btn btn-primary btn-sm"
                    onclick="auditRequest(${r.id}, 'approved', this)">
              ✅ Approve
            </button>
            <button class="btn btn-outline btn-sm"
                    onclick="auditRequest(${r.id}, 'rejected', this)">
              ❌ Reject
            </button>
          </div>
        </div>`;
    }).join('')}</div>`;
  } catch (err) {
    if (loader) loader.classList.add('hidden');
    container.innerHTML = '<p class="text-muted">Failed to load pending requests.</p>';
  }
}

async function auditRequest(requestId, decision, btnEl) {
  const remarks = decision === 'rejected'
    ? prompt('Rejection reason:') || ''
    : '';
  btnEl.disabled = true;
  try {
    await API.post(`/admin/requests/${requestId}/audit`, { decision, remarks });
    Toast.show(`Request ${decision}.`, decision === 'approved' ? 'success' : 'info', 3000);
    document.getElementById(`req-card-${requestId}`)?.remove();
    loadStats();
  } catch (err) {
    Toast.show(err.message || 'Audit failed.', 'error');
    btnEl.disabled = false;
  }
}

/* ── Utility ──────────────────────────────────────────────────────────── */
function calcAge(dobStr) {
  if (!dobStr) return '—';
  const today = new Date();
  const dob   = new Date(dobStr);
  let age = today.getFullYear() - dob.getFullYear();
  if (today.getMonth() < dob.getMonth() ||
     (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
  return isNaN(age) ? '—' : age;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}
