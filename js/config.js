/**
 * config.js
 * Central configuration for the Paunawa app.
 * Replace SUPABASE_URL / SUPABASE_ANON_KEY with your Supabase project's
 * values (Project → Settings → API).
 */

const CONFIG = {
  // ⚠️ REPLACE THESE with your Supabase project's URL and anon (public) key
  SUPABASE_URL: "https://wayjulzryjhxmtuceyrm.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndheWp1bHpyeWpoeG10dWNleXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODI2MzUsImV4cCI6MjA5OTQ1ODYzNX0.XGlxnzkLyszlJ9UFlEG-6M1ks-pNTbcIOealEHMvIpY",
  STORAGE_BUCKET: "report-images",

  APP_NAME: "Paunawa",
  APP_VERSION: "1.0.0",

  // Map defaults
  MAP: {
    defaultCenter: [14.5995, 120.9842], // Manila fallback center - change as needed
    defaultZoom: 6,
    minZoom: 2,
    maxZoom: 19,
    tileLayer: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    nearbyRadiusKm: 10, // radius used for "nearby incident" notifications
  },

  // Emergency types with color coding + icons
  EMERGENCY_TYPES: {
    flood: { label: "Flash Flood", color: "#1E88E5", icon: "🌊" },
    earthquake: { label: "Earthquake", color: "#8D6E63", icon: "🌐" },
    conflict: { label: "Armed Conflict", color: "#6A1B9A", icon: "⚠️" },
    fire: { label: "Fire", color: "#E53935", icon: "🔥" },
    landslide: { label: "Landslide", color: "#6D4C41", icon: "⛰️" },
    storm: { label: "Storm/Typhoon", color: "#00897B", icon: "🌀" },
    other: { label: "Other Hazard", color: "#757575", icon: "❗" },
  },

  // Status color coding
  STATUS: {
    Active: { color: "#E53935", label: "Active" },
    Monitoring: { color: "#FB8C00", label: "Monitoring" },
    Resolved: { color: "#43A047", label: "Resolved" },
  },

  // Facility marker types
  FACILITIES: {
    evacuation: { label: "Evacuation Center", color: "#2E7D32", icon: "🏠" },
    hospital: { label: "Hospital", color: "#C62828", icon: "🏥" },
    other: { label: "Community Safe Point", color: "#455A64", icon: "📍" },
  },

  // Pagination / limits
  REPORTS_PAGE_SIZE: 25,
  MAX_IMAGES_PER_REPORT: 5,
  MAX_IMAGE_SIZE_MB: 3,

  // Spam / validation
  MIN_DESCRIPTION_LENGTH: 10,
  MAX_DESCRIPTION_LENGTH: 1000,
  SUBMISSION_COOLDOWN_SECONDS: 30, // client-side throttle between submissions
  DUPLICATE_RADIUS_METERS: 300, // distance considered for duplicate detection
  DUPLICATE_TIME_WINDOW_MINUTES: 60,

  // Offline queue
  OFFLINE_DB_NAME: "paunawa-offline",
  OFFLINE_STORE_NAME: "pending-reports",

  // Supported languages
  LANGUAGES: ["en", "es", "fr", "ar", "tl"],
  DEFAULT_LANGUAGE: "en",
};

// Freeze to avoid accidental mutation
Object.freeze(CONFIG.EMERGENCY_TYPES);
Object.freeze(CONFIG.STATUS);
Object.freeze(CONFIG.FACILITIES);
