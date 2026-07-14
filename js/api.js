/**
 * api.js
 * Talks to Supabase instead of a Google Apps Script Web App. Every method
 * name and signature matches the old Apps Script version, so the rest of
 * the app (reports.js, facilities.js, app.js, dashboard.js, sos.js,
 * offline.js) needed zero changes when the backend was swapped.
 *
 * Reads go straight to Postgres tables (allowed by Row Level Security for
 * non-hidden rows). Writes go through SECURITY DEFINER RPC functions
 * (see supabase/functions.sql) so the audit-trail/hash-chain logic always
 * runs server-side, the same way only Code.gs could write before.
 */

function requireClient_() {
  if (!SupabaseClient) {
    throw new Error(
      "Supabase is not configured yet. Set CONFIG.SUPABASE_URL and CONFIG.SUPABASE_ANON_KEY in js/config.js."
    );
  }
  return SupabaseClient;
}

/** Upload any base64 data-URL images to Storage and return their public URLs.
 * URLs already present (e.g. unchanged images when editing) pass through as-is. */
async function uploadImages_(images) {
  if (!images || images.length === 0) return [];
  const sb = requireClient_();
  const urls = [];
  for (const item of images) {
    if (/^https?:\/\//.test(item)) {
      urls.push(item); // already a Storage URL — keep as-is
      continue;
    }
    const blob = await (await fetch(item)).blob();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `${Utils.generateId("img").toLowerCase()}.${ext}`;
    const { error: uploadError } = await sb.storage
      .from(CONFIG.STORAGE_BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (uploadError) throw new Error("Image upload failed: " + uploadError.message);
    const { data } = sb.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

/** Attach each record's images (fetched in one batched query) by its id field */
async function attachImages_(rows, idField) {
  if (!rows || rows.length === 0) return [];
  const sb = requireClient_();
  const ids = rows.map((r) => r[idField]);
  const { data: imgs, error } = await sb.from("images").select("record_id,url").in("record_id", ids);
  if (error) throw new Error(error.message);
  const byId = {};
  (imgs || []).forEach((i) => {
    (byId[i.record_id] = byId[i.record_id] || []).push(i.url);
  });
  return rows.map((r) => ({ ...r, images: byId[r[idField]] || [] }));
}

function mapReport_(row) {
  if (!row) return row;
  return {
    reportId: row.report_id,
    timestamp: row.timestamp,
    lastUpdated: row.last_updated,
    type: row.type,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    description: row.description,
    reporterAlias: row.reporter_alias,
    editorId: row.editor_id,
    upvotes: row.upvotes,
    avgAccuracy: row.avg_accuracy,
    avgAuthenticity: row.avg_authenticity,
    avgUsefulness: row.avg_usefulness,
    flagged: row.flagged,
    hidden: row.hidden,
    imageCount: row.image_count,
    images: row.images || [],
  };
}

function mapFacility_(row) {
  if (!row) return row;
  return {
    facilityId: row.facility_id,
    name: row.name,
    type: row.type,
    lat: row.lat,
    lng: row.lng,
    capacity: row.capacity,
    contact: row.contact,
    description: row.description,
    submittedBy: row.submitted_by,
    editorId: row.editor_id,
    upvotes: row.upvotes,
    flagged: row.flagged,
    hidden: row.hidden,
    imageCount: row.image_count,
    timestamp: row.timestamp,
    lastUpdated: row.last_updated,
    images: row.images || [],
  };
}

const Api = {
  // ---- Reports ----
  async createReport(report) {
    const sb = requireClient_();
    const images = await uploadImages_(report.images);
    const { data, error } = await sb.rpc("create_report", { p_report: { ...report, images } });
    if (error) throw new Error(error.message);
    return mapReport_({ ...data, images });
  },

  async getReports(filters = {}) {
    const sb = requireClient_();
    let query = sb.from("reports").select("*").eq("hidden", false).order("id", { ascending: false });
    if (filters.type) query = query.eq("type", filters.type);
    if (filters.status) query = query.eq("status", filters.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const withImages = await attachImages_(data, "report_id");
    return withImages.map(mapReport_);
  },

  async getReport(reportId) {
    const sb = requireClient_();
    const { data, error } = await sb.from("reports").select("*").eq("report_id", reportId).single();
    if (error) throw new Error(error.message);
    const [withImages] = await attachImages_([data], "report_id");
    return mapReport_(withImages);
  },

  async updateReport(reportId, changes, editorId, editorAlias) {
    const sb = requireClient_();
    const changesCopy = { ...changes };
    if (Array.isArray(changesCopy.images)) {
      changesCopy.images = await uploadImages_(changesCopy.images);
    }
    const { data, error } = await sb.rpc("update_report", {
      p_report_id: reportId,
      p_changes: changesCopy,
      p_editor_id: editorId,
      p_editor_alias: editorAlias,
    });
    if (error) throw new Error(error.message);
    const [withImages] = await attachImages_([data], "report_id");
    return mapReport_(withImages);
  },

  async upvoteReport(reportId, userId) {
    const sb = requireClient_();
    const { data, error } = await sb.rpc("upvote_report", { p_report_id: reportId, p_user_id: userId });
    if (error) throw new Error(error.message);
    return data;
  },

  async uploadImageMeta() {
    // Not used by the current UI (images attach via createReport/updateReport).
    // Left as a clear stub rather than silently no-op-ing.
    throw new Error("uploadImageMeta is not supported directly — attach images via createReport/updateReport.");
  },

  async moderateReport(reportId, moderatorId, action, reason) {
    const sb = requireClient_();
    const { data, error } = await sb.rpc("moderate_report", {
      p_report_id: reportId,
      p_moderator_id: moderatorId,
      p_action: action,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    const [withImages] = await attachImages_([data], "report_id");
    return mapReport_(withImages);
  },

  // ---- Ratings ----
  async submitRating(reportId, userId, ratings) {
    const sb = requireClient_();
    const { data, error } = await sb.rpc("submit_rating", { p_report_id: reportId, p_user_id: userId, p_ratings: ratings });
    if (error) throw new Error(error.message);
    return data;
  },

  // ---- Dashboard ----
  async getDashboardStats() {
    const sb = requireClient_();
    const { data, error } = await sb.rpc("get_dashboard_stats");
    if (error) throw new Error(error.message);
    return data;
  },

  // ---- Audit trail ----
  async getAuditHistory(recordId) {
    const sb = requireClient_();
    const { data, error } = await sb
      .from("blockchain")
      .select("block_id,record_id,action,editor_id,timestamp,previous_hash,current_hash,payload_snapshot")
      .eq("record_id", recordId)
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((b) => ({
      blockId: b.block_id,
      reportId: b.record_id,
      action: b.action,
      editorId: b.editor_id,
      timestamp: b.timestamp,
      previousHash: b.previous_hash,
      currentHash: b.current_hash,
      // Raw stored string — deliberately NOT JSON.parsed, so client-side
      // hash re-verification in blockchain.js hashes the exact same bytes
      // that were hashed server-side. See supabase/functions.sql _append_block().
      payload: b.payload_snapshot,
    }));
  },

  // ---- Users ----
  async registerUser(user) {
    const sb = requireClient_();
    const { data, error } = await sb.rpc("register_user", { p_user: user });
    if (error) throw new Error(error.message);
    return data;
  },

  // ---- Facilities ----
  async getFacilities() {
    const sb = requireClient_();
    const { data, error } = await sb.from("facilities").select("*").eq("hidden", false).order("id", { ascending: false });
    if (error) throw new Error(error.message);
    const withImages = await attachImages_(data, "facility_id");
    return withImages.map(mapFacility_);
  },

  async createFacility(facility) {
    const sb = requireClient_();
    const images = await uploadImages_(facility.images);
    const { data, error } = await sb.rpc("create_facility", { p_facility: { ...facility, images } });
    if (error) throw new Error(error.message);
    return mapFacility_({ ...data, images });
  },

  async updateFacility(facilityId, changes, editorId, editorAlias) {
    const sb = requireClient_();
    const changesCopy = { ...changes };
    if (Array.isArray(changesCopy.images)) {
      changesCopy.images = await uploadImages_(changesCopy.images);
    }
    const { data, error } = await sb.rpc("update_facility", {
      p_facility_id: facilityId,
      p_changes: changesCopy,
      p_editor_id: editorId,
      p_editor_alias: editorAlias,
    });
    if (error) throw new Error(error.message);
    const [withImages] = await attachImages_([data], "facility_id");
    return mapFacility_(withImages);
  },

  async upvoteFacility(facilityId, userId) {
    const sb = requireClient_();
    const { data, error } = await sb.rpc("upvote_facility", { p_facility_id: facilityId, p_user_id: userId });
    if (error) throw new Error(error.message);
    return data;
  },

  async moderateFacility(facilityId, moderatorId, action, reason) {
    const sb = requireClient_();
    const { data, error } = await sb.rpc("moderate_facility", {
      p_facility_id: facilityId,
      p_moderator_id: moderatorId,
      p_action: action,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    const [withImages] = await attachImages_([data], "facility_id");
    return mapFacility_(withImages);
  },

  // ---- Admin ----
  async verifyAdminPin(pin) {
    const sb = requireClient_();
    const { data, error } = await sb.rpc("verify_admin_pin", { p_pin: pin });
    if (error) throw new Error(error.message);
    return data;
  },

  // ---- Real-time (replaces 30-second polling) ----
  /** Subscribe to live inserts/updates on reports & facilities. Returns the channel (call .unsubscribe() to stop).
   * onStatus, if given, is called with Supabase's channel status string
   * ("SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") so the UI
   * can reflect the real connection state instead of assuming it worked. */
  subscribeToChanges(onChange, onStatus) {
    const sb = requireClient_();
    return sb
      .channel("public-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "facilities" }, onChange)
      .subscribe((status) => {
        if (onStatus) onStatus(status);
      });
  },
};