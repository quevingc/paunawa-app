/**
 * placesSearch.js
 * Free place search for the Add Facility form, backed by OpenStreetMap's
 * Nominatim (free-text search) and Overpass (category / "nearby X")
 * APIs — no API key, no billing, and consistent with the Leaflet/OSM map
 * already used elsewhere in this app.
 *
 * Usage-policy notes (please respect these if you extend this module):
 * - Nominatim: max ~1 request/second, and no autocomplete-per-keystroke —
 *   this module only searches on an explicit submit (Enter key or button
 *   click), never on every keystroke.
 * - Overpass: reasonable, occasional use only — category searches here
 *   are user-triggered (clicking a chip), not automatic/background.
 * - Both are free community infrastructure, not commercial APIs. For a
 *   high-traffic production deployment, self-host Nominatim/Overpass or
 *   switch to a paid provider (e.g. Google Places, Mapbox) instead.
 */

const PlacesSearch = {
  NOMINATIM_URL: "https://nominatim.openstreetmap.org/search",
  OVERPASS_URL: "https://overpass-api.de/api/interpreter",

  /** Free-text search (e.g. "Philippine General Hospital"), optionally biased near a point */
  async searchText(query, biasLatLng) {
    if (!query || query.trim().length < 2) return [];
    const params = new URLSearchParams({
      q: query.trim(),
      format: "jsonv2",
      addressdetails: "1",
      limit: "8",
    });
    if (biasLatLng) {
      const { lat, lng } = biasLatLng;
      const delta = 0.6; // ~65km soft bounding box — biases results, doesn't hard-filter them
      params.set("viewbox", `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`);
      params.set("bounded", "0");
    }
    const res = await fetch(`${PlacesSearch.NOMINATIM_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Place search failed. Please try again.");
    const data = await res.json();
    return data.map(PlacesSearch._mapNominatimResult);
  },

  /** Category search ("nearby hospitals/schools/malls") within a radius of a point */
  async searchCategory(category, centerLatLng, radiusKm = 5) {
    const tagFilters = {
      hospital: '["amenity"="hospital"]',
      school: '["amenity"="school"]',
      mall: '["shop"="mall"]',
      evacuation: '["amenity"="community_centre"]',
    };
    const tagFilter = tagFilters[category];
    if (!tagFilter) throw new Error("Unknown category: " + category);
    if (!centerLatLng) throw new Error("No location available to search near.");

    const { lat, lng } = centerLatLng;
    const radiusM = Math.round(radiusKm * 1000);
    const query = `
      [out:json][timeout:15];
      (
        node${tagFilter}(around:${radiusM},${lat},${lng});
        way${tagFilter}(around:${radiusM},${lat},${lng});
      );
      out center 15;
    `;
    const res = await fetch(PlacesSearch.OVERPASS_URL, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    });
    if (!res.ok) throw new Error("Nearby search failed. Please try again.");
    const data = await res.json();
    return (data.elements || [])
      .map((el) => PlacesSearch._mapOverpassResult(el, category))
      .filter((r) => r.name && r.lat && r.lng);
  },

  _mapNominatimResult(item) {
    return {
      name: item.name || (item.display_name || "").split(",")[0],
      displayAddress: item.display_name || "",
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      suggestedType: PlacesSearch._guessType(item.type, item.class, item.name),
      contact: "",
    };
  },

  _mapOverpassResult(el, category) {
    const tags = el.tags || {};
    const lat = el.lat || (el.center && el.center.lat);
    const lng = el.lon || (el.center && el.center.lon);
    return {
      name: tags.name || "",
      displayAddress: [tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", "),
      lat,
      lng,
      suggestedType: category === "hospital" ? "hospital" : category === "evacuation" ? "evacuation" : "other",
      contact: tags.phone || tags["contact:phone"] || "",
    };
  },

  _guessType(osmType, osmClass, name = "") {
    const n = (name || "").toLowerCase();
    if (osmType === "hospital" || osmClass === "hospital" || n.includes("hospital")) return "hospital";
    if (osmType === "community_centre" || osmType === "school" || n.includes("school") || n.includes("barangay hall")) {
      return "evacuation";
    }
    return "other";
  },
};