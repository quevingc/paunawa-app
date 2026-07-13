/**
 * reports.js
 * Handles report submission, listing, filtering, editing, ratings/upvotes,
 * duplicate detection, and shareable links.
 */

const Reports = {
  all: [],
  filtered: [],
  currentImages: [], // base64 images staged for the active form
  editingReportId: null,

  async loadAll() {
    try {
      const data = await Api.getReports({});
      Reports.all = data || [];
    } catch (e) {
      console.warn("Falling back — could not load reports:", e.message);
      Reports.all = [];
    }
    Reports.applyFilters();
    return Reports.all;
  },

  applyFilters() {
    const typeFilter = document.getElementById("filterType")?.value || "";
    const statusFilter = document.getElementById("filterStatus")?.value || "";
    const searchTerm = (document.getElementById("searchInput")?.value || "").toLowerCase();

    Reports.filtered = Reports.all.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (searchTerm) {
        const haystack = `${r.description} ${r.type} ${r.reporterAlias || ""}`.toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    });

    return Reports.filtered;
  },

  /** Client-side duplicate detection: same type, close in space & time */
  findPossibleDuplicates(newReport) {
    const windowMs = CONFIG.DUPLICATE_TIME_WINDOW_MINUTES * 60 * 1000;
    const now = Date.now();
    return Reports.all.filter((r) => {
      if (r.type !== newReport.type) return false;
      const age = now - new Date(r.timestamp).getTime();
      if (age > windowMs) return false;
      const distM = Utils.distanceKm(r.lat, r.lng, newReport.lat, newReport.lng) * 1000;
      return distM <= CONFIG.DUPLICATE_RADIUS_METERS;
    });
  },

  /** Confidence score: weighted blend of upvotes + average ratings, 0-100 */
  computeConfidenceScore(report) {
    const upvotes = report.upvotes || 0;
    const avgRating =
      ((report.avgAccuracy || 0) + (report.avgAuthenticity || 0) + (report.avgUsefulness || 0)) / 3;
    const upvoteScore = Math.min(upvotes * 4, 40); // caps at 40 pts
    const ratingScore = (avgRating / 5) * 60; // caps at 60 pts
    return Math.round(upvoteScore + ratingScore);
  },

  async submit(formData) {
    if (Utils.isOnCooldown()) {
      throw new Error("Please wait a moment before submitting another report.");
    }
    if (Utils.looksLikeSpam(formData.description)) {
      throw new Error("Your report looks like spam. Please provide a genuine description.");
    }
    const { valid, errors } = Utils.validateReport(formData);
    if (!valid) throw new Error(errors.join(" "));

    const report = {
      reportId: Utils.generateReportId(),
      timestamp: Utils.nowISO(),
      lastUpdated: Utils.nowISO(),
      lat: formData.lat,
      lng: formData.lng,
      description: formData.description.trim(),
      type: formData.type,
      images: formData.images || [],
      reporterAlias: formData.reporterAlias || "Anonymous",
      status: "Active",
      editorId: Utils.getDeviceId(),
    };

    Utils.markSubmitted();

    if (!navigator.onLine) {
      await OfflineQueue.add(report);
      return { offline: true, report };
    }

    const saved = await Api.createReport(report);
    return { offline: false, report: saved || report };
  },

  async update(reportId, changes) {
    const editorId = Utils.getDeviceId();
    const editorAlias = document.getElementById("editorAliasDisplay")?.textContent || "Anonymous";
    return Api.updateReport(reportId, changes, editorId, editorAlias);
  },

  async upvote(reportId) {
    const userId = Utils.getDeviceId();
    const voteKey = `ca_voted_${reportId}`;
    if (localStorage.getItem(voteKey)) {
      throw new Error("You already verified this report.");
    }
    const result = await Api.upvoteReport(reportId, userId);
    localStorage.setItem(voteKey, "1");
    return result;
  },

  async rate(reportId, ratings) {
    const userId = Utils.getDeviceId();
    return Api.submitRating(reportId, userId, ratings);
  },

  async getHistory(reportId) {
    return Api.getAuditHistory(reportId);
  },

  exportCSV(reports) {
    const headers = [
      "reportId",
      "timestamp",
      "lastUpdated",
      "type",
      "status",
      "lat",
      "lng",
      "description",
      "reporterAlias",
      "upvotes",
    ];
    const rows = reports.map((r) =>
      headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    Reports.downloadFile(csv, "paunawa-reports.csv", "text/csv");
  },

  exportJSON(reports) {
    Reports.downloadFile(
      JSON.stringify(reports, null, 2),
      "paunawa-reports.json",
      "application/json"
    );
  },

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
