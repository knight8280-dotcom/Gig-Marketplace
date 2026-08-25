import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth.decorators';
import { DatabaseService } from '../database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /** Liveness: process is up. Exposes no internals. */
  @Public()
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: verifies database connectivity. */
  @Public()
  @Get('readyz')
  async readyz(): Promise<{ status: 'ok' | 'degraded'; checks: Record<string, 'ok' | 'failed'> }> {
    let dbStatus: 'ok' | 'failed' = 'ok';
    try {
      await this.db.query('SELECT 1');
    } catch {
      dbStatus = 'failed';
    }
    return { status: dbStatus === 'ok' ? 'ok' : 'degraded', checks: { database: dbStatus } };
  }
}
