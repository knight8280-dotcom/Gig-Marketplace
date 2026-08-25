import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { JobsModule } from '../jobs/jobs.module';
import { JobsRepository } from '../jobs/jobs.repository';

class SuspendDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

/**
 * Admin operations API (Phase 15). Every mutation requires a reason where
 * relevant and writes audit_logs. Serves the Next.js admin app.
 */
@Injectable()
class AdminMetricsService {
  constructor(private readonly db: DatabaseService) {}

  /** Core marketplace KPIs (PRD §33) computed live from the system of record. */
  async overview(): Promise<Record<string, unknown>> {
    const [users, jobs, money, trust, liquidity] = await Promise.all([
      this.db.query<Record<string, string>>(
        `SELECT
           count(*) FILTER (WHERE 'CUSTOMER' = ANY(roles)) AS customers,
           count(*) FILTER (WHERE 'WORKER' = ANY(roles)) AS workers,
           count(*) FILTER (WHERE status = 'ACTIVE') AS active_users,
           count(*) FILTER (WHERE status = 'SUSPENDED') AS suspended_users,
           (SELECT count(*) FROM worker_profiles WHERE available_now) AS available_workers
         FROM users`,
      ),
      this.db.query<Record<string, string>>(
        `SELECT
           count(*) FILTER (WHERE state IN ('POSTED','MATCHING','PARTIALLY_FILLED','FILLED','IN_PROGRESS')) AS active_jobs,
           count(*) FILTER (WHERE state IN ('COMPLETED','PAYMENT_PENDING','PAID','CLOSED')) AS completed_jobs,
           count(*) FILTER (WHERE state = 'CANCELLED') AS cancelled_jobs,
           count(*) FILTER (WHERE state = 'PENDING_REVIEW') AS jobs_awaiting_review,
           count(*) FILTER (WHERE state = 'DISPUTED') AS disputed_jobs
         FROM jobs`,
      ),
      this.db.query<Record<string, string>>(
        `SELECT
           COALESCE(sum(amount_cents) FILTER (WHERE kind = 'JOB_PAYMENT' AND status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')), 0) AS gmv_cents,
           COALESCE(sum(platform_fee_cents) FILTER (WHERE kind = 'JOB_PAYMENT' AND status IN ('SUCCEEDED','PARTIALLY_REFUNDED')), 0) AS revenue_cents,
           COALESCE(sum(refunded_cents), 0) AS refunded_cents,
           count(*) FILTER (WHERE status = 'FAILED') AS failed_payments
         FROM payments`,
      ),
      this.db.query<Record<string, string>>(
        `SELECT
           (SELECT count(*) FROM disputes WHERE status IN ('OPEN','UNDER_REVIEW')) AS open_disputes,
           (SELECT count(*) FROM reports WHERE status = 'OPEN') AS open_reports,
           (SELECT round(avg(overall)::numeric, 2) FROM ratings) AS average_rating`,
      ),
      this.db.query<Record<string, string>>(
        `SELECT
           count(*) FILTER (WHERE posted_at IS NOT NULL) AS posted_30d,
           count(*) FILTER (WHERE filled_at IS NOT NULL) AS filled_30d,
           round(avg(EXTRACT(EPOCH FROM (filled_at - posted_at)) / 60)
             FILTER (WHERE filled_at IS NOT NULL)) AS avg_minutes_to_fill
         FROM jobs WHERE created_at > now() - interval '30 days'`,
      ),
    ]);
    const l = liquidity.rows[0]!;
    return {
      supply_demand: users.rows[0],
      jobs: jobs.rows[0],
      economics: money.rows[0],
      trust: trust.rows[0],
      liquidity: {
        ...l,
        fill_rate_30d:
          Number(l.posted_30d) > 0 ? Number((Number(l.filled_30d) / Number(l.posted_30d)).toFixed(2)) : null,
      },
    };
  }
}

@RequirePermissions('admin:access')
@Controller('admin')
class AdminController {
  constructor(
    private readonly db: DatabaseService,
    private readonly metrics: AdminMetricsService,
    private readonly auth: AuthService,
    private readonly jobs: JobsRepository,
  ) {}

  @Get('metrics/overview')
  overview() {
    return this.metrics.overview();
  }

  // ── Users ────────────────────────────────────────────────────────────────

  @Get('users')
  async users(@Query('query') query?: string, @Query('status') status?: string) {
    const { rows } = await this.db.query(
      `SELECT u.id, u.email, u.roles, u.status, u.created_at,
              cp.display_name AS customer_name, wp.display_name AS worker_name
       FROM users u
       LEFT JOIN customer_profiles cp ON cp.user_id = u.id
       LEFT JOIN worker_profiles wp ON wp.user_id = u.id
       WHERE ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%'
              OR cp.display_name ILIKE '%' || $1 || '%' OR wp.display_name ILIKE '%' || $1 || '%')
         AND ($2::user_status IS NULL OR u.status = $2::user_status)
       ORDER BY u.created_at DESC LIMIT 100`,
      [query ?? null, status ?? null],
    );
    return { items: rows };
  }

