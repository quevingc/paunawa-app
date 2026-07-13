/**
 * Setup.gs
 * Run `setupSpreadsheet()` ONCE from the Apps Script editor (select the
 * function in the toolbar dropdown and click Run) to create all required
 * sheet tabs with headers. Safe to re-run — it will not duplicate existing
 * sheets/headers.
 */

const SHEET_NAMES = {
  REPORTS: "Reports",
  UPDATES: "Updates",
  RATINGS: "Ratings",
  USERS: "Users",
  BLOCKCHAIN: "Blockchain",
  SETTINGS: "Settings",
  FACILITIES: "Facilities",
  IMAGES: "Images",
};

const SHEET_SCHEMAS = {
  Reports: [
    "reportId", "timestamp", "lastUpdated", "type", "status",
    "lat", "lng", "description", "reporterAlias", "editorId",
    "upvotes", "avgAccuracy", "avgAuthenticity", "avgUsefulness",
    "flagged", "hidden", "imageCount",
  ],
  Updates: [
    "updateId", "reportId", "timestamp", "editorId", "editorAlias",
    "fieldChanged", "oldValue", "newValue",
  ],
  Ratings: [
    "ratingId", "reportId", "userId", "accuracy", "authenticity",
    "usefulness", "timestamp",
  ],
  Users: [
    "userId", "alias", "createdAt", "role", "reportsSubmitted",
  ],
  Blockchain: [
    "blockId", "reportId", "action", "editorId", "timestamp",
    "previousHash", "currentHash", "payloadSnapshot",
  ],
  Settings: [
    "key", "value",
  ],
  Facilities: [
    "facilityId", "name", "type", "lat", "lng", "capacity", "contact",
    "description", "submittedBy", "editorId", "upvotes", "flagged",
    "hidden", "imageCount", "timestamp", "lastUpdated",
  ],
  Images: [
    "imageId", "reportId", "uploadedAt", "base64OrUrl", "caption",
  ],
};

function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.entries(SHEET_SCHEMAS).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const alreadySet = headers.every((h, i) => firstRow[i] === h);
    if (!alreadySet) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    }
  });

  // Remove default "Sheet1" if empty and unused
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }

  // Seed default settings (admin PIN — CHANGE THIS after setup!)
  const settings = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (settings.getLastRow() < 2) {
    settings.appendRow(["adminPin", "changeme123"]);
    settings.appendRow(["appName", "Paunawa"]);
  }

  // Seed a couple of sample facilities so the map isn't empty on first run
  const facilities = ss.getSheetByName(SHEET_NAMES.FACILITIES);
  if (facilities.getLastRow() < 2) {
    const now = new Date().toISOString();
    facilities.appendRow([
      "FAC-0001", "City Central Evacuation Center", "evacuation", 14.6091, 121.0223,
      "500", "+63-000-0000", "Primary evacuation site for flood-prone barangays.",
      "System", "system", 0, false, false, 0, now, now,
    ]);
    facilities.appendRow([
      "FAC-0002", "General Hospital", "hospital", 14.6042, 121.0198,
      "", "+63-000-1111", "", "System", "system", 0, false, false, 0, now, now,
    ]);
  }

  SpreadsheetApp.getUi().alert("Setup complete. All sheets are ready.");
}
