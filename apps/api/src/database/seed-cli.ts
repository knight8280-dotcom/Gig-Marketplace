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
    await seedDemoJobs(pool);
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
  const accounts: Array<[string, string[], string | null, string]> = [
    ['admin@example.test', ['ADMIN'], null, '+15550000001'],
    ['customer@example.test', ['CUSTOMER'], 'Casey Customer', '+15550000002'],
    ['worker@example.test', ['WORKER'], 'Wendy Worker', '+15550000003'],
  ];
  for (const [email, roles, displayName, phone] of accounts) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, roles, email_verified_at, phone, phone_verified_at)
       VALUES ($1, $2, $3::user_role[], now(), $4, now())
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, password, roles, phone],
    );
    const userId = rows[0]?.id;
    if (!userId) continue;
    for (const type of ['EMAIL', 'PHONE']) {
      await pool.query(
        `INSERT INTO verification_records (user_id, type, status, provider, verified_at)
         VALUES ($1, $2::verification_type, 'PASSED', 'internal', now()) ON CONFLICT DO NOTHING`,
        [userId, type],
      );
    }
    if (roles.includes('CUSTOMER') && displayName) {
      await pool.query(
        `INSERT INTO customer_profiles (user_id, display_name) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, displayName],
      );
    }
    if (roles.includes('WORKER') && displayName) {
      await pool.query(
        `INSERT INTO worker_profiles (user_id, display_name, bio, transportation, home_location, available_now)
         VALUES ($1, $2, 'Seeded development worker', '{CAR}',
                 ST_SetSRID(ST_MakePoint(-97.7431, 30.2672), 4326)::geography, true)
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

/** A handful of open demo jobs around Austin so dev/demo environments have content. */
async function seedDemoJobs(pool: Pool): Promise<void> {
  const { rows: customers } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = 'customer@example.test'`,
  );
  const customerId = customers[0]?.id;
  if (!customerId) return;
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM jobs WHERE customer_user_id = $1 LIMIT 1`,
    [customerId],
  );
  if (existing.length > 0) return; // idempotent

  const jobs: Array<{
    title: string; description: string; category: string; lat: number; lng: number;
    address: string; durationMin: number; workers: number; payType: 'FLAT' | 'HOURLY'; payCents: number;
  }> = [
    {
      title: 'Unload a 26-foot moving truck',
      description: 'Two people to help unload boxes and some furniture. Mostly boxes, one couch, one dresser. About two hours.',
      category: 'moving-help', lat: 30.2711, lng: -97.7437, address: '1100 Congress Ave',
      durationMin: 120, workers: 2, payType: 'FLAT', payCents: 9500,
    },
    {
      title: 'Backyard cleanup before a party',
      description: 'Rake leaves, pull weeds, and bag everything. Bags provided. Medium-sized backyard.',
      category: 'yard-work', lat: 30.2521, lng: -97.7623, address: '2204 Barton Springs Rd',
      durationMin: 180, workers: 1, payType: 'HOURLY', payCents: 2200,
    },
    {
      title: 'Assemble two IKEA wardrobes',
      description: 'Two PAX wardrobes still in boxes. Tools provided, instructions included. Second floor, elevator available.',
      category: 'furniture-assembly', lat: 30.2882, lng: -97.7423, address: '3005 Guadalupe St',
      durationMin: 150, workers: 1, payType: 'FLAT', payCents: 8000,
    },
    {
      title: 'Help pack a 2-bedroom apartment',
      description: 'Packing boxes and wrapping kitchenware before a Friday move. Materials on site.',
      category: 'packing', lat: 30.2453, lng: -97.7715, address: '1900 S Lamar Blvd',
      durationMin: 240, workers: 2, payType: 'HOURLY', payCents: 2000,
    },
  ];

  for (const job of jobs) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO jobs
         (customer_user_id, category_id, title, description, state,
          address_line1, city, region, postal_code, country,
          location, approx_location, timezone, urgency, scheduled_start_at,
          estimated_duration_minutes, workers_needed, pay_type, pay_cents, posted_at)
       SELECT $1, c.id, $2, $3, 'MATCHING',
              $4, 'Austin', 'TX', '78701', 'US',
              loc,
              ST_Project(loc, 150 + abs(hashtext($2)) % 200, radians(abs(hashtext($2)) % 360))::geography,
              'America/Chicago', 'SCHEDULED', now() + interval '30 hours',
              $7, $8, $9::pay_type, $10, now()
       FROM categories c,
            (SELECT ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)::geography AS loc) l
       WHERE c.slug = $11
       RETURNING id`,
      [customerId, job.title, job.description, job.address, job.lng, job.lat,
       job.durationMin, job.workers, job.payType, job.payCents, job.category],
    );
    if (rows[0]) {
      await pool.query(
        `INSERT INTO job_events (job_id, actor_user_id, event_type, to_state)
         VALUES ($1, $2, 'job.created', 'POSTED'), ($1, NULL, 'job.matching_started', 'MATCHING')`,
        [rows[0].id, customerId],
      );
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
