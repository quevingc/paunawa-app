/**
 * notifications.js
 * Requests permission for, and dispatches, browser notifications when a
 * new incident is reported within CONFIG.MAP.nearbyRadiusKm of the user.
 */

const Notifications = {
  permission: "default",
  userPosition: null,
  notifiedReportIds: new Set(),

  async init() {
    if (!("Notification" in window)) return;
    Notifications.permission = Notification.permission;
    try {
      Notifications.userPosition = await Utils.getCurrentPosition();
    } catch {
      // location unavailable — nearby alerts simply won't fire
    }
  },

  async requestPermission() {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return false;
    }
    const result = await Notification.requestPermission();
    Notifications.permission = result;
    return result === "granted";
  },

  /** Call with a freshly fetched list of reports; notifies about new nearby ones */
  checkNearby(reports) {
    if (Notifications.permission !== "granted" || !Notifications.userPosition) return;
    const { lat, lng } = Notifications.userPosition;
    reports.forEach((r) => {
      if (Notifications.notifiedReportIds.has(r.reportId)) return;
      if (r.status !== "Active") return;
      const dist = Utils.distanceKm(lat, lng, r.lat, r.lng);
      if (dist <= CONFIG.MAP.nearbyRadiusKm) {
        Notifications.notifiedReportIds.add(r.reportId);
        Notifications.fire(r, dist);
      }
    });
  },

  fire(report, distanceKm) {
    const typeInfo = CONFIG.EMERGENCY_TYPES[report.type] || CONFIG.EMERGENCY_TYPES.other;
    const notif = new Notification(`${typeInfo.icon} ${typeInfo.label} nearby`, {
      body: `${distanceKm.toFixed(1)} km away — ${report.description.slice(0, 100)}`,
      tag: report.reportId,
      icon: "icons/icon-192.png",
    });
    notif.onclick = () => {
      window.focus();
      window.dispatchEvent(new CustomEvent("focus-report", { detail: report.reportId }));
    };
  },
};
