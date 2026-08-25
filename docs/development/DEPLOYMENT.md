# Deployment (Render pilot)

The repo root contains `render.yaml` — a Render Blueprint defining the full
pilot stack. Phase 19's hosting decision (OD-5) is executed as: Render,
free plan for the pilot, upgrade paths noted below.

## Stack

| Service | Type | URL |
|---|---|---|
| `gig-marketplace-api` | Node web service (NestJS) | https://gig-marketplace-api.onrender.com |
| `gig-marketplace-admin` | Node web service (Next.js) | https://gig-marketplace-admin.onrender.com |
| `gig-marketplace-web` | Static site (Expo web export) | https://gig-marketplace-web.onrender.com |
| `gig-marketplace-db` | PostgreSQL 16 + PostGIS | internal |

On every deploy the API runs migrations, then the idempotent production
bootstrap (`bootstrap-cli.ts`: default platform fee; first admin user when
`BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` are set and no admin
exists), then boots.

## First deploy

1. Open https://dashboard.render.com/blueprint/new?repo=https://github.com/knight8280-dotcom/Gig-Marketplace
2. Complete GitHub authorization (private repo), pick the `main` branch.
3. Fill the `sync: false` secrets when prompted:
   - `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` — **test-mode keys**
     (`sk_test_…` / `pk_test_…`) until Stripe Connect is enabled and the
     legal gate (LEGAL_COMPLIANCE.md) is cleared.
   - `TWILIO_API_KEY_SID` (`SK…`) / `TWILIO_API_KEY_SECRET`.
   - `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (min 12 chars) —
     log in to the admin dashboard and enroll TOTP 2FA immediately.
   - `STRIPE_WEBHOOK_SECRET` — leave blank on first deploy; see below.
4. Apply. Three services and the database build and deploy.

## After first deploy

1. **Stripe webhook**: in the Stripe dashboard (test mode) add a webhook
   endpoint for `https://gig-marketplace-api.onrender.com/v1/webhooks/stripe`
   with events `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `account.updated`, `transfer.reversed`; paste the signing secret into the
   API service's `STRIPE_WEBHOOK_SECRET` env var.
2. **Categories**: log in to the admin dashboard and create/enable the pilot
   categories (production category enablement is gated by legal checklist L-8,
   so this is deliberately manual).
3. Sanity: `GET /healthz` and `GET /readyz` on the API return `ok`.

## Known pilot limitations (upgrade before real usage)

- **Free plan spin-down**: services idle out after 15 min; first request
  takes ~1 min. Upgrade services to `starter` to keep them warm.
- **Free Postgres expires after 30 days** — upgrade to `basic_256mb` well
  before then (data is kept when upgrading, lost if the free DB expires).
- **Uploads are ephemeral** (`/tmp`): job photos are lost on deploy/restart.
  Add S3-compatible object storage (adapter interface already exists in
  `files/storage.adapter.ts`) before real usage.
- **Email is console-only** (`EMAIL_PROVIDER=console`): verification and
  password-reset emails appear in the API service logs instead of inboxes.
  Provision SMTP credentials and set `EMAIL_PROVIDER=smtp` + `SMTP_URL`.
- **SMS requires a Twilio phone number** on the account (auto-discovered once
  purchased; or set `TWILIO_FROM_NUMBER`).
