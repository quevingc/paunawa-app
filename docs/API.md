# API Reference (Legacy — Google Apps Script)

> ⚠️ **This backend is no longer the recommended path.** Paunawa now uses
> Supabase — the current backend's functions are documented via comments
> directly in `supabase/functions.sql`, and are called through the
> Supabase JS client in `js/api.js` rather than a single REST endpoint.
> This document describes the old Apps Script API for reference only.

All requests go to a single Apps Script Web App URL (`CONFIG.API_URL`).
Requests are POSTed as `Content-Type: text/plain` with a JSON body containing
an `action` field (this avoids CORS preflight issues specific to Apps Script).
A subset of read actions also work via GET query params.

**Response shape (always JSON):**
```json
{ "data": { ... } }
```
or on error:
```json
{ "error": "message" }
```

## Reports

### `createReport`
```json
{ "action": "createReport", "report": {
  "type": "flood", "description": "...", "lat": 14.6, "lng": 121.0,
  "reporterAlias": "Maria", "images": ["data:image/jpeg;base64,..."],
  "editorId": "device-uuid"
}}
```
Returns the created report object (includes generated `reportId`).

### `getReports`
```json
{ "action": "getReports", "filters": { "type": "flood", "status": "Active" } }
```
Returns an array of non-hidden report objects (filters optional).

### `getReport`
```json
{ "action": "getReport", "reportId": "RPT-..." }
```

### `updateReport`
```json
{ "action": "updateReport", "reportId": "RPT-...", "editorId": "...", "editorAlias": "...",
  "changes": { "description": "...", "status": "Monitoring", "lat": 14.6, "lng": 121.0, "images": [...] } }
```
Logs a field-level entry per changed field in `Updates`, plus one
`UPDATE` block in the audit trail.

### `upvoteReport`
```json
{ "action": "upvoteReport", "reportId": "RPT-...", "userId": "device-uuid" }
```

### `uploadImageMeta`
```json
{ "action": "uploadImageMeta", "reportId": "RPT-...", "imageMeta": { "data": "data:image/...", "caption": "" } }
```

### `moderateReport` (admin)
```json
{ "action": "moderateReport", "reportId": "RPT-...", "moderatorId": "admin",
  "action": "hide|unhide|resolve|flag|unflag", "reason": "...", "pin": "admin-pin" }
```
The `pin` is required and re-verified server-side (bcrypt) by `moderate_report()`;
calls with a missing/wrong PIN are rejected with `Unauthorized`.

## Ratings

### `submitRating`
```json
{ "action": "submitRating", "reportId": "RPT-...", "userId": "device-uuid",
  "ratings": { "accuracy": 4, "authenticity": 5, "usefulness": 3 } }
```

## Dashboard

### `getDashboardStats`
```json
{ "action": "getDashboardStats" }
```
Returns `{ totalReports, byType, byStatus, mostVerified, mostRecent, generatedAt }`.

## Audit trail

### `getAuditHistory`
```json
{ "action": "getAuditHistory", "reportId": "RPT-..." }
```
Returns the full ordered hash-chain block list for a report:
`[{ blockId, action, editorId, timestamp, previousHash, currentHash, payload }, ...]`

## Users

### `registerUser`
```json
{ "action": "registerUser", "user": { "userId": "device-uuid", "alias": "Maria" } }
```

## Facilities

Public-editable directory of evacuation centers, hospitals, and community
safe points — anyone can add or edit an entry, with the same treatment as
reports (location, photos, version history, upvotes, audit trail).

### `getFacilities`
```json
{ "action": "getFacilities" }
```
Returns non-hidden facilities:
`[{ facilityId, name, type, lat, lng, capacity, contact, description, submittedBy, upvotes, images, timestamp, lastUpdated }]`

### `createFacility`
```json
{ "action": "createFacility", "facility": {
  "name": "Barangay Hall Evacuation Center", "type": "evacuation",
  "lat": 14.6, "lng": 121.0, "capacity": "300 people",
  "contact": "+63-...", "description": "...", "images": ["data:image/..."],
  "submittedBy": "Maria", "editorId": "device-uuid"
}}
```

### `updateFacility`
```json
{ "action": "updateFacility", "facilityId": "FAC-...", "editorId": "...", "editorAlias": "...",
  "changes": { "name": "...", "capacity": "...", "contact": "...", "description": "...", "lat": 14.6, "lng": 121.0, "images": [...] } }
```
Logs a field-level entry per changed field in `Updates`, plus one
`UPDATE_FACILITY` block in the audit trail.

### `upvoteFacility`
```json
{ "action": "upvoteFacility", "facilityId": "FAC-...", "userId": "device-uuid" }
```

### `moderateFacility` (admin)
```json
{ "action": "moderateFacility", "facilityId": "FAC-...", "moderatorId": "admin",
  "action": "hide|unhide|flag|unflag", "reason": "...", "pin": "admin-pin" }
```
`pin` is required and re-verified server-side by `moderate_facility()`.

Audit history for a facility uses the same endpoint as reports —
`getAuditHistory` with the `facilityId` passed as `reportId`:
```json
{ "action": "getAuditHistory", "reportId": "FAC-..." }
```

## Admin auth

### `verifyAdminPin`
```json
{ "action": "verifyAdminPin", "pin": "1234" }
```
Returns `{ valid: true|false }`. Compares the PIN against the **bcrypt hash** in
`settings.adminPin` (via pgcrypto `crypt()`), so the stored value is never the
plaintext PIN. This gate is UI-only; the `moderate_*` RPCs enforce the PIN too.