  @Get('users/:id')
  async user(@Param('id', ParseUUIDPipe) id: string) {
    const { rows } = await this.db.query(
      `SELECT u.id, u.email, u.phone, u.roles, u.status, u.suspended_reason, u.created_at,
              u.email_verified_at, u.phone_verified_at,
              (SELECT count(*) FROM jobs WHERE customer_user_id = u.id) AS jobs_posted,
              (SELECT count(*) FROM job_workers WHERE worker_user_id = u.id) AS jobs_accepted,
              (SELECT count(*) FROM disputes WHERE opened_by = u.id) AS disputes_opened,
              (SELECT count(*) FROM reports WHERE reported_user_id = u.id) AS reports_against
       FROM users u WHERE u.id = $1`,
      [id],
    );
    if (!rows[0]) throw DomainError.notFound('User not found');
    return rows[0];
  }

  @HttpCode(200)
  @Post('users/:id/suspend')
  async suspend(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendDto,
  ) {
    if (id === admin.id) throw DomainError.validation('You cannot suspend yourself');
    const { rowCount } = await this.db.query(
      `UPDATE users SET status = 'SUSPENDED', suspended_reason = $2, updated_at = now()
       WHERE id = $1 AND status = 'ACTIVE'`,
      [id, dto.reason],
    );
    if ((rowCount ?? 0) === 0) throw DomainError.conflict('User is not active');
    await this.auth.revokeAllSessions(id);
    await this.adminAudit(admin.id, 'admin.user_suspended', 'users', id, dto.reason);
    return { id, status: 'SUSPENDED' };
  }

  @HttpCode(200)
  @Post('users/:id/restore')
  async restore(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendDto,
  ) {
    const { rowCount } = await this.db.query(
      `UPDATE users SET status = 'ACTIVE', suspended_reason = NULL, updated_at = now()
       WHERE id = $1 AND status = 'SUSPENDED'`,
      [id],
    );
    if ((rowCount ?? 0) === 0) throw DomainError.conflict('User is not suspended');
    await this.adminAudit(admin.id, 'admin.user_restored', 'users', id, dto.reason);
    return { id, status: 'ACTIVE' };
  }

  // ── Jobs ─────────────────────────────────────────────────────────────────

  @Get('jobs')
  async adminJobs(@Query('query') query?: string, @Query('state') state?: string) {
    const { rows } = await this.db.query(
      `SELECT id, customer_user_id, title, state, city, region, workers_needed, workers_filled,
              pay_type, pay_cents, currency, scheduled_start_at, created_at
       FROM jobs
       WHERE ($1::text IS NULL OR title ILIKE '%' || $1 || '%')
         AND ($2::job_state IS NULL OR state = $2::job_state)
       ORDER BY created_at DESC LIMIT 100`,
      [query ?? null, state ?? null],
    );
    return { items: rows };
  }

  @Get('jobs/:id')
  async adminJob(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.jobs.findById(id);
    if (!job) throw DomainError.notFound('Job not found');
    const [assignments, timeline, payments] = await Promise.all([
      this.jobs.listAssignmentsForJob(id),
      this.jobs.getTimeline(id),
      this.db.query(
        `SELECT id, kind, status, amount_cents, platform_fee_cents, refunded_cents, failure_code, created_at
         FROM payments WHERE job_id = $1 ORDER BY created_at`,
        [id],
      ),
    ]);
    return { ...job, assignments, timeline, payments: payments.rows };
  }

  // ── Payments & audit ──────────────────────────────────────────────────────

  @Get('payments')
  async payments(@Query('status') status?: string, @Query('job_id') jobId?: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM payments
       WHERE ($1::text IS NULL OR status = $1) AND ($2::uuid IS NULL OR job_id = $2::uuid)
       ORDER BY created_at DESC LIMIT 100`,
      [status ?? null, jobId ?? null],
    );
    return { items: rows };
  }

  @Get('payouts')
  async payouts(@Query('status') status?: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM payouts WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC LIMIT 100`,
      [status ?? null],
    );
    return { items: rows };
  }

  @Get('audit-logs')
  async auditLogs(@Query('entity_table') entityTable?: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM audit_logs WHERE ($1::text IS NULL OR entity_table = $1)
       ORDER BY created_at DESC LIMIT 200`,
      [entityTable ?? null],
    );
    return { items: rows };
  }

  private async adminAudit(adminId: string, action: string, table: string, entityId: string, reason: string) {
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_table, entity_id, reason)
       VALUES ($1, 'ADMIN', $2, $3, $4, $5)`,
      [adminId, action, table, entityId, reason],
    );
  }
}

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [AdminController],
  providers: [AdminMetricsService],
})
export class AdminModule {}
