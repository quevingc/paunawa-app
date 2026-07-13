/**
 * map.js
 * Leaflet map: colored markers by type/status, clustering, heatmap overlay,
 * evacuation center / hospital layer, and manual location pin-drop for the
 * report form.
 */

const MapModule = {
  map: null,
  clusterGroup: null,
  heatLayer: null,
  facilitiesLayer: null,
  markersById: new Map(),
  pinMarker: null,
  pinMode: false,

  init(containerId = "map") {
    MapModule.map = L.map(containerId, {
      center: CONFIG.MAP.defaultCenter,
      zoom: CONFIG.MAP.defaultZoom,
      minZoom: CONFIG.MAP.minZoom,
      maxZoom: CONFIG.MAP.maxZoom,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(MapModule.map);

    L.tileLayer(CONFIG.MAP.tileLayer, {
      attribution: CONFIG.MAP.tileAttribution,
      maxZoom: CONFIG.MAP.maxZoom,
    }).addTo(MapModule.map);

    MapModule.clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    MapModule.map.addLayer(MapModule.clusterGroup);

    MapModule.facilitiesLayer = L.layerGroup().addTo(MapModule.map);

    // Try to center on the user's location on first load
    Utils.getCurrentPosition()
      .then(({ lat, lng }) => MapModule.map.setView([lat, lng], 12))
      .catch(() => {
        /* keep default center */
      });

    return MapModule.map;
  },

  /** Build a colored circular DivIcon for a report marker */
  buildIcon(type, status) {
    const typeInfo = CONFIG.EMERGENCY_TYPES[type] || CONFIG.EMERGENCY_TYPES.other;
    const statusInfo = CONFIG.STATUS[status] || CONFIG.STATUS.Active;
    return L.divIcon({
      className: "report-marker",
      html: `<div class="marker-pin" style="background:${typeInfo.color}; border-color:${statusInfo.color}">
               <span>${typeInfo.icon}</span>
             </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -30],
    });
  },

  /** Render/refresh all report markers on the map */
  renderReports(reports, onOpenReport) {
    MapModule.clusterGroup.clearLayers();
    MapModule.markersById.clear();

    reports.forEach((report) => {
      if (typeof report.lat !== "number" || typeof report.lng !== "number") return;
      const icon = MapModule.buildIcon(report.type, report.status);
      const marker = L.marker([report.lat, report.lng], { icon });
      const typeInfo = CONFIG.EMERGENCY_TYPES[report.type] || CONFIG.EMERGENCY_TYPES.other;

      marker.bindPopup(MapModule.buildPopupHTML(report, typeInfo));
      marker.on("click", () => {
        if (onOpenReport) onOpenReport(report.reportId);
      });

      MapModule.markersById.set(report.reportId, marker);
      MapModule.clusterGroup.addLayer(marker);
    });
  },

  buildPopupHTML(report, typeInfo) {
    const statusInfo = CONFIG.STATUS[report.status] || CONFIG.STATUS.Active;
    return `
      <div class="map-popup">
        <div class="map-popup-header">
          <span class="badge" style="background:${typeInfo.color}">${typeInfo.icon} ${typeInfo.label}</span>
          <span class="badge" style="background:${statusInfo.color}">${statusInfo.label}</span>
        </div>
        <p>${Utils.escapeHTML(report.description).slice(0, 140)}${report.description.length > 140 ? "…" : ""}</p>
        <small>${Utils.timeAgo(report.lastUpdated || report.timestamp)}</small>
        <br/><button class="btn-link" data-open-report="${report.reportId}">View full report →</button>
      </div>`;
  },

  focusReport(reportId) {
    const marker = MapModule.markersById.get(reportId);
    if (marker) {
      MapModule.map.setView(marker.getLatLng(), 15);
      MapModule.clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
    }
  },

  /** Toggle heatmap overlay derived from active report density */
  toggleHeatmap(reports, show) {
    if (MapModule.heatLayer) {
      MapModule.map.removeLayer(MapModule.heatLayer);
      MapModule.heatLayer = null;
    }
    if (show) {
      const points = reports
        .filter((r) => typeof r.lat === "number")
        .map((r) => [r.lat, r.lng, r.status === "Active" ? 1 : 0.4]);
      MapModule.heatLayer = L.heatLayer(points, { radius: 30, blur: 20, maxZoom: 12 });
      MapModule.heatLayer.addTo(MapModule.map);
    }
  },

  /** Render evacuation centers / hospitals / community safe points */
  renderFacilities(facilities, onOpenFacility) {
    MapModule.facilitiesLayer.clearLayers();
    facilities.forEach((f) => {
      const info = CONFIG.FACILITIES[f.type] || CONFIG.FACILITIES.evacuation;
      const icon = L.divIcon({
        className: "facility-marker",
        html: `<div class="marker-pin facility" style="background:${info.color}"><span>${info.icon}</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      const marker = L.marker([f.lat, f.lng], { icon }).bindPopup(
        `<div class="map-popup">
           <strong>${info.icon} ${Utils.escapeHTML(f.name)}</strong><br/>${info.label}${
          f.capacity ? `<br/>Capacity: ${f.capacity}` : ""
        }${f.contact ? `<br/>Contact: ${Utils.escapeHTML(f.contact)}` : ""}
           <br/><button class="btn-link" data-open-facility="${f.facilityId}">View details →</button>
         </div>`
      );
      marker.on("click", () => {
        if (onOpenFacility) onOpenFacility(f.facilityId);
      });
      MapModule.facilitiesLayer.addLayer(marker);
    });
  },

  /** Enable manual pin-drop mode for the report form; resolves with {lat,lng} */
  enablePinDrop(existingLatLng) {
    MapModule.pinMode = true;
    if (MapModule.pinMarker) {
      MapModule.map.removeLayer(MapModule.pinMarker);
      MapModule.pinMarker = null;
    }
    if (existingLatLng) {
      MapModule.pinMarker = L.marker(existingLatLng, { draggable: true }).addTo(MapModule.map);
    }
    return new Promise((resolve) => {
      const handler = (e) => {
        if (!MapModule.pinMode) return;
        if (MapModule.pinMarker) MapModule.map.removeLayer(MapModule.pinMarker);
        MapModule.pinMarker = L.marker(e.latlng, { draggable: true }).addTo(MapModule.map);
        MapModule.pinMarker.on("dragend", () => {
          const ll = MapModule.pinMarker.getLatLng();
          resolve({ lat: ll.lat, lng: ll.lng });
        });
        resolve({ lat: e.latlng.lat, lng: e.latlng.lng });
      };
      MapModule.map.once("click", handler);
    });
  },

  disablePinDrop() {
    MapModule.pinMode = false;
  },

  /** Find the nearest safe facility to a given point (simple straight-line routing) */
  findNearestFacility(lat, lng, facilities) {
    let nearest = null;
    let minDist = Infinity;
    facilities.forEach((f) => {
      const d = Utils.distanceKm(lat, lng, f.lat, f.lng);
      if (d < minDist) {
        minDist = d;
        nearest = f;
      }
    });
    return nearest ? { facility: nearest, distanceKm: minDist } : null;
  },

  /** Draw a simple straight-line route (safe-zone routing) from origin to a facility */
  drawRoute(origin, destination) {
    if (MapModule.routeLine) MapModule.map.removeLayer(MapModule.routeLine);
    MapModule.routeLine = L.polyline([origin, [destination.lat, destination.lng]], {
      color: "#2E7D32",
      weight: 4,
      dashArray: "8 6",
    }).addTo(MapModule.map);
    MapModule.map.fitBounds(MapModule.routeLine.getBounds(), { padding: [40, 40] });
  },
};
