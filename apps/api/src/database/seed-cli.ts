import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { loadConfig } from '../config/config';

/**
 * Development seed data — idempotent, clearly fake (@example.test emails,
 * documented dev passwords). REFUSES to run in production.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  if (config.nodeEnv === 'production') {
    throw new Error('Seeding is a development/test tool and refuses to run in production.');
  }
  const pool = new Pool({ connectionString: config.databaseUrl, max: 2 });
  try {
    await seedCategories(pool);
    await seedSkills(pool);
    await seedRestrictedTerms(pool);
    await seedPlatformFee(pool);
    await seedDevAccounts(pool);
    // eslint-disable-next-line no-console
    console.log('Seed complete (idempotent). Dev accounts: see docs/development/LOCAL_SETUP.md');
  } finally {
    await pool.end();
  }
}

async function seedCategories(pool: Pool): Promise<void> {
  // Initial pilot catalog. Enabled flags are a LOCAL/dev convenience —
  // production category enablement requires the legal checklist (L-8).
  const categories: Array<[string, string, string, boolean, string[]]> = [
    ['moving-help', 'Moving Help', 'Loading, unloading, and carrying for moves', true, []],
    ['furniture-assembly', 'Furniture Assembly', 'Assemble or disassemble furniture', true, ['basic tools']],
    ['yard-work', 'Yard Work', 'Lawn cleanup, weeding, raking, planting', true, []],
    ['cleaning', 'Cleaning', 'Home, garage, and property cleaning', true, []],
    ['junk-removal', 'Junk Removal Help', 'Hauling assistance (customer provides disposal)', true, []],
    ['event-help', 'Event Setup & Teardown', 'Set up or tear down events', true, []],
    ['warehouse-labor', 'Warehouse & Inventory', 'Warehouse labor and inventory assistance', true, []],
    ['packing', 'Packing & Unpacking', 'Packing or unpacking boxes', true, []],
    ['general-labor', 'General Labor', 'Other legally permitted local tasks', true, []],
    ['delivery-help', 'Delivery & Pickup Help', 'Local pickup/delivery assistance', false, []],
  ];
  for (const [slug, name, description, enabled, equipment] of categories) {
    await pool.query(
      `INSERT INTO categories (slug, name, description, enabled, required_equipment, sort_order)
       VALUES ($1, $2, $3, $4, $5, 0) ON CONFLICT (slug) DO NOTHING`,
      [slug, name, description, enabled, equipment],
    );
  }
}

async function seedSkills(pool: Pool): Promise<void> {
  const skills: Array<[string, string]> = [
    ['heavy-lifting', 'Heavy Lifting'],
    ['furniture-assembly', 'Furniture Assembly'],
    ['power-tools', 'Power Tools'],
    ['landscaping', 'Landscaping'],
    ['deep-cleaning', 'Deep Cleaning'],
    ['organizing', 'Organizing'],
    ['event-setup', 'Event Setup'],
    ['inventory', 'Inventory Management'],
    ['packing', 'Packing'],
    ['driving-truck', 'Truck Driving (non-CDL)'],
  ];
  for (const [slug, name] of skills) {
    await pool.query(
      'INSERT INTO skills (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING',
      [slug, name],
    );
  }
}

async function seedRestrictedTerms(pool: Pool): Promise<void> {
  // BLOCK = cannot post; REVIEW = admin review before going live.
  // Initial list — expanded/tuned with counsel input (L-8).
  const terms: Array<[string, 'BLOCK' | 'REVIEW', string]> = [
    ['\\b(gun|firearm|weapon|ammunition)\\b', 'BLOCK', 'Weapons-related work is prohibited'],
    ['\\b(drug|narcotic|cannabis)\\b', 'BLOCK', 'Controlled-substance work is prohibited'],
    ['\\bescort\\b', 'BLOCK', 'Prohibited service category'],
    ['\\b(electrical|wiring|breaker panel)\\b', 'REVIEW', 'Possible licensed-trade work'],
    ['\\b(gas line|plumbing|water heater)\\b', 'REVIEW', 'Possible licensed-trade work'],
    ['\\broof(ing)?\\b', 'REVIEW', 'Height/licensed-trade risk'],
    ['\\b(babysit|childcare|nanny)\\b', 'REVIEW', 'Childcare requires additional vetting'],
    ['\\b(medical|nursing|caregiver)\\b', 'REVIEW', 'Possible regulated care work'],
    ['\\b(drive|transport) (me|people|passengers)\\b', 'REVIEW', 'Passenger transport is regulated'],
    ['\\b(asbestos|mold remediation|biohazard)\\b', 'REVIEW', 'Hazardous-material risk'],
    ['\\btree (removal|felling)\\b', 'REVIEW', 'High-risk work'],
  ];
  for (const [pattern, kind, reason] of terms) {
    await pool.query(
      `INSERT INTO restricted_terms (pattern, kind, reason)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM restricted_terms WHERE pattern = $1)`,
      [pattern, kind, reason],
    );
  }
}

async function seedPlatformFee(pool: Pool): Promise<void> {
  // Initial fee CONFIG VALUE (P-3 in PAYMENT_MODEL.md) — 15% + $0, changeable
  // anytime through admin settings; payments snapshot the row they used.
  await pool.query(
    `INSERT INTO platform_fees (name, percent_bps, fixed_cents, currency)
     SELECT 'default', 1500, 0, 'USD'
     WHERE NOT EXISTS (SELECT 1 FROM platform_fees WHERE name = 'default' AND active_to IS NULL)`,
  );
}

async function seedDevAccounts(pool: Pool): Promise<void> {
  const password = await argon2.hash('devpassword123', { type: argon2.argon2id });
  const accounts: Array<[string, string[], string | null]> = [
    ['admin@example.test', ['ADMIN'], null],
    ['customer@example.test', ['CUSTOMER'], 'Casey Customer'],
    ['worker@example.test', ['WORKER'], 'Wendy Worker'],
  ];
  for (const [email, roles, displayName] of accounts) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, roles, email_verified_at)
       VALUES ($1, $2, $3::user_role[], now())
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, password, roles],
    );
    const userId = rows[0]?.id;
    if (!userId) continue;
    await pool.query(
      `INSERT INTO verification_records (user_id, type, status, provider, verified_at)
       VALUES ($1, 'EMAIL', 'PASSED', 'internal', now()) ON CONFLICT DO NOTHING`,
      [userId],
    );
    if (roles.includes('CUSTOMER') && displayName) {
      await pool.query(
        `INSERT INTO customer_profiles (user_id, display_name) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, displayName],
      );
    }
    if (roles.includes('WORKER') && displayName) {
      await pool.query(
        `INSERT INTO worker_profiles (user_id, display_name, bio, transportation, home_location)
         VALUES ($1, $2, 'Seeded development worker', '{CAR}',
                 ST_SetSRID(ST_MakePoint(-97.7431, 30.2672), 4326)::geography)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, displayName],
      );
      await pool.query(
        `INSERT INTO worker_skills (worker_user_id, skill_id)
         SELECT $1, id FROM skills WHERE slug IN ('heavy-lifting','packing')
         ON CONFLICT DO NOTHING`,
        [userId],
      );
      await pool.query(
        `INSERT INTO worker_categories (worker_user_id, category_id)
         SELECT $1, id FROM categories WHERE slug IN ('moving-help','packing') AND enabled
         ON CONFLICT DO NOTHING`,
        [userId],
      );
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
