/**
 * utils.js
 * Shared helper functions used across the app.
 */

const Utils = {
  /** Generate a unique Report ID, e.g. RPT-20260711-4F9A2C */
  generateReportId() {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randPart = Math.random().toString(16).slice(2, 8).toUpperCase();
    return `RPT-${datePart}-${randPart}`;
  },

  /** Generate a generic unique ID (for updates, ratings, users) */
  generateId(prefix = "ID") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;
  },

  /** ISO timestamp for "now" */
  nowISO() {
    return new Date().toISOString();
  },

  /** Format ISO date for display */
  formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  },

  /** Relative time, e.g. "5 minutes ago" */
  timeAgo(iso) {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    const intervals = [
      ["year", 31536000],
      ["month", 2592000],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ];
    for (const [name, secs] of intervals) {
      const count = Math.floor(seconds / secs);
      if (count >= 1) return `${count} ${name}${count > 1 ? "s" : ""} ago`;
    }
    return "just now";
  },

  /** Haversine distance in kilometers between two lat/lng points */
  distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = Utils.toRad(lat2 - lat1);
    const dLon = Utils.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(Utils.toRad(lat1)) *
        Math.cos(Utils.toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad(deg) {
    return (deg * Math.PI) / 180;
  },

  /** Get browser geolocation as a Promise */
  getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, ...options }
      );
    });
  },

  /** Basic HTML escaping to prevent XSS from user-submitted text */
  escapeHTML(str = "") {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  /** Validate a facility submission before sending to the API */
  validateFacility(facility) {
    const errors = [];
    if (!facility.name || facility.name.trim().length < 3) {
      errors.push("Facility name must be at least 3 characters.");
    }
    if (!facility.type || !CONFIG.FACILITIES[facility.type]) {
      errors.push("Please select a valid facility type.");
    }
    if (
      typeof facility.lat !== "number" ||
      typeof facility.lng !== "number" ||
      Math.abs(facility.lat) > 90 ||
      Math.abs(facility.lng) > 180
    ) {
      errors.push("A valid location is required (pin on map or use GPS).");
    }
    if (facility.images && facility.images.length > CONFIG.MAX_IMAGES_PER_REPORT) {
      errors.push(`You can attach up to ${CONFIG.MAX_IMAGES_PER_REPORT} images.`);
    }
    return { valid: errors.length === 0, errors };
  },

  /** Validate a report submission before sending to the API */
  validateReport(report) {
    const errors = [];
    if (!report.description || report.description.trim().length < CONFIG.MIN_DESCRIPTION_LENGTH) {
      errors.push(
        `Description must be at least ${CONFIG.MIN_DESCRIPTION_LENGTH} characters.`
      );
    }
    if (report.description && report.description.length > CONFIG.MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `Description must be under ${CONFIG.MAX_DESCRIPTION_LENGTH} characters.`
      );
    }
    if (!report.type || !CONFIG.EMERGENCY_TYPES[report.type]) {
      errors.push("Please select a valid emergency type.");
    }
    if (
      typeof report.lat !== "number" ||
      typeof report.lng !== "number" ||
      Math.abs(report.lat) > 90 ||
      Math.abs(report.lng) > 180
    ) {
      errors.push("A valid location is required (pin on map or use GPS).");
    }
    if (report.images && report.images.length > CONFIG.MAX_IMAGES_PER_REPORT) {
      errors.push(`You can attach up to ${CONFIG.MAX_IMAGES_PER_REPORT} images.`);
    }
    return { valid: errors.length === 0, errors };
  },

  /** Very light spam heuristic: repeated characters, links spam, all caps shouting */
  looksLikeSpam(text) {
    if (!text) return false;
    const repeatedChar = /(.)\1{9,}/.test(text); // same char 10+ times
    const manyLinks = (text.match(/https?:\/\//g) || []).length > 2;
    const allCapsLong = text.length > 30 && text === text.toUpperCase();
    return repeatedChar || manyLinks || allCapsLong;
  },

  /** Client-side submission cooldown using localStorage */
  isOnCooldown() {
    const last = localStorage.getItem("ca_last_submit");
    if (!last) return false;
    return (Date.now() - parseInt(last, 10)) / 1000 < CONFIG.SUBMISSION_COOLDOWN_SECONDS;
  },
  markSubmitted() {
    localStorage.setItem("ca_last_submit", Date.now().toString());
  },

  /** Debounce helper */
  debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  },

  /** Read a File object as a base64 data URL, with resizing to limit payload size */
  fileToResizedBase64(file, maxDim = 1280, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width *= scale;
            height *= scale;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /** Copy text to clipboard with fallback */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    }
  },

  /** Build a shareable URL for a report or facility (paramName: "report" | "facility") */
  buildShareLink(id, paramName = "report") {
    const url = new URL(window.location.href);
    url.searchParams.set(paramName, id);
    return url.toString();
  },

  /** Simple UUID v4 (used for anonymous user/device IDs) */
  uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /** Get or create a persistent anonymous device/user ID */
  getDeviceId() {
    let id = localStorage.getItem("ca_device_id");
    if (!id) {
      id = Utils.uuid();
      localStorage.setItem("ca_device_id", id);
    }
    return id;
  },
};
