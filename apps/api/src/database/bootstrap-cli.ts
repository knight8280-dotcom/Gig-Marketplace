/* eslint-disable no-console */
import argon2 from 'argon2';
import { Pool } from 'pg';
import { loadConfig } from '../config/config';

/**
 * Production-safe bootstrap (idempotent — safe to run on every deploy).
 * Unlike seed-cli (dev/test only, refuses production), this creates only what
 * a fresh production database cannot function without:
 *
 *  1. The default platform-fee row (payments snapshot the active row; charging
 *     fails without one). 15% + $0 per PAYMENT_MODEL.md P-3 — adjustable
 *     anytime in admin settings.
 *  2. One ADMIN user — only when NO admin exists yet and
 *     BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are provided. ADMIN is
 *     never self-assignable through the API, so a first admin must be created
 *     out-of-band. Existing admins are never modified.
 *
 * Categories are intentionally NOT seeded here: production category
 * enablement is gated by the legal checklist (L-8) and managed by the admin
 * through the dashboard.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
  try {
    await pool.query(
      `INSERT INTO platform_fees (name, percent_bps, fixed_cents, currency)
       SELECT 'default', 1500, 0, 'USD'
       WHERE NOT EXISTS (SELECT 1 FROM platform_fees WHERE name = 'default' AND active_to IS NULL)`,
    );
    console.log('Platform fee: default row ensured.');

    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) {
      console.log('Admin bootstrap: skipped (BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set).');
      return;
    }
    if (password.length < 12) {
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
    }

    const { rows: admins } = await pool.query(
      `SELECT 1 FROM users WHERE 'ADMIN' = ANY(roles) LIMIT 1`,
    );
    if (admins.length > 0) {
      console.log('Admin bootstrap: an admin already exists — nothing to do.');
      return;
    }

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, roles, email_verified_at)
       VALUES ($1, $2, ARRAY['ADMIN']::user_role[], now())
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email.toLowerCase(), hash],
    );
    if (!rows[0]) {
      throw new Error(`Admin bootstrap: a non-admin user already owns ${email} — refusing to modify it.`);
    }
    await pool.query(
      `INSERT INTO verification_records (user_id, type, status, provider, verified_at)
       VALUES ($1, 'EMAIL'::verification_type, 'PASSED', 'internal', now()) ON CONFLICT DO NOTHING`,
      [rows[0].id],
    );
    console.log(`Admin bootstrap: created admin ${email}. Enroll TOTP 2FA from the admin dashboard immediately.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
