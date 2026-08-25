import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  /** Liveness: process is up. Exposes no internals. */
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness: will verify database/Redis connectivity once those
   * dependencies exist (Phase 1+). For the Phase 0 skeleton it mirrors
   * liveness — honestly labeled, no fake dependency checks.
   */
  @Get('readyz')
  readyz(): { status: 'ok'; checks: Record<string, string> } {
    return { status: 'ok', checks: { note: 'no dependencies wired yet (phase 0)' } };
  }
}
