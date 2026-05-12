# Deployment guide — Vercel (frontend) + Render (backend)

This app is split into two services:

| Service | Where | Why |
|---|---|---|
| **`apps/web`** (Next.js) | Vercel | Free tier, perfect for Next.js, global edge |
| **`apps/api`** (NestJS) | Render | Needs a persistent 24/7 process for the 30-second poller + Socket.IO; Vercel can't host this |

---

## Prerequisites

1. A GitHub account with this repo at `hariharanannamalairaman-cell/sheet-agent` (already pushed).
2. A Render account: https://render.com (sign up with GitHub).
3. A Vercel account: https://vercel.com (sign up with GitHub).
4. All credentials handy from your local `.env`:
   - `APP_ENC_KEY`, `JWT_SECRET`, `NEXTAUTH_SECRET`
   - `OWNER_EMAIL`, `OWNER_PASSWORD`
   - Meta: `META_SYSTEM_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `META_PAGE_ID`, `META_AD_ACCOUNT_ID`
   - Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
   - WATI: `WATI_API_ENDPOINT`, `WATI_ACCESS_TOKEN`
   - Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

---

## Step 1 — Deploy the backend to Render

### 1.1 Create the web service

1. Sign in to https://dashboard.render.com.
2. **New +** → **Web Service** → **Build and deploy from a Git repository**.
3. Connect your GitHub account, select `hariharanannamalairaman-cell/sheet-agent`.
4. Settings:
   - **Name:** `sheet-agent-api`
   - **Region:** Oregon (or whichever is closest to your Meta/WATI region)
   - **Branch:** `main`
   - **Root Directory:** *(leave blank — repo root)*
   - **Runtime:** `Node`
   - **Build Command:**
     ```
     corepack enable && pnpm install --frozen-lockfile && pnpm --filter @sheet-agent/api build
     ```
   - **Start Command:**
     ```
     cd apps/api && node dist/main.js
     ```
   - **Instance Type:** `Free`
5. Scroll down to **Environment** and add **every** variable from `.env`. Set `API_PORT=10000` (Render sets this automatically — but be explicit). Set `WEB_ORIGIN` to a placeholder for now (e.g. `https://localhost`); we'll update it after Vercel is up.
6. Click **Create Web Service**.

The first build takes ~5 minutes. Your URL will be something like `https://sheet-agent-api.onrender.com`.

### 1.2 Verify the backend

Once the service shows `Live`, hit these endpoints in your browser:

- `https://sheet-agent-api.onrender.com/auth/me` → should return `{"statusCode":401,...}` (good — service is up and auth-protected)

You should also receive a 🟢 startup ping in your Telegram bot chat (`@MhsSheet_bot`).

### 1.3 ⚠️ Two free-tier caveats — read these

1. **15-minute idle spin-down.** When no HTTP traffic hits the service for 15 minutes, Render sleeps it and the 30-second poller stops. Wake-up takes ~30 seconds.
   - **Fix (free):** sign up at https://uptimerobot.com, add a "HTTP(S)" monitor for `https://sheet-agent-api.onrender.com/auth/me`, set interval to **5 minutes**. The 401 response is fine — it counts as traffic.
   - **Fix (paid):** upgrade to Render Starter ($7/mo) — no spin-down.

2. **Disk resets on every deploy.** Your `data/flows.json`, `data/templates.json`, `data/lead-ids.json` are wiped on every redeploy. Your flows and lead-dedup state vanish.
   - **Fix ($1/mo):** in Render dashboard → your service → Disks → Add a `1 GB` disk mounted at `/opt/render/project/src/apps/api/data`. Survives deploys forever.
   - **Fix ($0):** accept the loss. Recreate flows manually after each deploy. Not viable in production.
   - **Fix (paid):** Starter plan includes a persistent disk by default.

---

## Step 2 — Deploy the frontend to Vercel

### 2.1 Import the project

