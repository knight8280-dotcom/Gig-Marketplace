import { Body, Controller, Get, HttpCode, Injectable, Logger, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';

const REPORT_CATEGORIES = [
  'UNSAFE_JOB', 'DANGEROUS_CONDITIONS', 'HARASSMENT', 'THREAT', 'UNSAFE_BEHAVIOR', 'FRAUD', 'OTHER',
] as const;

class CreateReportDto {
  @IsIn(REPORT_CATEGORIES)
  category!: (typeof REPORT_CATEGORIES)[number];

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsUUID()
  reported_user_id?: string;

  @IsOptional()
  @IsUUID()
  job_id?: string;
}

class ReviewReportDto {
  @IsIn(['REVIEWED', 'ACTIONED', 'DISMISSED'])
  status!: 'REVIEWED' | 'ACTIONED' | 'DISMISSED';

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  note!: string;
}

/** Safety/behavior/fraud reports (Phase 16 foundations, TRUST_AND_SAFETY.md). */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly db: DatabaseService) {}

  async create(reporterId: string | null, dto: CreateReportDto): Promise<{ id: string }> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO reports (reporter_user_id, reported_user_id, job_id, category, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [reporterId, dto.reported_user_id ?? null, dto.job_id ?? null, dto.category, dto.description],
    );
    return rows[0]!;
  }

  /** Safety cancellations automatically open a report for admin review. */
  @OnEvent('assignment.cancelled_by_worker')
  onWorkerCancelled(p: { jobId: string; workerUserId: string; safety: boolean }): void {
    if (!p.safety) return;
    this.create(p.workerUserId, {
      category: 'UNSAFE_JOB',
      description: 'Automatic report: worker cancelled this job for safety reasons.',
      job_id: p.jobId,
    } as CreateReportDto).catch((err) => this.logger.error(`auto report failed: ${(err as Error).message}`));
  }
}

@Controller()
class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly db: DatabaseService,
  ) {}

  @Post('reports')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user.id, dto);
  }

  @RequirePermissions('admin:access')
  @Get('admin/reports')
  async adminList(@Query('status') status?: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM reports WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at LIMIT 100`,
      [status ?? null],
    );
    return { items: rows };
  }

  @RequirePermissions('admin:access')
  @HttpCode(200)
  @Post('admin/reports/:id/review')
  async review(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReportDto,
  ) {
    const { rows } = await this.db.query(
      `UPDATE reports SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
       WHERE id = $1 RETURNING *`,
      [id, dto.status, admin.id, dto.note],
    );
    if (!rows[0]) throw DomainError.notFound('Report not found');
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_table, entity_id, reason)
       VALUES ($1, 'ADMIN', 'report.reviewed', 'reports', $2, $3)`,
      [admin.id, id, dto.note],
    );
    return rows[0];
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
