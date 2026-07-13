/**
 * admin.js
 * Lightweight admin/moderation panel. Access is gated by a simple PIN
 * stored server-side in the Settings sheet (see gas/Utils.gs -> checkAdminPin).
 * For real deployments, replace this with proper authentication
 * (Google Sign-In restricted to a domain, or Apps Script OAuth).
 */

const Admin = {
  authenticated: false,
  pin: null,

  async login(pin) {
    try {
      const result = await Api.verifyAdminPin(pin);
      Admin.authenticated = !!result?.valid;
      if (Admin.authenticated) Admin.pin = pin;
      return Admin.authenticated;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  async moderate(reportId, action, reason = "") {
    if (!Admin.authenticated) throw new Error("Not authenticated.");
    // action: "hide" | "unhide" | "resolve" | "delete-flagged"
    return Api.moderateReport(reportId, "admin", action, reason);
  },

  renderPanel(reports, container) {
    if (!container) return;
    const flagged = reports.filter((r) => r.flagged);
    const active = reports.filter((r) => r.status === "Active");

    container.innerHTML = `
      <h3>Moderation Queue (${flagged.length} flagged)</h3>
      <div class="admin-list">
        ${flagged.map(Admin.rowHTML).join("") || "<p class='empty-state'>No flagged reports.</p>"}
      </div>
      <h3>All Active Reports (${active.length})</h3>
      <div class="admin-list">
        ${active.map(Admin.rowHTML).join("")}
      </div>
    `;
  },

  rowHTML(r) {
    const typeInfo = CONFIG.EMERGENCY_TYPES[r.type] || CONFIG.EMERGENCY_TYPES.other;
    return `
      <div class="admin-row" data-report-id="${r.reportId}">
        <span>${typeInfo.icon} <strong>${r.reportId}</strong></span>
        <span class="muted">${Utils.escapeHTML(r.description).slice(0, 80)}</span>
        <span class="admin-actions">
          <button data-admin-action="resolve" data-report-id="${r.reportId}">Mark Resolved</button>
          <button data-admin-action="hide" data-report-id="${r.reportId}">Hide</button>
          <button data-admin-action="history" data-report-id="${r.reportId}">Audit Trail</button>
        </span>
      </div>`;
  },
};
