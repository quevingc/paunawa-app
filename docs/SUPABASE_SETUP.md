# Supabase Setup Guide (starting from zero)

This replaces the old Google Sheets + Apps Script backend. Supabase gives
you a real Postgres database, real-time updates (no more 30-second
polling), and file storage for images — all on a free tier without Apps
Script's execution/quota limits.

Total time: ~15 minutes.

---

## 1. Create your Supabase account

1. Go to **[supabase.com](https://supabase.com)** and click **Start your project**.
2. Sign up with GitHub (fastest) or email.
3. Verify your email if prompted.

## 2. Create a new project

1. Click **New project**.
2. Fill in:
   - **Name:** `paunawa` (or anything you like)
   - **Database Password:** generate a strong one and **save it somewhere** —
     you won't need it for this app (we only use the anon key), but you'll
     want it if you ever connect a SQL client directly.
   - **Region:** pick one close to your users (e.g. Southeast Asia for the Philippines)
   - **Pricing Plan:** Free
3. Click **Create new project**. It takes 1–2 minutes to provision — grab a coffee.

## 3. Run the database schema

1. Once the project is ready, open the left sidebar → **SQL Editor**.
2. Click **New query**.
3. Open `supabase/schema.sql` from this project, copy its **entire contents**, paste into the editor.
4. Click **Run** (or Ctrl/Cmd+Enter). You should see "Success. No rows returned."
5. Click **New query** again, copy the **entire contents** of `supabase/functions.sql`, paste, and **Run**.
6. Confirm it worked: left sidebar → **Table Editor** — you should see 8 tables
   (`reports`, `facilities`, `updates`, `ratings`, `users`, `blockchain`,
   `images`, `settings`), and `facilities` should already have 2 sample rows.

## 4. Create the image storage bucket

1. Left sidebar → **Storage** → **New bucket**.
2. Name it exactly: `report-images`
3. Toggle **Public bucket: ON** (so uploaded photos are viewable without auth).
4. Click **Create bucket**.
5. Go back to **SQL Editor → New query**, paste the contents of
   `supabase/storage_policies.sql`, and **Run**.

## 5. Change the default admin PIN

1. Left sidebar → **Table Editor** → `settings` table.
2. Find the row where `key = adminPin`, click the `value` cell, change it
   from `changeme123` to something private, press Enter to save.

## 6. Get your API credentials

1. Left sidebar → **Project Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public** key (a long string under "Project API keys")

   > The **anon** key is meant to be public — it's safe to put in
   > frontend code. Row Level Security (already set up by schema.sql)
   > is what actually protects your data, not keeping this key secret.
   > Never use the **service_role** key in frontend code — that one
   > bypasses all security rules.

## 7. Configure the frontend

Open `js/config.js` in this project and replace:
```js
SUPABASE_URL: "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE",
SUPABASE_ANON_KEY: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",
```
with the two values you copied.

## 8. Push to GitHub

Commit and push the updated files. GitHub Pages will redeploy
automatically — no separate "deploy" step like Apps Script required.
**This is one of the practical upgrades**: with Supabase, editing your
database logic (the SQL functions) and editing your frontend are the
*only* two things that can go stale relative to each other — there's no
third "deployment version" to forget, the way Apps Script had.

## 9. Verify end-to-end

1. Open your GitHub Pages URL.
2. Submit a test report.
3. Open **Table Editor → reports** in Supabase — your new row should be there instantly.
4. Open the report in the app → **History** — should show "✔ Verified Unbroken".
5. Open the app in a **second browser tab** and submit another report in
   the first tab — the second tab's map should update **within about a
   second**, without you refreshing. That's the real-time subscription
   working (this didn't exist with Apps Script's polling).

---

## What changed vs. the Apps Script setup

| | Apps Script + Sheets | Supabase |
|---|---|---|
| Database | Sheet tabs | Real Postgres tables |
| Business logic location | `gas/*.gs` files, deployed as a Web App | `supabase/functions.sql`, run once in the SQL Editor |
| Images | Base64 crammed into sheet cells | Files in a Storage bucket, URL stored in a table |
| Live updates | 30-second polling | Real-time websocket subscription |
| Redeploy after a backend change | Deploy → Manage deployments → New version (easy to forget!) | Re-run the changed SQL in the SQL Editor — takes effect immediately, no separate deploy step |
| Free tier limits | 6-min execution cap, concurrent-execution quotas, daily `UrlFetch` quotas | 500MB database, 1GB file storage, 5GB bandwidth/month, 50K monthly active API users — no per-request execution quota |

The `gas/` folder is kept in this project for reference / as a fallback
if you ever want to switch back, but it's no longer the recommended path.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Supabase is not configured yet" alert | You haven't pasted your URL/anon key into `js/config.js` |
| Requests fail with a permissions/RLS error | You skipped running `functions.sql`, or a table's RLS policy is missing — re-run `schema.sql` |
| Images don't upload | The `report-images` bucket doesn't exist yet, isn't public, or `storage_policies.sql` wasn't run |
| Map loads but is empty | Open browser dev tools → Console for the actual error; double-check Table Editor shows your seed facilities rows |
| Realtime doesn't seem to update live | Some corporate/school networks block websockets — the 2-minute fallback poll in `app.js` will still catch changes eventually |
