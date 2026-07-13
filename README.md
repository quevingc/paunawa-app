# Paunawa — Crowdsourced Real-Time Emergency Reporting

A free, open, crowdsourced platform for reporting and tracking emergencies
(floods, earthquakes, fires, storms, landslides, armed conflict, and other
hazards) on a live map — plus a publicly editable directory of evacuation
centers, hospitals, and safe points — with a tamper-evident audit trail on
every edit.

**Stack:** HTML/CSS/JS (frontend) · Leaflet + OpenStreetMap (map) ·
**Supabase (Postgres + Realtime + Storage)** (backend/database) · GitHub Pages (hosting)

> This project originally used Google Sheets + Apps Script as the backend.
> It was migrated to Supabase because Apps Script's free-tier execution
> quotas (6-minute run cap, concurrent-execution limits, daily `UrlFetch`
> quotas) are restrictive for a public-facing app, and Sheets isn't a real
> database. The old Apps Script backend is kept in `gas/` for reference,
> but **Supabase is the supported path** going forward. See
> [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) for the full walkthrough.

---

## 1. Project structure

```
paunawa-app/
├── index.html                 # Single-page app shell
├── manifest.json              # PWA manifest
├── service-worker.js          # PWA offline app-shell caching
├── css/
│   └── style.css              # All styling (design tokens, components, responsive)
├── js/
│   ├── config.js              # ⚠️ Set your Supabase URL + anon key here
│   ├── utils.js                # Shared helpers (geolocation, validation, spam checks…)
│   ├── blockchain.js          # Client-side hash-chain verification
│   ├── supabaseClient.js      # Initializes the Supabase JS client
│   ├── api.js                  # Talks to Supabase (reads via tables, writes via RPC)
│   ├── offline.js             # IndexedDB offline report queue + auto-sync
│   ├── theme.js                # Dark / light mode
│   ├── i18n.js                 # Multi-language strings (en, es, fr, ar, tl)
│   ├── notifications.js       # Browser notifications for nearby incidents
│   ├── map.js                  # Leaflet map, markers, clustering, heatmap, routing
│   ├── reports.js             # Incident report submit/edit/upvote/export logic
│   ├── facilities.js          # Public facility submit/edit/upvote/history logic
│   ├── dashboard.js           # Dashboard charts & lists (Chart.js)
│   ├── sos.js                  # One-tap SOS mode
│   ├── admin.js                # Moderation panel logic
│   └── app.js                  # App bootstrap — wires everything together
├── icons/                     # PWA icons
├── supabase/                   # ⭐ Current backend — run these in the Supabase SQL Editor
│   ├── schema.sql              # Tables + Row Level Security policies
│   ├── functions.sql           # RPC functions (CRUD, moderation, hash-chain audit trail)
│   └── storage_policies.sql    # Image bucket upload/read policies
├── gas/                         # Legacy backend (Google Apps Script + Sheets) — reference only
│   └── ...
└── docs/
    ├── SUPABASE_SETUP.md        # ⭐ Start here — full setup walkthrough from zero
    ├── DEPLOYMENT.md            # Legacy Apps Script deployment guide
    ├── API.md                    # Legacy Apps Script endpoint reference
    └── SHEETS_SCHEMA.md          # Legacy Google Sheets schema reference
```

## 2. Quick start

1. **Backend:** Follow [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) —
   create a Supabase account/project, run `supabase/schema.sql` and
   `supabase/functions.sql` in the SQL Editor, create the `report-images`
   Storage bucket, and run `supabase/storage_policies.sql`.
2. **Frontend:** Paste your Supabase project URL and anon key into
   `js/config.js` → `CONFIG.SUPABASE_URL` / `CONFIG.SUPABASE_ANON_KEY`.
3. **Hosting:** Push this folder to a GitHub repository and enable
   GitHub Pages (Settings → Pages → Deploy from branch → `/ (root)`).
4. Open the published GitHub Pages URL. Change the default admin PIN in the
   Supabase `settings` table (`adminPin`, default `changeme123`) immediately.

### Redeploying after a change

- **Frontend files** (`index.html`, `css/`, `js/`) → commit and push to
  GitHub; Pages rebuilds automatically.
