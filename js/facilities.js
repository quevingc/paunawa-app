/**
 * facilities.js
 * Public submission, editing, and community verification for facilities
 * (evacuation centers, hospitals, community safe points). Mirrors
 * reports.js so facilities get the same treatment: GPS/pin location,
 * photos, editing with version history, upvotes, and the hash-chain
 * audit trail (via the generic Blockchain_ ledger keyed by facilityId).
 */

const Facilities = {
  all: [],
  currentImages: [],
  editingFacilityId: null,

  async loadAll() {
    try {
      const data = await Api.getFacilities();
      Facilities.all = data || [];
    } catch (e) {
      console.warn("Could not load facilities:", e.message);
      Facilities.all = [];
    }
    return Facilities.all;
  },

  /** Same-type facilities very close together within the duplicate radius */
  findPossibleDuplicates(newFacility) {
    return Facilities.all.filter((f) => {
      if (f.type !== newFacility.type) return false;
      const distM = Utils.distanceKm(f.lat, f.lng, newFacility.lat, newFacility.lng) * 1000;
      return distM <= CONFIG.DUPLICATE_RADIUS_METERS;
    });
  },

  /** Simple confidence score from community upvotes (facilities have no ratings) */
  computeConfidenceScore(facility) {
    return Math.min(100, Math.round((facility.upvotes || 0) * 10));
  },

  async submit(formData) {
    if (Utils.isOnCooldown()) {
      throw new Error("Please wait a moment before submitting another entry.");
    }
    if (Utils.looksLikeSpam(formData.description || "")) {
      throw new Error("This entry looks like spam. Please provide genuine details.");
    }
    const { valid, errors } = Utils.validateFacility(formData);
    if (!valid) throw new Error(errors.join(" "));

    const facility = {
      facilityId: Utils.generateId("FAC"),
      timestamp: Utils.nowISO(),
      lastUpdated: Utils.nowISO(),
      name: formData.name.trim(),
      type: formData.type,
      lat: formData.lat,
      lng: formData.lng,
      capacity: formData.capacity || "",
      contact: formData.contact || "",
      description: (formData.description || "").trim(),
      images: formData.images || [],
      submittedBy: formData.submittedBy || "Anonymous",
      editorId: Utils.getDeviceId(),
    };

    Utils.markSubmitted();
    const saved = await Api.createFacility(facility);
    return saved || facility;
  },

  async update(facilityId, changes) {
    const editorId = Utils.getDeviceId();
    const editorAlias = "Community Editor";
    return Api.updateFacility(facilityId, changes, editorId, editorAlias);
  },

  async upvote(facilityId) {
    const userId = Utils.getDeviceId();
    const voteKey = `ca_voted_facility_${facilityId}`;
    if (localStorage.getItem(voteKey)) {
      throw new Error("You already verified this facility.");
    }
    const result = await Api.upvoteFacility(facilityId, userId);
    localStorage.setItem(voteKey, "1");
    return result;
  },

  async getHistory(facilityId) {
    return Api.getAuditHistory(facilityId);
  },
};
