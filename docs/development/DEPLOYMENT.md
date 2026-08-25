# Deployment (GitHub Pages)

The website deploys to GitHub Pages from `.github/workflows/deploy-pages.yml`,
which builds the Expo web export and publishes it on every push to `main`
(or on demand via **Actions → Deploy website → Run workflow**).

## What this hosts, and what it does not

GitHub Pages serves **static files only**. It runs no server process and no
database, so it hosts exactly one of the three services in this repo:

| Service | Hosted here? | Why |
|---|---|---|
| Customer/worker website (Expo web export) | **Yes** | Static HTML/JS/CSS |
| API (`@gig/api`) | No | NestJS server process + PostgreSQL/PostGIS |
| Admin dashboard (`@gig/admin`) | No | Next.js server rendering |

**Consequence:** until an API is hosted somewhere and `API_URL` is set (below),
the deployed site serves the landing page correctly and every screen behind
sign-in fails to load data. That is the honest state of a Pages-only deploy —
it is a marketing site plus a shell, not a working marketplace.

## One-time setup

1. **Pages requires a public repo or a paid plan.** This repository is
   currently **private**, and publishing Pages from a private repository needs
   GitHub Pro, Team, or Enterprise. On the free plan, make the repository
   public first — review it for anything you would not publish before you do.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
   Do not pick "Deploy from a branch"; this workflow uploads an artifact.

   This step is manual and cannot be automated from the workflow. The build
   passes `enablement: true` to `actions/configure-pages`, which asks GitHub to
   create the Pages site, but the workflow's built-in `GITHUB_TOKEN` is not
   permitted to do so:

   ```
   Create Pages site failed. Error: Resource not accessible by integration
   ```

   Once Pages is enabled by hand the flag is harmless — the action finds the
   existing site and continues.
3. Push to `main`. The site appears at
   `https://<owner>.github.io/<repo>/` — for this repo,
   `https://knight8280-dotcom.github.io/Gig-Marketplace/`.

## Pointing the site at an API

When the API is hosted (any Node host — Fly.io, Railway, Render, a VPS —
plus a PostgreSQL + PostGIS database), wire the two sides together:

1. **Settings → Secrets and variables → Actions → Variables** → add
   `API_URL`, e.g. `https://api.example.com`. The next deploy bakes it in —
   `EXPO_PUBLIC_*` values are compiled into the bundle at build time, so
   changing the variable requires a redeploy, not just a restart.
2. On the API, set `CORS_ORIGINS` to the Pages origin
   (`https://knight8280-dotcom.github.io`) so the browser is allowed to call
   it.
3. The API still needs its own environment: `DATABASE_URL`,
   `JWT_ACCESS_SECRET` (≥32 chars), Stripe keys, and — after creating the
   webhook endpoint — `STRIPE_WEBHOOK_SECRET`. It runs migrations and the
   idempotent bootstrap on boot:
   `node apps/api/dist/database/migrate-cli.js && node apps/api/dist/database/bootstrap-cli.js && node apps/api/dist/main.js`

## How the build handles three GitHub Pages quirks

All three are handled in the workflow; they are noted here because they break
silently if the workflow is ever rewritten.

- **Base path.** A project site is served from `/<repo>/`, not the domain
  root. The workflow passes `EXPO_WEB_BASE_URL` (from
  `actions/configure-pages`) into the export, and `apps/mobile/app.config.js`
  turns it into Expo's `experiments.baseUrl`. Without it every asset and route
  resolves against the domain root and 404s.
- **Jekyll and underscores.** Pages runs Jekyll by default, which drops
  directories whose names begin with `_` — that is the whole `_expo/static`
  bundle. The workflow writes a `.nojekyll` file to switch Jekyll off.
- **No rewrite rules.** Expo emits a real file per static route, so those work
  directly. Dynamic routes (`/job/<id>`) have no matching file, so the
  workflow copies `index.html` to `404.html`; Pages serves it and the router
  takes over. Such a URL is answered with HTTP 404 even though the page
  renders — a custom domain plus a host with rewrites avoids that if it
  matters for SEO.

## Database: Supabase

Supabase is managed PostgreSQL, so it works as this project's database with
**no code changes** — the API connects with `DATABASE_URL` like any other
Postgres. Nothing else about the architecture changes: the API still owns
auth, the job state machine, and the payment ledger (ADR-009), and does not
use Supabase Auth, PostgREST, or Row Level Security.

Verified on a free Supabase project (Postgres 17):

- `postgis` 3.3.7, `citext`, and `pgcrypto` all install, which is everything
  `0001_extensions.sql` requires.
- `geography(Point, 4326)` columns and `USING GIST` indexes create cleanly —
  the shapes `0003_profiles.sql` and `0005_jobs.sql` depend on.
- `ST_Distance`, `ST_DWithin`, and `<->` KNN ordering all return correct
  results, which is the whole of the discovery/matching query surface.

To use it: copy the connection string from **Project Settings → Database**
(use the pooled connection string for a serverless host, the direct one
otherwise) and set it as `DATABASE_URL` on the API. Migrations and the
bootstrap run on boot as usual.

Free-tier projects pause after a period of inactivity and are restored on the
next connection — fine for a pilot, worth upgrading before real traffic.

## Custom domain

Set it under **Settings → Pages → Custom domain**. `configure-pages` then
reports an empty base path, so the export is built for the domain root
automatically — no code change needed. Add the domain to the API's
`CORS_ORIGINS` too.

## Before real usage

- **Uploads are not hosted.** Job photos are written to `UPLOADS_DIR` on the
  API host's disk. Add S3-compatible object storage (the adapter interface
  already exists in `files/storage.adapter.ts`) before real usage.
- **Email is console-only** by default (`EMAIL_PROVIDER=console`):
  verification and password-reset emails appear in the API logs instead of
  inboxes. Set `EMAIL_PROVIDER=smtp` + `SMTP_URL`.
- **SMS requires a Twilio phone number** on the account (auto-discovered once
  purchased; or set `TWILIO_FROM_NUMBER`).
- **Payments stay in Stripe test mode** until Connect is enabled and the legal
  gate in [LEGAL_COMPLIANCE.md](../business/LEGAL_COMPLIANCE.md) is cleared —
  L-2 (terms of service) and L-3 (insurance) are both marked blockers.