1. Sign in to https://vercel.com.
2. **Add New…** → **Project** → **Import Git Repository** → select your repo.
3. Settings:
   - **Framework Preset:** `Next.js` (auto-detected)
   - **Root Directory:** `apps/web`
   - **Build Command:** *(leave default — Vercel uses what's in `vercel.json`)*
   - **Install Command:** *(leave default)*
4. **Environment Variables** — add all three:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://sheet-agent-api.onrender.com` (your Render URL) |
   | `NEXTAUTH_URL` | `https://sheet-agent.vercel.app` (your Vercel URL — you'll know it after deploy) |
   | `NEXTAUTH_SECRET` | the same value as your local `.env` |

5. Click **Deploy**.

Vercel will build (~2 minutes) and deploy. Note the assigned URL like `https://sheet-agent-h7b9.vercel.app`.

### 2.2 Update NEXTAUTH_URL and Render's WEB_ORIGIN

Now that you have the Vercel URL:

1. **In Vercel:** Project → Settings → Environment Variables → edit `NEXTAUTH_URL` to your actual Vercel URL → **Redeploy** (Deployments → … → Redeploy).
2. **In Render:** Service → Environment → edit `WEB_ORIGIN` to the same Vercel URL → **Save Changes** (Render auto-restarts).

### 2.3 Verify the frontend

Open your Vercel URL. You should:

1. Land on the login page
2. Sign in with `OWNER_PASSWORD` (`admin123` in your `.env`)
3. See the dashboard with your migrated flows
4. Click **Validate** in Settings — all three integrations should turn green
5. Receive the validation result in Telegram if any fails

---

## Step 3 — Re-add your data (if Render free without persistent disk)

If you chose **Render free without the $1 disk add-on**, the migrated `data/` files from your local machine **are not deployed** (they're git-ignored). On the first Render deploy:

- `flows.json` will be empty → click **Create** in the dashboard and re-configure flows
- `templates.json` will be empty → save Settings (or click Validate) once; this triggers a WATI sync and re-populates templates
- `lead-ids.json` will be empty → leads from the past will not be re-ingested (good); new leads going forward will be processed

If you chose **Render with persistent disk**, you can `scp`/`git scp` your local `apps/api/data/` files into the disk after first deploy. Easiest: SSH into the Render shell and `curl` the files from somewhere, or use the file upload UI.

---

## Step 4 — Verify alerts still work

After deploy, force-trigger a Telegram alert:

```bash
curl -X POST https://sheet-agent-api.onrender.com/errors \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from production","source":"deploy-smoke-test"}'
```

You should receive:
> 🔴 Frontend error · deploy-smoke-test
> Hello from production

---

## Step 5 — Set up the uptime monitor (free tier only)

1. Sign up at https://uptimerobot.com (free).
2. **+ New Monitor**:
   - **Type:** HTTPS
   - **Friendly Name:** Sheet Agent API
   - **URL:** `https://sheet-agent-api.onrender.com/auth/me`
   - **Monitoring Interval:** 5 minutes
3. Save. UptimeRobot will hit your API every 5 min, keeping Render awake. The 30-second poller stays running.

---

## Summary — what to set where

### Render (backend) env vars

```
APP_ENC_KEY=...
OWNER_EMAIL=info@myhealthschool.in
OWNER_PASSWORD=admin123
JWT_SECRET=...
JWT_EXPIRES_IN=7d
API_PORT=10000
API_HOST=0.0.0.0
WEB_ORIGIN=https://your-app.vercel.app

META_SYSTEM_TOKEN=...
META_APP_ID=1541573860425223
META_APP_SECRET=...
META_PAGE_ID=113830624877941
META_AD_ACCOUNT_ID=0

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...

WATI_API_ENDPOINT=https://live-mt-server.wati.io/427210
WATI_ACCESS_TOKEN=...

TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### Vercel (frontend) env vars

```
NEXT_PUBLIC_API_URL=https://sheet-agent-api.onrender.com
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=...
```

---

## Cost summary

| Setup | Monthly cost | Reliability |
|---|---|---|
| Render free + UptimeRobot keep-alive, no disk | $0 | ⚠️ Flows reset on each deploy |
| Render free + UptimeRobot + $1 persistent disk | $1 | ✅ Reliable |
| Render Starter | $7 | ✅ Best — no spin-down, includes disk |
| Vercel frontend | $0 | ✅ Always free for personal use |

Pick the row that matches your budget; everything else is identical.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vercel build fails with "Cannot find module @sheet-agent/types" | Vercel didn't run from monorepo root | Confirm `vercel.json` is at repo root and `installCommand` runs `pnpm install` at root |
| Frontend can't reach backend, CORS error in browser console | `WEB_ORIGIN` mismatch on Render | Set Render's `WEB_ORIGIN` to the exact Vercel URL (no trailing slash) |
| Telegram alerts not arriving | Bot not opted-in or wrong chat_id | Send `/start` to `@MhsSheet_bot` from the Telegram account whose user_id is `TELEGRAM_CHAT_ID` |
| Login fails on production | `JWT_SECRET` mismatch between Render and Vercel? | Vercel doesn't need `JWT_SECRET` — only `NEXTAUTH_SECRET`. Confirm Render has `JWT_SECRET` set |
| Polling stopped working at night | Render spin-down | Confirm UptimeRobot monitor is green, OR upgrade to Starter |
| Flows disappeared after deploy | Free tier disk reset | Add the $1/mo persistent disk |
