import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';
import { AppConfig, CONFIG } from '../config/config';

/**
 * Thin wrapper around node-postgres. All data access goes through
 * parameterized queries — string-built SQL is forbidden (SECURITY_MODEL).
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }

  /**
   * node-postgres does not know custom enum types, so arrays of them (e.g.
   * user_role[]) arrive as raw strings. Register the standard text-array
   * parser for every enum array OID in the database.
   */
  async onModuleInit(): Promise<void> {
    const { rows } = await this.pool.query<{ typarray: number }>(
      `SELECT typarray FROM pg_type WHERE typtype = 'e' AND typarray <> 0`,
    );
    const textArrayParser = types.getTypeParser(1009 as never); // text[]
    for (const row of rows) {
      types.setTypeParser(row.typarray as never, textArrayParser as never);
    }
  }

  query<R extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params as any[]);
  }

  /** Run fn inside a transaction; rolls back on any throw. */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
