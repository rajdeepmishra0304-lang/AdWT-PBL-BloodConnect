/**
 * auth.js
 * Client-side authentication state manager & route guard for BloodConnect.
 *
 * Responsibilities:
 *  - Persist / retrieve JWT token and decoded user object in localStorage
 *  - Provide role-based route guards that redirect unauthorised visitors immediately
 *  - Perform server-side token invalidation upon logout
 *  - Provide safe authenticated document streaming viewer
 *  - Expose a Toast utility used by every page for user feedback
 *
 * Depends on: config.js (must be loaded first)
 */
const Auth = (() => {
  /* ── Token / session helpers ─────────────────────────────────────────── */

  function getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY);
  }

  /**
   * Returns the stored user object or null.
   * @returns {{ id, name, email, role } | null}
   */
  function getUser() {
    const raw = localStorage.getItem(CONFIG.USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  /**
   * Persist a successful login session.
   * @param {string} token  - JWT returned by /api/auth/login
   * @param {object} user   - { id, name, email, role }
   */
  function setSession(token, user) {
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
    localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
  }

  /**
   * Clear session, invalidate token on server, and return to login page.
   */
  async function logout() {
    try {
      if (typeof API !== 'undefined' && API.post) {
        await API.post('/auth/logout', {});
      }
    } catch (_) {
      // Invalidation attempted
    }
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
    window.location.href = _rootPath() + 'login.html';
  }

  /* ── Route guards ───────────────────────────────────────────────────── */

  /**
   * Redirect to login if no valid session exists.
   * Returns boolean and stops execution immediately upon redirect.
   * @returns {boolean}
   */
  function requireAuth() {
    if (!getToken() || !getUser()) {
      window.location.href = _rootPath() + 'login.html';
      return false;
    }
    return true;
  }

  /**
   * Redirect if the current user does not hold one of the allowed roles.
   * Returns immediately if unauthenticated or unauthorized.
   * @param {...string} roles
   */
  function requireRole(...roles) {
    if (!requireAuth()) return; // Stop execution immediately if unauthenticated
    const user = getUser();
    if (!user || !roles.includes(user.role)) {
      const home = (user && CONFIG.ROLE_HOME[user.role]) || (_rootPath() + 'login.html');
      window.location.href = home;
      return;
    }
  }

  /**
   * If already logged in, redirect away from guest-only pages (login / register).
   */
  function redirectIfLoggedIn() {
    const user = getUser();
    if (user && getToken()) {
      const home = CONFIG.ROLE_HOME[user.role];
      if (home) {
        window.location.href = home;
        return true;
      }
    }
    return false;
  }

  /* ── Utility helpers ─────────────────────────────────────────────────── */

  /**
   * Compute relative path prefix back to the frontend root.
   */
  function _rootPath() {
    const depth = window.location.pathname.split('/').length - 2;
    return depth > 0 ? '../'.repeat(depth) : '';
  }

  /**
   * View an authenticated document securely without exposing filesystem paths
   * @param {string} rawDocPath 
   */
  async function viewDocument(rawDocPath) {
    if (!rawDocPath) {
      Toast.show('No document attached.', 'info');
      return;
    }
    // Extract basename
    const parts = rawDocPath.replace(/\\/g, '/').split('/');
    const filename = parts[parts.length - 1];

    try {
      Toast.show('Fetching document securely…', 'info', 1500);
      const blob = await API.getBlob(`/documents/file/${encodeURIComponent(filename)}`);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank');
    } catch (err) {
      Toast.show('Could not access document: Access denied or file missing.', 'error');
    }
  }

  /**
   * Render the shared top navigation bar into #main-header.
   */
  function renderNav() {
    const header = document.getElementById('main-header');
    if (!header) return;

    const user = getUser();
    const root = _rootPath();

    let linksHtml = '';

    if (!user) {
      // Guest navigation
      linksHtml = `
        <a href="${root}index.html" class="nav-link">Home</a>
        <a href="${root}login.html" class="nav-link">Login</a>
        <a href="${root}register.html" class="btn btn-primary btn-sm">Register</a>
      `;
    } else {
      // Role-specific navigation
      const role = user.role;
      let roleLinks = '';

      if (role === 'donor') {
        roleLinks = `
          <a href="${root}donor/dashboard.html" class="nav-link">Donor Dashboard</a>
          <a href="${root}donor/history.html" class="nav-link">My Donations</a>
        `;
      } else if (role === 'seeker' || role === 'hospital') {
        roleLinks = `
          <a href="${root}seeker/dashboard.html" class="nav-link">Live Radar</a>
          <a href="${root}seeker-request.html" class="nav-link">New Request</a>
          <a href="${root}seeker/my-requests.html" class="nav-link">My Requests</a>
        `;
      } else if (role === 'admin') {
        roleLinks = `
          <a href="${root}admin/dashboard.html" class="nav-link">Audit Queues</a>
          <a href="${root}admin/registry.html" class="nav-link">Hospital Registry</a>
        `;
      }

      linksHtml = `
        <a href="${root}index.html" class="nav-link">Home</a>
        ${roleLinks}
        <div class="user-chip">
          <span class="user-name">👤 ${user.name || user.email}</span>
          <span class="badge badge-primary user-role-badge">${role.toUpperCase()}</span>
          <button class="btn btn-outline btn-sm" id="btn-logout">Logout</button>
        </div>
      `;
    }

    header.innerHTML = `
      <div class="nav-container container">
        <a href="${root}index.html" class="nav-brand">
          <span class="brand-icon">🩸</span>
          <span class="brand-text">Blood<b>Connect</b></span>
        </a>
        <nav class="nav-menu" id="nav-menu">
          ${linksHtml}
        </nav>
      </div>
    `;

    // Bind logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', logout);
    }
  }

  return {
    getToken,
    getUser,
    setSession,
    logout,
    requireAuth,
    requireRole,
    redirectIfLoggedIn,
    renderNav,
    viewDocument,
    _rootPath
  };
})();

/**
 * Global Toast notification manager
 */
const Toast = (() => {
  let _container = null;

  function _getContainer() {
    if (!_container) {
      _container = document.createElement('div');
      _container.className = 'toast-container';
      document.body.appendChild(_container);
    }
    return _container;
  }

  function show(message, type = 'info', durationMs = 3500) {
    const container = _getContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hiding');
      toast.addEventListener('transitionend', () => toast.remove());
    }, durationMs);
  }

  return { show };
})();
