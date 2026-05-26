# Sheet Agent

Full-stack automation dashboard: **Meta Lead Forms → Google Sheets → WATI WhatsApp**.

Each new Meta lead is captured via webhook, persisted in Postgres, appended to a Google Sheet, and triggers a WATI template message — visible in real time on a lavender, pill-shaped dashboard.

## Stack

- **Web** — Next.js 15 App Router · TypeScript · Tailwind · NextAuth (credentials) · Socket.IO client
- **API** — NestJS · Prisma · **pg-boss** queue · Socket.IO gateway · JWT
- **DB + queue** — Supabase Postgres (both Prisma data and pg-boss jobs live in the same database)

> No Redis, no Docker. The job queue runs on top of Postgres via pg-boss in its own `pgboss` schema.

## Layout

```
sheet agent/
├── frontend/             # Next.js dashboard + settings UI
├── backend/              # NestJS REST + webhooks + Socket.IO + pg-boss workers
├── packages/
│   ├── db/               # Prisma schema + client
│   ├── crypto/           # AES-256-GCM helpers
│   └── types/            # Shared TypeScript DTOs
└── .env.example
```

## Setup

### 0. Prerequisites

- Node.js 20+
- pnpm 9+ (`npm i -g pnpm`)
- A Supabase project (Settings → Database → Connection strings)
- ngrok (for exposing the Meta webhook in dev)

### 1. Install

```powershell
pnpm install
```

### 2. Environment

Copy `.env.example` to `.env` at the repo root, then fill in:

```powershell
copy .env.example .env
```

Both apps and the Prisma CLI read from this single root `.env`. The repo currently keeps copies in sync (`.env`, `backend/.env`, `frontend/.env.local`, `packages/db/.env`) — when you change one, copy it to the others.

Important values:

- `DATABASE_URL` — from Supabase (Settings → Database → "Connection pooling"). Use the **transaction-mode** URL (port 6543) with `?pgbouncer=true&connection_limit=1`.
- `DIRECT_URL` — same project, **session-mode** URL (port 5432). Used by Prisma migrations *and* by pg-boss.
- `APP_ENC_KEY` — 32 random bytes, base64. Generate with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- `JWT_SECRET` / `NEXTAUTH_SECRET` — long random strings.
- `OWNER_EMAIL` / `OWNER_PASSWORD` — seed the single owner account on first API boot.
- `META_WEBHOOK_VERIFY_TOKEN` — any random string; paste it into the Meta App webhook config.

### 3. Database

Generate the Prisma client and push the schema to Supabase:

```powershell
pnpm db:generate
pnpm db:push
```

(`pgboss` schema is auto-provisioned when the API first starts — no manual step required.)

### 4. Run

In two terminals (or use `pnpm dev` to run both in parallel):

```powershell
pnpm dev:api   # NestJS on http://localhost:4000
pnpm dev:web   # Next.js on http://localhost:3000
```

Open http://localhost:3000 and sign in with the owner credentials from `.env`.

### 5. Expose the Meta webhook

In a third terminal:

```powershell
ngrok http 4000
```

Copy the public `https://...ngrok-free.app` URL. In your Meta App dashboard → Webhooks:

- **Callback URL:** `https://<ngrok-id>.ngrok-free.app/webhooks/meta`
- **Verify token:** the value of `META_WEBHOOK_VERIFY_TOKEN`
- **Subscription field:** `leadgen`

Update `PUBLIC_API_URL` in `.env` to that ngrok URL.

## How to use

