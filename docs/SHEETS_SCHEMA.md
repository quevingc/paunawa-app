# Google Sheets Schema (Legacy)

> ⚠️ **This backend is no longer the recommended path.** Paunawa now uses
> Supabase — the current schema is defined in `supabase/schema.sql`
> (plain SQL `create table` statements, easier to read than this doc).
> This document describes the old Sheets structure for reference only.

Created automatically by `gas/Setup.gs` → `setupSpreadsheet()`. Each sheet
tab's first row is a frozen header row matching the columns below.

## Reports
| Column | Type | Notes |
|---|---|---|
| reportId | string | Primary key, e.g. `RPT-A1B2C3D4` |
| timestamp | ISO datetime | When first reported |
| lastUpdated | ISO datetime | Bumped on every edit |
| type | enum | flood, earthquake, conflict, fire, landslide, storm, other |
| status | enum | Active, Monitoring, Resolved |
| lat, lng | number | Decimal degrees |
| description | string | Sanitized against formula injection |
| reporterAlias | string | Optional, defaults to "Anonymous" |
| editorId | string | Anonymous device UUID of original reporter |
| upvotes | number | Community verification count |
| avgAccuracy, avgAuthenticity, avgUsefulness | number (1–5) | Denormalized rating averages |
| flagged | boolean | Set by moderation |
| hidden | boolean | Hidden reports are excluded from `getReports` |
| imageCount | number | Count of attached images |

## Updates
Field-level version history — one row per changed field per edit.
| Column | Notes |
|---|---|
| updateId | Primary key |
| reportId | Foreign key → Reports.reportId **or** Facilities.facilityId (generic) |
| timestamp | When the change was made |
| editorId, editorAlias | Who made the change |
| fieldChanged | e.g. `status`, `description`, `lat` |
| oldValue, newValue | Before/after values |

## Ratings
| Column | Notes |
|---|---|
| ratingId | Primary key |
| reportId | Foreign key → Reports |
| userId | Anonymous device UUID |
| accuracy, authenticity, usefulness | 1–5 |
| timestamp | |

## Users
| Column | Notes |
|---|---|
| userId | Primary key (anonymous device UUID) |
| alias | Display name, optional |
| createdAt | |
| role | `reporter` or `admin` (informational only — auth is PIN-based) |
| reportsSubmitted | Running count |

## Blockchain
The hash-chain audit ledger. One row = one immutable block.
| Column | Notes |
|---|---|
| blockId | Primary key |
| reportId | Foreign key → Reports.reportId **or** Facilities.facilityId (generic) |
| action | CREATE, UPDATE, UPVOTE, RATE, MODERATE:hide, CREATE_FACILITY, UPDATE_FACILITY, UPVOTE_FACILITY, MODERATE_FACILITY:hide, etc. |
| editorId | Who performed the action |
| timestamp | |
| previousHash | Hash of the prior block for this report ("GENESIS" if first) |
| currentHash | SHA-256 of `previousHash|reportId|action|editorId|timestamp|payload` |
| payloadSnapshot | JSON string of what changed |

## Settings
Simple key/value store.
| key | value |
|---|---|
| adminPin | PIN for the admin panel — **change from the default immediately** |
| appName | Display name |

## Facilities
Public-editable — anyone can add or edit an evacuation center, hospital,
or community safe point, with the same version history / upvote / audit
trail treatment as Reports.
| Column | Type | Notes |
|---|---|---|
| facilityId | string | Primary key, e.g. `FAC-A1B2C3D4` |
| name | string | |
| type | enum | `evacuation`, `hospital`, `other` (community safe point) |
| lat, lng | number | |
| capacity | string | Optional, free text (e.g. "300 people") |
| contact | string | Optional phone/contact |
| description | string | Optional |
| submittedBy | string | Optional alias, defaults to "Anonymous" |
| editorId | string | Anonymous device UUID of original submitter |
| upvotes | number | Community verification count |
| flagged | boolean | Set by moderation |
| hidden | boolean | Hidden facilities are excluded from `getFacilities` |
| imageCount | number | |
| timestamp | ISO datetime | When added |
| lastUpdated | ISO datetime | Bumped on every edit |

## Images
Stored separately from Reports/Facilities to keep row sizes manageable.
The `reportId` column is a **generic parent-record key** — it holds either
a Report's `reportId` or a Facility's `facilityId`, since it's just a
foreign key, not report-specific. The same reuse applies to the
`reportId` column in `Updates` and `Blockchain` below.
| Column | Notes |
|---|---|
| imageId | Primary key |
| reportId | Foreign key → Reports.reportId **or** Facilities.facilityId |
| uploadedAt | |
| base64OrUrl | Resized base64 data URL (client resizes before upload) |
| caption | Optional |
