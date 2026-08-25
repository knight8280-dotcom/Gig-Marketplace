import { join } from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from '../src/database/migrator';

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://gig:gig_dev_password@localhost:5432/gig_test';

/** Reset the test database to a clean, fully-migrated state before the run. */
export default async function globalSetup(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DB_URL, max: 1 });
  try {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
  } finally {
    await pool.end();
  }
  await runMigrations(TEST_DB_URL, join(__dirname, '..', 'migrations'));
}
