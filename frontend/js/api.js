/**
 * api.js
 * Centralised HTTP client for BloodConnect.
 *
 * Every method automatically:
 *  - Reads the JWT from localStorage and injects  Authorization: Bearer <token>
 *  - Sets Content-Type: application/json for JSON requests
 *  - Throws a structured { status, message } error on non-2xx responses
 *  - Supports GET, POST, PUT, PATCH, DELETE, and authenticated Blob streaming
 *
 * Depends on: config.js (must be loaded first)
 */
const API = (() => {
  /* ── private helper ─────────────────────────────────────────────────── */

  /**
   * Core fetch wrapper.
   * @param {string} endpoint   - Path relative to CONFIG.API_BASE_URL  e.g. '/auth/login'
   * @param {object} options    - fetch init options (method, body, headers, …)
   * @returns {Promise<any>}    - Parsed JSON body on success
   * @throws  {object}          - { status: number, message: string } on failure
   */
  async function _request(endpoint, options = {}) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);

    const headers = { ...(options.headers || {}) };

    // Inject auth header when a token is available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // For plain JSON bodies set Content-Type automatically
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const url = `${CONFIG.API_BASE_URL}${endpoint}`;

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (networkErr) {
      throw { status: 0, message: 'Network error — is the server running?' };
    }

    let data;
    try {
      data = await response.json();
    } catch (_) {
      data = { message: response.statusText || 'Unknown error' };
    }

    if (!response.ok) {
      // If 401 Unauthorized, notify auth layer
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.USER_KEY);
      }
      throw { status: response.status, message: data.message || 'Request failed' };
    }

    return data;
  }

  /* ── public surface ─────────────────────────────────────────────────── */

  return {
    /**
     * GET  /api<endpoint>
     */
    get(endpoint) {
      return _request(endpoint, { method: 'GET' });
    },

    /**
     * POST /api<endpoint>  with JSON body
     */
    post(endpoint, data) {
      return _request(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * PUT  /api<endpoint>  with JSON body (Full replacement semantics)
     */
    put(endpoint, data) {
      return _request(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    /**
     * POST /api<endpoint>  with multipart/form-data body (file uploads)
     */
    postFormData(endpoint, formData) {
      return _request(endpoint, {
        method: 'POST',
        body: formData,
      });
    },

    /**
     * PATCH /api<endpoint>  with JSON body
     */
    patch(endpoint, data) {
      return _request(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    /**
     * DELETE /api<endpoint>
     */
    delete(endpoint) {
      return _request(endpoint, { method: 'DELETE' });
    },

    /**
     * Authenticated Blob Fetcher: Streams protected documents with Bearer token
     * @param {string} endpoint 
     * @returns {Promise<Blob>}
     */
    async getBlob(endpoint) {
      const token = localStorage.getItem(CONFIG.TOKEN_KEY);
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const url = `${CONFIG.API_BASE_URL}${endpoint}`;
      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) {
        throw new Error(`Failed to stream document: HTTP ${response.status}`);
      }
      return await response.blob();
    }
  };
})();
