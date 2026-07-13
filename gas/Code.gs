/**
 * Code.gs
 * Entry points for the Apps Script Web App. All requests (GET and POST)
 * are routed through a single `action` dispatcher so the frontend only
 * needs to know one URL (CONFIG.API_URL in js/config.js).
 *
 * DEPLOY:
 *   Extensions > Apps Script > Deploy > New deployment > "Web app"
 *   Execute as: Me
 *   Who has access: Anyone
 *   Copy the resulting /exec URL into js/config.js -> CONFIG.API_URL
 */

/** Handles POST requests (used for all writes and most reads — see api.js) */
function doPost(e) {
  return handleRequest_(e);
}

/** Handles GET requests (used for simple read-only calls) */
function doGet(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  let action, params;

  try {
    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
      action = params.action;
    } else {
      params = e.parameter || {};
      action = params.action;
    }

    if (!action) throw new Error("Missing 'action' parameter.");

    const handlers = {
      createReport: () => Reports_.create(params.report),
      getReports: () => Reports_.list(params.filters || {}),
      getReport: () => Reports_.get(params.reportId),
      updateReport: () =>
        Reports_.update(params.reportId, params.changes, params.editorId, params.editorAlias),
      upvoteReport: () => Reports_.upvote(params.reportId, params.userId),
      uploadImageMeta: () => Reports_.attachImageMeta(params.reportId, params.imageMeta),
      moderateReport: () =>
        Reports_.moderate(params.reportId, params.moderatorId, params.action_, params.reason),

      submitRating: () => Ratings_.submit(params.reportId, params.userId, params.ratings),

      getDashboardStats: () => Dashboard_.getStats(),

      getAuditHistory: () => Blockchain_.getHistory(params.reportId),

      registerUser: () => Users_.register(params.user),

      getFacilities: () => Facilities_.list(),
      createFacility: () => Facilities_.create(params.facility),
      updateFacility: () =>
        Facilities_.update(params.facilityId, params.changes, params.editorId, params.editorAlias),
      upvoteFacility: () => Facilities_.upvote(params.facilityId, params.userId),
      moderateFacility: () =>
        Facilities_.moderate(params.facilityId, params.moderatorId, params.action_, params.reason),

      verifyAdminPin: () => Utils_.verifyAdminPin(params.pin),
    };

    // moderateReport/moderateFacility's action field collides with the
    // router's `action` key, so the frontend sends it as `action` too —
    // normalize here before dispatch.
    if ((action === "moderateReport" || action === "moderateFacility") && params.action) {
      params.action_ = params.action;
    }

    const handler = handlers[action];
    if (!handler) throw new Error(`Unknown action: ${action}`);

    const data = handler();
    return jsonResponse_({ data });
  } catch (err) {
    return jsonResponse_({ error: err.message || String(err) });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
