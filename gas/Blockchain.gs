/**
 * Blockchain.gs
 * Implements a lightweight, append-only hash chain in the "Blockchain"
 * sheet. Every create/update/moderate action writes one block containing:
 *   - previousHash (the last block's currentHash for this report, or "GENESIS")
 *   - currentHash  (SHA-256 of the block's contents)
 *   - timestamp, editorId, action, and a snapshot of the change
 *
 * This is a hash chain, not a distributed blockchain: it runs inside a
 * single Google Sheet. Its purpose is TAMPER EVIDENCE — if any historical
 * row in the Blockchain sheet is edited after the fact, recomputing the
 * hash will no longer match currentHash, and the chain link will break.
 * That is sufficient for a public transparency/audit-trail feature without
 * the cost and complexity of a real distributed ledger.
 *
 * IMPORTANT: buildBlockString_ must exactly match BlockchainClient.buildBlockString
 * in js/blockchain.js so the client can independently re-verify hashes.
 */

const Blockchain_ = {
  /** Get the current head hash for a report's chain ("GENESIS" if none yet) */
  getHeadHash(reportId) {
    const rows = Utils_.getAllRows(SHEET_NAMES.BLOCKCHAIN).filter((r) => r.reportId === reportId);
    if (rows.length === 0) return "GENESIS";
    // rows are in insertion order (sheet append order)
    return rows[rows.length - 1].currentHash;
  },

  buildBlockString_(block) {
    return [
      block.previousHash || "GENESIS",
      block.reportId || "",
      block.action || "",
      block.editorId || "",
      block.timestamp || "",
      typeof block.payload === "string" ? block.payload : JSON.stringify(block.payload || {}),
    ].join("|");
  },

  /** Append a new block to the chain for a given report. Returns the block. */
  appendBlock(reportId, action, editorId, payload) {
    const previousHash = Blockchain_.getHeadHash(reportId);
    const timestamp = Utils_.nowISO();
    const block = { previousHash, reportId, action, editorId, timestamp, payload };
    const currentHash = Utils_.sha256(Blockchain_.buildBlockString_(block));

    Utils_.appendRow(SHEET_NAMES.BLOCKCHAIN, {
      blockId: Utils_.generateId("BLK"),
      reportId,
      action,
      editorId: editorId || "anonymous",
      timestamp,
      previousHash,
      currentHash,
      payloadSnapshot: typeof payload === "string" ? payload : JSON.stringify(payload || {}),
    });

    return { previousHash, currentHash, timestamp, action, editorId, reportId };
  },

  /** Retrieve the full chain for a report, oldest first, formatted for the client */
  getHistory(reportId) {
    const rows = Utils_.getAllRows(SHEET_NAMES.BLOCKCHAIN).filter((r) => r.reportId === reportId);
    return rows.map((r) => ({
      blockId: r.blockId,
      reportId: r.reportId,
      action: r.action,
      editorId: r.editorId,
      timestamp: r.timestamp,
      previousHash: r.previousHash,
      currentHash: r.currentHash,
      payload: (() => {
        try {
          return JSON.parse(r.payloadSnapshot);
        } catch {
          return r.payloadSnapshot;
        }
      })(),
    }));
  },

  /**
   * Server-side self-check: verify the whole chain for a report is unbroken.
   * Uses the raw payloadSnapshot string (not a parse/stringify round-trip)
   * so hash recomputation is guaranteed byte-identical to what was hashed
   * at write time.
   */
  verifyChain(reportId) {
    const rawRows = Utils_.getAllRows(SHEET_NAMES.BLOCKCHAIN).filter((r) => r.reportId === reportId);
    let prevHash = "GENESIS";
    for (const r of rawRows) {
      if (r.previousHash !== prevHash) {
        return { valid: false, brokenAt: r.blockId, reason: "previousHash mismatch" };
      }
      const recomputed = Utils_.sha256(
        Blockchain_.buildBlockString_({
          previousHash: r.previousHash,
          reportId: r.reportId,
          action: r.action,
          editorId: r.editorId,
          timestamp: r.timestamp,
          payload: r.payloadSnapshot,
        })
      );
      if (recomputed !== r.currentHash) {
        return { valid: false, brokenAt: r.blockId, reason: "currentHash mismatch (tampered)" };
      }
      prevHash = r.currentHash;
    }
    return { valid: true };
  },
};
