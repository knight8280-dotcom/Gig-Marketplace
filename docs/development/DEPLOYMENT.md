# Deployment

**The website is live at https://knight8280-dotcom.github.io/Gig-Marketplace/.**

It deploys to GitHub Pages from `.github/workflows/deploy-pages.yml`, which
builds the Expo web export and publishes it on every push to `main` (or on
demand via **Actions → Deploy website → Run workflow**).

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

## One-time setup (already done for this repository)

Recorded for anyone setting this up again, or moving it to another repo:

1. **Pages needs a public repository, or GitHub Pro/Team/Enterprise for a
   private one.** This repository is public.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
   Not "Deploy from a branch" — this workflow uploads an artifact.

   This step is manual. The build passes `enablement: true` to
   `actions/configure-pages` so the action can create the site itself, but the
   workflow's built-in `GITHUB_TOKEN` is refused:

   ```
   Create Pages site failed. Error: Resource not accessible by integration
   ```

   Once Pages is enabled by hand the flag is harmless — the action finds the
   existing site and continues.
3. Push to `main`. The site appears at `https://<owner>.github.io/<repo>/`.

## Hosting the API

GitHub Pages cannot run the API, so it needs a container or Node host of its
own. `apps/api/Dockerfile` builds a self-contained image and works anywhere
that takes a Dockerfile (Fly.io, Railway, Render, Cloud Run, a VPS):

```bash
docker build -f apps/api/Dockerfile -t gig-api .   # from the repository root
```

### Railway

`railway.json` at the repository root points Railway at
`apps/api/Dockerfile` and sets `/healthz` as the health check. Without it
Railway looks for a Dockerfile at the root, finds none, and falls back to
guessing a build for the whole monorepo.

New Project → Deploy from GitHub repo → pick this repository. Add the
environment below under **Variables**, then **Settings → Networking →
Generate Domain** to get a public URL.

For the admin dashboard, add a second service from the same repository and set
**Settings → Config-as-code** to `railway.admin.json`. Its API URL is baked in
at build time, so set `NEXT_PUBLIC_API_URL` as a *build* variable there.

On a host that builds from source instead of a Dockerfile, use:

| | |
|---|---|
| Build | `pnpm install --frozen-lockfile && pnpm --filter @gig/shared build && pnpm --filter @gig/api build` |
| Start | `pnpm --filter @gig/api start:prod` |

`start:prod` runs migrations, then the idempotent bootstrap, then the server —
safe to re-run on every deploy.

### Required environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL 16+ with `postgis`, `citext`, `pgcrypto` available |
| `JWT_ACCESS_SECRET` | At least 32 characters; boot refuses shorter in production |
| `CORS_ORIGINS` | `https://knight8280-dotcom.github.io` for the Pages site |
| `PORT` | Usually injected by the host |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | Creates the first admin on first boot; enrol TOTP 2FA immediately after |
| `UPLOADS_DIR` | Local disk today — see the object-storage note below |

Stripe and Twilio credentials are optional to boot: the API logs a warning and
the corresponding endpoints fail honestly until they are set.

### Verified boot behaviour

Against an empty database, using the same command sequence the image runs:

- migrations apply cleanly, then bootstrap creates the default platform fee
  (1500 bps) and the first admin;
- running bootstrap twice is a no-op the second time (`an admin already
  exists — nothing to do`);
- `/healthz` and `/readyz` both return ok, with `readyz` reporting the
  database check;
- with no `STRIPE_SECRET_KEY`, boot succeeds and warns rather than crashing.

## Hosting the admin dashboard

The ops dashboard is needed before a real pilot: enabling a category is
deliberately manual (TRUST_AND_SAFETY / legal checklist L-8), and that happens
here. `apps/admin/Dockerfile` builds it:

```bash
docker build -f apps/admin/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://your-api-host \
  -t gig-admin .
```

`NEXT_PUBLIC_*` values are compiled into the client bundle, so the API URL is a
**build argument, not a runtime variable** — changing it means rebuilding.

Add the dashboard's origin to the API's `CORS_ORIGINS`, sign in with the
bootstrap admin, and enrol TOTP 2FA immediately.

Running it outside a container: `pnpm --filter @gig/admin build`, then
`pnpm --filter @gig/admin start`. Note that `start` (unlike `dev`) does not pin
a port and defaults to 3000, which collides with the API locally — set `PORT`.

## Pointing the site at an API

Once the API is hosted, wire the two sides together:

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
