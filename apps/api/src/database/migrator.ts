import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

/**
 * Minimal forward-only SQL migrator. Files in apps/api/migrations are applied
 * in lexicographic order inside a transaction each, recorded in
 * schema_migrations. Migrations are immutable once merged — fixes are new
 * migrations (docs/database/DATABASE_SCHEMA.md is kept in sync).
 */
export async function runMigrations(databaseUrl: string, migrationsDir: string): Promise<string[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const applied: string[] = [];
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      } finally {
        client.release();
      }
    }
    return applied;
  } finally {
    await pool.end();
  }
}