- **Backend logic** (`supabase/functions.sql`) → paste the changed
  function(s) into the Supabase SQL Editor and run. Takes effect
  immediately — there's no separate "deploy" step to forget, unlike the
  old Apps Script setup.

## 3. Feature checklist

**Core — incident reports**
- Interactive Leaflet map, colored by emergency type & status, with clustering and heatmap
- Report create / edit with full version history (`updates` table)
- Ratings (accuracy, authenticity, usefulness) + community upvotes
- Dashboard: active incidents, counts by type, 14-day timeline, recent & most-verified reports
- Search, filters, dark/light mode, responsive mobile-first UI
- Image upload (stored in Supabase Storage, not base64), gallery + lightbox-style preview
- CSV / JSON export, shareable report links with QR codes
- Browser notifications for nearby active incidents
- **True real-time updates** via Supabase's websocket subscriptions — no more polling delay

**Facilities — publicly submittable**
- Anyone can add an evacuation center, hospital, or community safe point
  from the **Facilities** tab — not just admins
- Same treatment as incident reports: GPS or pin-on-map location, photos,
  optional capacity/contact/description, optional alias
- Editing with full field-level version history
- Community verify/upvote with a simple confidence score
- Clickable map markers open the same detail view as the Facilities list
- Shareable links with QR codes (`?facility=ID` deep links)
- Duplicate-facility warning when something similar already exists nearby

**Tamper-evident audit trail**
- Every create/update/moderate/rate/upvote action — for both reports *and*
  facilities — appends a hash-chain block (`blockchain` table): previous
  hash, current hash, timestamp, editor ID, action. The hash is computed
  server-side inside a Postgres function (`_append_block` in
  `supabase/functions.sql`) and independently re-verifiable client-side
  (`js/blockchain.js` recomputes and checks every link).

**Public-benefit additions**
- Offline report queue (IndexedDB) that auto-syncs when back online
- Duplicate-report detection (same type, close in time & space)
- Confidence score blending upvotes + average ratings
- Emergency contact directory + SOS one-tap mode
- QR code sharing, multi-language UI, WCAG-minded accessibility (skip link,
  focus states, semantic roles, reduced-motion support)
- PWA support (installable, offline app shell)
- Spam heuristics + SQL-injection-safe parameterized functions
- Admin moderation dashboard (PIN-gated: hide / resolve / flag reports and
  facilities, view audit trail)

## 4. Notes & honest limitations

- **No free tier is truly "unlimited."** Supabase's free tier (500MB
  database, 1GB Storage, 5GB bandwidth/month, 50K monthly active API
  users) is far more generous and better-suited to this app than Apps
  Script's execution-based quotas, but it is still a quota, not infinity.
  If this grows past a pilot/community scale, budget for Supabase's Pro tier.
- **Blockchain** is a single-ledger SHA-256 hash chain stored in a Postgres
  table, not a distributed blockchain — it detects tampering, it doesn't
  prevent someone with direct database access (e.g. the `service_role`
  key or dashboard access) from rewriting history undetected if they also
  regenerate every downstream hash. It's the right amount of "blockchain"
  for this use case; say so plainly if asked.
- **Reports and facilities share some table columns.** The `images`,
  `updates`, and `blockchain` tables all use a generic `record_id` column
  as their foreign key — for a facility row, that column simply holds the
  `facility_id` instead. It's a parent-record key, not report-specific;
  see `supabase/schema.sql` for details.
- **Writes only happen through SECURITY DEFINER functions**, never direct
  table INSERT/UPDATE from the browser — Row Level Security blocks that.
  This is what stops someone from forging a hash-chain block via the
  browser console; only `supabase/functions.sql`'s functions can write.
- **Admin auth** is still a PIN stored in a table for simplicity. Swap in
  Supabase Auth (email/magic-link, restricted by a `role` check) before
  using this for anything beyond a prototype/pilot.
- Anyone can submit or edit a report or facility — there's no ownership
  model, so edit wars are possible on high-traffic entries. The version
  history and audit trail make this visible and reversible, but nothing
  currently prevents it proactively.

## 5. License

Provided as-is for public-benefit / civic use. Attribute OpenStreetMap
per their license when displaying the map.
