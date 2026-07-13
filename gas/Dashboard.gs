/**
 * Dashboard.gs
 * Aggregated statistics for the dashboard view. Most chart rendering
 * happens client-side from the full report list (js/dashboard.js);
 * this endpoint provides server-computed summary numbers as a fast
 * alternative for low-bandwidth clients or future admin tooling.
 */

const Dashboard_ = {
  getStats() {
    const reports = Utils_.getAllRows(SHEET_NAMES.REPORTS).filter((r) => !r.hidden);

    const byType = {};
    const byStatus = { Active: 0, Monitoring: 0, Resolved: 0 };
    reports.forEach((r) => {
      byType[r.type] = (byType[r.type] || 0) + 1;
      if (byStatus[r.status] !== undefined) byStatus[r.status]++;
    });

    const sortedByUpvotes = [...reports].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    const sortedByRecency = [...reports].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    return {
      totalReports: reports.length,
      byType,
      byStatus,
      mostVerified: sortedByUpvotes.slice(0, 8).map((r) => r.reportId),
      mostRecent: sortedByRecency.slice(0, 8).map((r) => r.reportId),
      generatedAt: Utils_.nowISO(),
    };
  },
};