1. Open **Settings**, paste all three sets of credentials, click **Save & Validate**. Green badges → ready.
2. Open **Dashboard** → click **Create** → new draft row appears.
3. Click **Select Form**, pick a Meta lead form.
4. Paste a Google Sheet URL (the sheet's first row should contain headers; common names like `Name`, `Phone`, `Email` are auto-mapped).
5. Click **Template**, pick a WATI template (the local cache was populated when you saved Settings).
6. Click **Automate**. The system validates everything, subscribes the page to `leadgen`, appends a synthetic test row to the Sheet, then flips the badge to 🟢 **Active**.
7. Trigger a real lead via Meta's [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing). Within a few seconds you should see:
   - `total` and `today` counters increment
   - a new row in your Google Sheet
   - a WhatsApp template message on the test phone
   - log entries in the **Logs** drawer

## How the queue works

Four logical queues live in the `pgboss` schema inside Supabase:

| Queue              | Triggered by                  | What it does                                |
| ------------------ | ----------------------------- | ------------------------------------------- |
| `lead-processing`  | Meta webhook POST             | Fetches lead from Graph API, persists, fans out |
| `sheet-sync`       | `lead-processing` success     | Appends row to the configured Google Sheet  |
| `wati-send`        | `sheet-sync` success          | Sends the configured WATI template          |
| `retry-failed`     | pg-boss internal retries      | Reserved; pg-boss handles retries natively  |

Each job has `retryLimit: 3` with exponential backoff. Each is deduplicated by a `singletonKey` so a webhook retry cannot double-process the same lead.

## Notes on the WATI template

This v1 sends `{ phone, template_name }` with **no variables**. The template you pick must be pre-approved by WATI/Meta and contain zero `{{1}}`-style placeholders. Per-flow variable mapping is a planned follow-up.

## Notes on Google auth

You provide a long-lived OAuth refresh token. The simplest way to get one:

1. Google Cloud Console → create OAuth 2.0 Client (type: Web). Add `https://developers.google.com/oauthplayground` as a redirect URI.
2. Visit https://developers.google.com/oauthplayground, click the gear → "Use your own OAuth credentials", paste client ID/secret.
3. In the Scopes box, paste `https://www.googleapis.com/auth/spreadsheets`. Authorize → exchange auth code for tokens.
4. Copy the **refresh token** into Settings.

## Security

- All credential columns (`metaSystemToken`, `metaAppSecret`, `googleClientSecret`, `googleRefreshToken`, `watiAccessToken`) are AES-256-GCM encrypted at rest using `APP_ENC_KEY`.
- The Meta webhook verifies `x-hub-signature-256` against the raw body using `metaAppSecret`.
- pg-boss jobs are deduplicated by `lead:<leadId>` to prevent duplicate processing of webhook retries.
- All API routes except `/auth/login` and `/webhooks/meta` require a JWT.
- Rate limiting via `@nestjs/throttler` (120 req/min default, 600 req/min for webhook).
- Helmet for HTTP headers.

## Troubleshooting

- **`Cannot find module '@prisma/client'`** — run `pnpm db:generate`.
- **`P1000: Authentication failed`** during `pnpm db:push` — your Supabase DB password contains a character that needs URL-encoding (`@` → `%40`, `:` → `%3A`, etc.). Easiest fix: reset the password in Supabase to alphanumeric only.
- **Meta validation fails with `(#10) Application does not have permission for this action`** — the system user token needs `leads_retrieval`, `pages_read_engagement`, and `pages_manage_metadata` scopes on the page.
- **Sheet validation fails** — confirm the OAuth client has the Sheets API enabled and the refresh token was issued for the `spreadsheets` scope.
- **WATI 401** — the access token usually already includes `Bearer `; the API tolerates both formats.

## Scripts

| Command           | What it does                                |
| ----------------- | ------------------------------------------- |
| `pnpm dev`        | Run web + api in parallel                   |
| `pnpm dev:web`    | Next.js only                                |
| `pnpm dev:api`    | NestJS only (with watch)                    |
| `pnpm db:generate`| Generate Prisma client                      |
| `pnpm db:push`    | Push schema to Supabase (no migration file) |
| `pnpm db:migrate` | Create + apply a migration                  |
| `pnpm db:studio`  | Open Prisma Studio                          |
