/**
 * dashboard.js
 * Renders dashboard widgets: active incident count, counts by type,
 * timeline chart, recent reports, and most-verified reports.
 * Uses Chart.js (loaded via CDN in index.html).
 */

const Dashboard = {
  typeChart: null,
  timelineChart: null,

  render(reports) {
    Dashboard.renderSummary(reports);
    Dashboard.renderTypeChart(reports);
    Dashboard.renderTimelineChart(reports);
    Dashboard.renderRecent(reports);
    Dashboard.renderMostVerified(reports);
  },

  renderSummary(reports) {
    const active = reports.filter((r) => r.status === "Active").length;
    const monitoring = reports.filter((r) => r.status === "Monitoring").length;
    const resolved = reports.filter((r) => r.status === "Resolved").length;

    Dashboard.setText("statActive", active);
    Dashboard.setText("statMonitoring", monitoring);
    Dashboard.setText("statResolved", resolved);
    Dashboard.setText("statTotal", reports.length);
  },

  setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  renderTypeChart(reports) {
    const canvas = document.getElementById("typeChart");
    const overlay = document.getElementById("typeChartEmpty");
    if (!canvas || typeof Chart === "undefined") return;

    if (overlay) overlay.hidden = reports.length > 0;
    if (reports.length === 0) {
      if (Dashboard.typeChart) Dashboard.typeChart.destroy();
      return;
    }

    const counts = {};
    Object.keys(CONFIG.EMERGENCY_TYPES).forEach((t) => (counts[t] = 0));
    reports.forEach((r) => {
      if (counts[r.type] !== undefined) counts[r.type]++;
    });

    const labels = Object.keys(counts).map((t) => CONFIG.EMERGENCY_TYPES[t].label);
    const data = Object.values(counts);
    const colors = Object.keys(counts).map((t) => CONFIG.EMERGENCY_TYPES[t].color);

    if (Dashboard.typeChart) Dashboard.typeChart.destroy();
    Dashboard.typeChart = new Chart(canvas, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors }] },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    });
  },

  renderTimelineChart(reports) {
    const canvas = document.getElementById("timelineChart");
    const overlay = document.getElementById("timelineChartEmpty");
    if (!canvas || typeof Chart === "undefined") return;

    if (overlay) overlay.hidden = reports.length > 0;
    if (reports.length === 0) {
      if (Dashboard.timelineChart) Dashboard.timelineChart.destroy();
      return;
    }

    // Bucket reports by day for the last 14 days
    const days = [];
    const counts = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(key.slice(5)); // MM-DD
      counts.push(
        reports.filter((r) => (r.timestamp || "").slice(0, 10) === key).length
      );
    }

    if (Dashboard.timelineChart) Dashboard.timelineChart.destroy();
    Dashboard.timelineChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: days,
        datasets: [
          {
            label: "Reports per day",
            data: counts,
            borderColor: "#E53935",
            backgroundColor: "rgba(229,57,53,0.15)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  },

  renderRecent(reports) {
    const container = document.getElementById("recentReportsList");
    if (!container) return;
    const recent = [...reports]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8);
    container.innerHTML = recent.map((r) => Dashboard.reportListItem(r)).join("") ||
      `<div class="empty-state empty-state-compact"><span class="empty-state-icon">🕒</span><span>No reports yet.</span></div>`;
  },

  renderMostVerified(reports) {
    const container = document.getElementById("mostVerifiedList");
    if (!container) return;
    const verified = [...reports]
      .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
      .slice(0, 8);
    container.innerHTML = verified.map((r) => Dashboard.reportListItem(r, true)).join("") ||
      `<div class="empty-state empty-state-compact"><span class="empty-state-icon">✔️</span><span>No verified reports yet.</span></div>`;
  },

  reportListItem(r, showUpvotes = false) {
    const typeInfo = CONFIG.EMERGENCY_TYPES[r.type] || CONFIG.EMERGENCY_TYPES.other;
    const statusInfo = CONFIG.STATUS[r.status] || CONFIG.STATUS.Active;
    return `
      <button class="report-list-item" style="--item-accent:${typeInfo.color}" data-open-report="${r.reportId}">
        <span class="dot">${typeInfo.icon}</span>
        <div class="report-list-item-body">
          <strong>${typeInfo.label}</strong>
          <span class="muted">${Utils.escapeHTML(r.description).slice(0, 60)}…</span>
        </div>
        <div class="report-list-item-meta">
          ${showUpvotes ? `<span class="badge-outline">✔ ${r.upvotes || 0}</span>` : ""}
          <span class="badge" style="background:${statusInfo.color}">${statusInfo.label}</span>
          <small>${Utils.timeAgo(r.timestamp)}</small>
        </div>
      </button>`;
  },
};