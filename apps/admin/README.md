# @gig/admin — Next.js admin dashboard

Platform operations dashboard (Next.js 16, App Router). A client of the `/v1/admin/*` API.

**Status:** implemented and browser-tested against the local stack.

## Pages

- **Overview** — live KPIs (GMV, revenue, refunds, active/completed/disputed jobs, supply/demand, fill rate, time-to-fill)
- **Review queue** — approve/reject restricted-work job posts
- **Users** — search, suspend (reason required, audited, sessions revoked), restore
- **Jobs** — search + full investigation view (assignments, payments, immutable timeline)
- **Disputes** — evidence review (text evidence, messages, payments) and audited resolution (release / full / partial refund / other)
- **Reports** — safety/fraud report review
- **Payments** — customer charges/refunds and worker payouts ledgers
- **Categories** — create (disabled by default per the legal checklist) and enable/disable
- **Settings** — live-edited platform configuration (audited)
- **Audit log** — append-only admin/security action trail

## Run

```bash
pnpm install
pnpm --filter @gig/admin dev    # http://localhost:3001 (API must be running on :3000)
```

Dev sign-in: `admin@example.test` / `devpassword123` (seeded).

## Production hardening before pilot (tracked)

- Session tokens currently live in localStorage for the prototype; move to httpOnly
  cookie sessions + TOTP 2FA per `docs/security/SECURITY_MODEL.md`.
- `NEXT_PUBLIC_API_URL` must point at the deployed API; CORS allow-list via `CORS_ORIGINS`.
