# Deployment Guide (Legacy — Google Apps Script + Sheets)

> ⚠️ **This backend is no longer the recommended path.** Paunawa now uses
> Supabase (Postgres + Realtime + Storage) — see
> [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) for the current setup guide.
> This document is kept for reference / as a fallback if you specifically
> want the Apps Script version instead.

## Step 1 — Create the Google Sheet + Apps Script backend

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
   Name it e.g. "Paunawa Database".
2. Open **Extensions → Apps Script**. This opens the Apps Script editor bound
   to your sheet.
3. Delete the default `Code.gs` content. For each file in this project's
   `gas/` folder, create a matching script file (File → New → Script file)
   and paste in its contents:
   - `Code.gs`
   - `Setup.gs`
   - `Utils.gs`
   - `Reports.gs`
   - `Ratings.gs`
   - `Users.gs`
   - `Facilities.gs`
   - `Blockchain.gs`
   - `Dashboard.gs`
4. In the function dropdown at the top of the editor, select
   `setupSpreadsheet`, then click **Run**. Grant the permissions it asks for
   (it only touches this spreadsheet). You should see an "Setup complete"
   alert and 8 new sheet tabs.
5. **Change the default admin PIN**: open the `Settings` tab in the sheet
   and change the `adminPin` value from `changeme123` to something private.

## Step 2 — Deploy as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Fill in:
   - Description: `Paunawa API v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, authorize again if prompted.
5. Copy the **Web app URL** (ends in `/exec`). This is your API endpoint.

> Every time you edit the .gs files, you must create a **new deployment**
> (or use "Manage deployments" → edit → new version) for changes to go live
> on the same URL.

## Step 3 — Configure the frontend

1. Open `js/config.js` in this project.
2. Replace:
   ```js
   API_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE",
   ```
   with your copied `/exec` URL.
3. Optionally adjust `MAP.defaultCenter` to your region.

## Step 4 — Host on GitHub Pages

1. Create a new GitHub repository and push the entire project folder to it.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", choose **Deploy from a branch**, branch
   `main`, folder `/ (root)`.
4. Save. GitHub will publish at `https://<username>.github.io/<repo>/`.
5. Visit the URL — the app should load and be able to reach your Apps
   Script backend (CORS is handled automatically because Apps Script Web
   Apps allow cross-origin requests by default).

## Step 5 — Verify end-to-end

1. Submit a test report (use "Pin on Map" if GPS is unavailable).
2. Confirm it appears on the map and in the Dashboard.
3. Open the report → **History** — you should see a `CREATE` block with a
   "✔ Verified Unbroken" badge.
4. Try the **Admin** tab with your PIN, mark the test report Resolved.
5. Toggle dark mode, switch language, and test on a phone-sized viewport.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "API_URL is not configured yet" alert | You didn't paste the `/exec` URL into `js/config.js` |
| Requests fail with a script error page (HTML, not JSON) | Web app access is not set to "Anyone", or you're still using an old deployment URL |
| Map loads but no markers | Check the browser console — likely an Apps Script error; verify `setupSpreadsheet()` was run |
| Images fail to attach | Base64 image payloads are large — Apps Script POST bodies have practical size limits (~5–10MB); the app already resizes images client-side to stay well under this |
