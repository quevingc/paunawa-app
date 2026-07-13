/**
 * Users.gs
 * Minimal user registry. Users are anonymous device IDs (see
 * Utils.getDeviceId() on the client) with an optional display alias.
 * No passwords/PII are collected — this is a lightweight reputation
 * ledger, not an auth system.
 */

const Users_ = {
  register(user) {
    if (!user || !user.userId) throw new Error("Missing userId.");
    const existing = Utils_.getRowObject(SHEET_NAMES.USERS, "userId", user.userId);
    if (existing) {
      Utils_.updateRow(SHEET_NAMES.USERS, "userId", user.userId, {
        alias: user.alias || existing.alias,
      });
      return existing;
    }
    const row = {
      userId: user.userId,
      alias: user.alias || "Anonymous",
      createdAt: Utils_.nowISO(),
      role: "reporter",
      reportsSubmitted: 0,
    };
    Utils_.appendRow(SHEET_NAMES.USERS, row);
    return row;
  },

  incrementReportCount(userId) {
    const existing = Utils_.getRowObject(SHEET_NAMES.USERS, "userId", userId);
    if (!existing) return;
    Utils_.updateRow(SHEET_NAMES.USERS, "userId", userId, {
      reportsSubmitted: (Number(existing.reportsSubmitted) || 0) + 1,
    });
  },
};
