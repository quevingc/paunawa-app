/**
 * Facilities.gs
 * Public directory of evacuation centers, hospitals, and community safe
 * points. Anyone can add or edit an entry — same treatment as Reports:
 * GPS/pin location, photos, editing with version history, community
 * upvotes, and a hash-chain audit trail block per action.
 *
 * Note: the Images and Updates sheets use a generic "reportId" column as
 * their foreign key. For facilities we simply store the facilityId in
 * that same column — it's just a parent-record key, not report-specific.
 * Same for the Blockchain sheet's "reportId" column.
 */

const Facilities_ = {
  list() {
    const images = Utils_.getAllRows(SHEET_NAMES.IMAGES);
    return Utils_.getAllRows(SHEET_NAMES.FACILITIES)
      .filter((f) => !f.hidden)
      .map((f) => ({
        ...f,
        lat: Number(f.lat),
        lng: Number(f.lng),
        upvotes: Number(f.upvotes) || 0,
        images: images.filter((i) => i.reportId === f.facilityId).map((i) => i.base64OrUrl),
      }));
  },

  get(facilityId) {
    const row = Utils_.getRowObject(SHEET_NAMES.FACILITIES, "facilityId", facilityId);
    if (!row) return null;
    const images = Utils_.getAllRows(SHEET_NAMES.IMAGES).filter((i) => i.reportId === facilityId);
    return {
      ...row,
      lat: Number(row.lat),
      lng: Number(row.lng),
      upvotes: Number(row.upvotes) || 0,
      images: images.map((i) => i.base64OrUrl),
    };
  },

  create(facility) {
    if (!facility || !facility.name || !facility.type) {
      throw new Error("Missing required facility fields.");
    }

    const facilityId = facility.facilityId || Utils_.generateId("FAC");
    const now = Utils_.nowISO();

    const row = {
      facilityId,
      name: Reports_.sanitize_(facility.name),
      type: facility.type,
      lat: facility.lat,
      lng: facility.lng,
      capacity: facility.capacity || "",
      contact: facility.contact || "",
      description: facility.description ? Reports_.sanitize_(facility.description) : "",
      submittedBy: facility.submittedBy || "Anonymous",
      editorId: facility.editorId || "anonymous",
      upvotes: 0,
      flagged: false,
      hidden: false,
      imageCount: (facility.images || []).length,
      timestamp: now,
      lastUpdated: now,
    };

    Utils_.appendRow(SHEET_NAMES.FACILITIES, row);

    (facility.images || []).slice(0, 5).forEach((img, i) => {
      Utils_.appendRow(SHEET_NAMES.IMAGES, {
        imageId: Utils_.generateId("IMG"),
        reportId: facilityId,
        uploadedAt: now,
        base64OrUrl: img,
        caption: `photo-${i + 1}`,
      });
    });

    Blockchain_.appendBlock(facilityId, "CREATE_FACILITY", row.editorId, {
      name: row.name,
      type: row.type,
      lat: row.lat,
      lng: row.lng,
    });

    return Facilities_.get(facilityId);
  },

  update(facilityId, changes, editorId, editorAlias) {
    const existing = Utils_.getRowObject(SHEET_NAMES.FACILITIES, "facilityId", facilityId);
    if (!existing) throw new Error("Facility not found.");

    const allowedFields = ["name", "type", "capacity", "contact", "description", "lat", "lng"];
    const applied = {};
    allowedFields.forEach((f) => {
      if (changes[f] !== undefined && changes[f] !== existing[f]) {
        const value = f === "name" || f === "description" ? Reports_.sanitize_(changes[f]) : changes[f];
        applied[f] = value;
        Utils_.appendRow(SHEET_NAMES.UPDATES, {
          updateId: Utils_.generateId("UPD"),
          reportId: facilityId,
          timestamp: Utils_.nowISO(),
          editorId: editorId || "anonymous",
          editorAlias: editorAlias || "Anonymous",
          fieldChanged: f,
          oldValue: existing[f],
          newValue: changes[f],
        });
      }
    });

    applied.lastUpdated = Utils_.nowISO();
    Utils_.updateRow(SHEET_NAMES.FACILITIES, "facilityId", facilityId, applied);

    if (Array.isArray(changes.images)) {
      const imgSheet = Utils_.sheet(SHEET_NAMES.IMAGES);
      const values = imgSheet.getDataRange().getValues();
      const headers = values[0];
      const keyCol = headers.indexOf("reportId");
      for (let i = values.length - 1; i >= 1; i--) {
        if (values[i][keyCol] === facilityId) imgSheet.deleteRow(i + 1);
      }
      changes.images.slice(0, 5).forEach((img, i) => {
        Utils_.appendRow(SHEET_NAMES.IMAGES, {
          imageId: Utils_.generateId("IMG"),
          reportId: facilityId,
          uploadedAt: Utils_.nowISO(),
          base64OrUrl: img,
          caption: `photo-${i + 1}`,
        });
      });
      Utils_.updateRow(SHEET_NAMES.FACILITIES, "facilityId", facilityId, { imageCount: changes.images.length });
    }

    Blockchain_.appendBlock(facilityId, "UPDATE_FACILITY", editorId || "anonymous", applied);

    return Facilities_.get(facilityId);
  },

  upvote(facilityId, userId) {
    const existing = Utils_.getRowObject(SHEET_NAMES.FACILITIES, "facilityId", facilityId);
    if (!existing) throw new Error("Facility not found.");
    const newCount = (Number(existing.upvotes) || 0) + 1;
    Utils_.updateRow(SHEET_NAMES.FACILITIES, "facilityId", facilityId, { upvotes: newCount });
    Blockchain_.appendBlock(facilityId, "UPVOTE_FACILITY", userId || "anonymous", { upvotes: newCount });
    return { upvotes: newCount };
  },

  /** Admin moderation: hide / unhide / flag / unflag a facility */
  moderate(facilityId, moderatorId, action, reason) {
    const existing = Utils_.getRowObject(SHEET_NAMES.FACILITIES, "facilityId", facilityId);
    if (!existing) throw new Error("Facility not found.");

    const changes = {};
    if (action === "hide") changes.hidden = true;
    if (action === "unhide") changes.hidden = false;
    if (action === "flag") changes.flagged = true;
    if (action === "unflag") changes.flagged = false;

    changes.lastUpdated = Utils_.nowISO();
    Utils_.updateRow(SHEET_NAMES.FACILITIES, "facilityId", facilityId, changes);

    Blockchain_.appendBlock(facilityId, `MODERATE_FACILITY:${action}`, moderatorId || "admin", {
      reason: reason || "",
      ...changes,
    });

    return Facilities_.get(facilityId);
  },
};
