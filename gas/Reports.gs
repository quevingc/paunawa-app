/**
 * Reports.gs
 * Create/read/update/upvote/moderate operations for emergency reports.
 * Every mutating action also appends a block to the hash-chain audit
 * trail via Blockchain_.appendBlock().
 */

const Reports_ = {
  create(report) {
    if (!report || !report.description || !report.type) {
      throw new Error("Missing required report fields.");
    }

    const reportId = report.reportId || Utils_.generateId("RPT");
    const now = Utils_.nowISO();

    const row = {
      reportId,
      timestamp: report.timestamp || now,
      lastUpdated: now,
      type: report.type,
      status: "Active",
      lat: report.lat,
      lng: report.lng,
      description: Reports_.sanitize_(report.description),
      reporterAlias: report.reporterAlias || "Anonymous",
      editorId: report.editorId || "anonymous",
      upvotes: 0,
      avgAccuracy: 0,
      avgAuthenticity: 0,
      avgUsefulness: 0,
      flagged: false,
      hidden: false,
      imageCount: (report.images || []).length,
    };

    Utils_.appendRow(SHEET_NAMES.REPORTS, row);

    // Store images (if any) in the Images sheet, capped for sheet-size sanity
    (report.images || []).slice(0, 5).forEach((img, i) => {
      Utils_.appendRow(SHEET_NAMES.IMAGES, {
        imageId: Utils_.generateId("IMG"),
        reportId,
        uploadedAt: now,
        base64OrUrl: img,
        caption: `photo-${i + 1}`,
      });
    });

    Blockchain_.appendBlock(reportId, "CREATE", row.editorId, {
      type: row.type,
      description: row.description,
      lat: row.lat,
      lng: row.lng,
    });

    return Reports_.get(reportId);
  },

  list(filters) {
    let rows = Utils_.getAllRows(SHEET_NAMES.REPORTS).filter((r) => !r.hidden);
    if (filters && filters.type) rows = rows.filter((r) => r.type === filters.type);
    if (filters && filters.status) rows = rows.filter((r) => r.status === filters.status);

    // Attach images
    const images = Utils_.getAllRows(SHEET_NAMES.IMAGES);
    return rows.map((r) => ({
      ...r,
      images: images.filter((i) => i.reportId === r.reportId).map((i) => i.base64OrUrl),
    }));
  },

  get(reportId) {
    const row = Utils_.getRowObject(SHEET_NAMES.REPORTS, "reportId", reportId);
    if (!row) return null;
    const images = Utils_.getAllRows(SHEET_NAMES.IMAGES).filter((i) => i.reportId === reportId);
    return { ...row, images: images.map((i) => i.base64OrUrl) };
  },

  update(reportId, changes, editorId, editorAlias) {
    const existing = Utils_.getRowObject(SHEET_NAMES.REPORTS, "reportId", reportId);
    if (!existing) throw new Error("Report not found.");

    const allowedFields = ["description", "type", "status", "lat", "lng"];
    const applied = {};
    allowedFields.forEach((f) => {
      if (changes[f] !== undefined && changes[f] !== existing[f]) {
        applied[f] = changes[f];
        // Log a field-level Update record for granular version history
        Utils_.appendRow(SHEET_NAMES.UPDATES, {
          updateId: Utils_.generateId("UPD"),
          reportId,
          timestamp: Utils_.nowISO(),
          editorId: editorId || "anonymous",
          editorAlias: editorAlias || "Anonymous",
          fieldChanged: f,
          oldValue: existing[f],
          newValue: changes[f],
        });
      }
    });

    if (changes.description) applied.description = Reports_.sanitize_(changes.description);
    applied.lastUpdated = Utils_.nowISO();

    Utils_.updateRow(SHEET_NAMES.REPORTS, "reportId", reportId, applied);

    // Replace images if new ones were supplied
    if (Array.isArray(changes.images)) {
      const imgSheet = Utils_.sheet(SHEET_NAMES.IMAGES);
      const values = imgSheet.getDataRange().getValues();
      const headers = values[0];
      const reportIdCol = headers.indexOf("reportId");
      // Remove old rows for this report (iterate backwards to keep indices valid)
      for (let i = values.length - 1; i >= 1; i--) {
        if (values[i][reportIdCol] === reportId) imgSheet.deleteRow(i + 1);
      }
      changes.images.slice(0, 5).forEach((img, i) => {
        Utils_.appendRow(SHEET_NAMES.IMAGES, {
          imageId: Utils_.generateId("IMG"),
          reportId,
          uploadedAt: Utils_.nowISO(),
          base64OrUrl: img,
          caption: `photo-${i + 1}`,
        });
      });
      Utils_.updateRow(SHEET_NAMES.REPORTS, "reportId", reportId, { imageCount: changes.images.length });
    }

    Blockchain_.appendBlock(reportId, "UPDATE", editorId || "anonymous", applied);

    return Reports_.get(reportId);
  },

  upvote(reportId, userId) {
    const existing = Utils_.getRowObject(SHEET_NAMES.REPORTS, "reportId", reportId);
    if (!existing) throw new Error("Report not found.");
    const newCount = (Number(existing.upvotes) || 0) + 1;
    Utils_.updateRow(SHEET_NAMES.REPORTS, "reportId", reportId, { upvotes: newCount });
    Blockchain_.appendBlock(reportId, "UPVOTE", userId || "anonymous", { upvotes: newCount });
    return { upvotes: newCount };
  },

  attachImageMeta(reportId, imageMeta) {
    Utils_.appendRow(SHEET_NAMES.IMAGES, {
      imageId: Utils_.generateId("IMG"),
      reportId,
      uploadedAt: Utils_.nowISO(),
      base64OrUrl: imageMeta.data,
      caption: imageMeta.caption || "",
    });
    return { success: true };
  },

  /** Admin moderation: hide / unhide / resolve a report */
  moderate(reportId, moderatorId, action, reason) {
    const existing = Utils_.getRowObject(SHEET_NAMES.REPORTS, "reportId", reportId);
    if (!existing) throw new Error("Report not found.");

    const changes = {};
    if (action === "hide") changes.hidden = true;
    if (action === "unhide") changes.hidden = false;
    if (action === "resolve") changes.status = "Resolved";
    if (action === "flag") changes.flagged = true;
    if (action === "unflag") changes.flagged = false;

    changes.lastUpdated = Utils_.nowISO();
    Utils_.updateRow(SHEET_NAMES.REPORTS, "reportId", reportId, changes);

    Blockchain_.appendBlock(reportId, `MODERATE:${action}`, moderatorId || "admin", {
      reason: reason || "",
      ...changes,
    });

    return Reports_.get(reportId);
  },

  /** Strip characters/patterns that could be used for spreadsheet formula injection */
  sanitize_(text) {
    let clean = String(text).trim();
    if (/^[=+\-@]/.test(clean)) clean = `'${clean}`; // neutralize leading formula chars
    return clean;
  },
};
