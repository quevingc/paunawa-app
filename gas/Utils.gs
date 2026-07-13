/**
 * Utils.gs
 * Shared helpers used across the other .gs files: sheet lookups,
 * row <-> object conversion, ID generation, and settings access.
 */

const Utils_ = {
  ss() {
    return SpreadsheetApp.getActiveSpreadsheet();
  },

  sheet(name) {
    const s = Utils_.ss().getSheetByName(name);
    if (!s) throw new Error(`Sheet "${name}" not found. Run setupSpreadsheet() first.`);
    return s;
  },

  /** Read all rows of a sheet as an array of objects keyed by header row */
  getAllRows(sheetName) {
    const sheet = Utils_.sheet(sheetName);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    const headers = values[0];
    return values.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
  },

  /** Append a row to a sheet from an object, matching the header order */
  appendRow(sheetName, obj) {
    const sheet = Utils_.sheet(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map((h) => (obj[h] !== undefined ? obj[h] : ""));
    sheet.appendRow(row);
  },

  /** Find the 1-indexed sheet row number for a given key column value */
  findRowIndex(sheetName, keyColumnName, keyValue) {
    const sheet = Utils_.sheet(sheetName);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const colIdx = headers.indexOf(keyColumnName);
    if (colIdx === -1) return -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][colIdx]) === String(keyValue)) return i + 1; // 1-indexed row
    }
    return -1;
  },

  /** Update specific fields of a row identified by key column/value */
  updateRow(sheetName, keyColumnName, keyValue, changes) {
    const sheet = Utils_.sheet(sheetName);
    const rowIdx = Utils_.findRowIndex(sheetName, keyColumnName, keyValue);
    if (rowIdx === -1) throw new Error(`Row with ${keyColumnName}=${keyValue} not found in ${sheetName}`);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    Object.entries(changes).forEach(([field, value]) => {
      const colIdx = headers.indexOf(field);
      if (colIdx !== -1) {
        sheet.getRange(rowIdx, colIdx + 1).setValue(value);
      }
    });
    return true;
  },

  getRowObject(sheetName, keyColumnName, keyValue) {
    const rows = Utils_.getAllRows(sheetName);
    return rows.find((r) => String(r[keyColumnName]) === String(keyValue)) || null;
  },

  generateId(prefix) {
    return `${prefix}-${Utilities.getUuid().slice(0, 8).toUpperCase()}`;
  },

  nowISO() {
    return new Date().toISOString();
  },

  getSetting(key, fallback) {
    const rows = Utils_.getAllRows(SHEET_NAMES.SETTINGS);
    const row = rows.find((r) => r.key === key);
    return row ? row.value : fallback;
  },

  verifyAdminPin(pin) {
    const stored = Utils_.getSetting("adminPin", null);
    return { valid: stored !== null && String(pin) === String(stored) };
  },

  /** SHA-256 hex digest using Apps Script's built-in Utilities service */
  sha256(str) {
    const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
    return rawHash
      .map((byte) => {
        const v = (byte < 0 ? byte + 256 : byte).toString(16);
        return v.length === 1 ? "0" + v : v;
      })
      .join("");
  },
};
