/**
 * Ratings.gs
 * Handles accuracy/authenticity/usefulness ratings and keeps the
 * Reports sheet's average columns in sync (denormalized for fast reads).
 */

const Ratings_ = {
  submit(reportId, userId, ratings) {
    if (!ratings || !reportId) throw new Error("Missing rating data.");
    const clamp = (n) => Math.max(1, Math.min(5, Number(n) || 3));

    Utils_.appendRow(SHEET_NAMES.RATINGS, {
      ratingId: Utils_.generateId("RTG"),
      reportId,
      userId: userId || "anonymous",
      accuracy: clamp(ratings.accuracy),
      authenticity: clamp(ratings.authenticity),
      usefulness: clamp(ratings.usefulness),
      timestamp: Utils_.nowISO(),
    });

    Ratings_.recomputeAverages_(reportId);
    Blockchain_.appendBlock(reportId, "RATE", userId || "anonymous", ratings);

    return { success: true };
  },

  recomputeAverages_(reportId) {
    const all = Utils_.getAllRows(SHEET_NAMES.RATINGS).filter((r) => r.reportId === reportId);
    if (all.length === 0) return;
    const avg = (key) => all.reduce((sum, r) => sum + Number(r[key] || 0), 0) / all.length;

    Utils_.updateRow(SHEET_NAMES.REPORTS, "reportId", reportId, {
      avgAccuracy: Math.round(avg("accuracy") * 10) / 10,
      avgAuthenticity: Math.round(avg("authenticity") * 10) / 10,
      avgUsefulness: Math.round(avg("usefulness") * 10) / 10,
    });
  },
};
