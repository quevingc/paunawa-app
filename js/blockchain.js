/**
 * blockchain.js
 * Lightweight hash-chain (audit trail) helper used on the client to:
 *  - compute the same SHA-256 hash the backend computes, for local verification
 *  - independently verify a fetched audit trail is unbroken (tamper evidence)
 *
 * This mirrors the logic in gas/Blockchain.gs. It is NOT a distributed
 * blockchain — it's a hash-chain ledger stored in the "Blockchain" sheet,
 * which is sufficient to detect tampering of historical records without
 * the overhead/cost of a real blockchain network.
 */

const BlockchainClient = {
  /** SHA-256 hash of a string, returned as hex */
  async sha256(message) {
    const data = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  /**
   * Build the canonical string used for hashing a block.
   * MUST exactly match the concatenation order used server-side (Blockchain.gs).
   */
  buildBlockString({ previousHash, reportId, action, editorId, timestamp, payload }) {
    return [
      previousHash || "GENESIS",
      reportId || "",
      action || "",
      editorId || "",
      timestamp || "",
      typeof payload === "string" ? payload : JSON.stringify(payload || {}),
    ].join("|");
  },

  /** Compute the hash for a single audit block */
  async computeHash(block) {
    const str = BlockchainClient.buildBlockString(block);
    return BlockchainClient.sha256(str);
  },

  /**
   * Verify a full chain (array of audit records, oldest first) is unbroken:
   * each block's previousHash must equal the prior block's currentHash,
   * and each block's currentHash must match its recomputed hash.
   * Returns { valid, brokenAt } where brokenAt is the index of first break, or -1.
   */
  async verifyChain(chain) {
    if (!Array.isArray(chain) || chain.length === 0) {
      return { valid: true, brokenAt: -1 };
    }
    let prevHash = "GENESIS";
    for (let i = 0; i < chain.length; i++) {
      const block = chain[i];
      if (block.previousHash !== prevHash) {
        return { valid: false, brokenAt: i, reason: "previousHash mismatch" };
      }
      const recomputed = await BlockchainClient.computeHash(block);
      if (recomputed !== block.currentHash) {
        return { valid: false, brokenAt: i, reason: "currentHash mismatch (data tampered)" };
      }
      prevHash = block.currentHash;
    }
    return { valid: true, brokenAt: -1 };
  },

  /** Render a short human-readable fingerprint from a hash (first/last 6 chars) */
  shortHash(hash) {
    if (!hash) return "—";
    return `${hash.slice(0, 6)}…${hash.slice(-6)}`;
  },
};
