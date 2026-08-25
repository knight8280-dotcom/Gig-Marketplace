import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { JOB_STATES } from '@gig/shared';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { DomainError } from '../../common/errors';
import { JobsService } from './jobs.service';
import { JobsRepository } from './jobs.repository';
import { JobChangesService } from './job-changes.service';
import { CancelJobDto, CreateJobDto, ProposeChangeDto } from './dto';

const WRITE_LIMIT = { default: { limit: 60, ttl: 60 * 60 * 1000 } };

class ReviewDecisionDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly service: JobsService,
    private readonly jobs: JobsRepository,
    private readonly changes: JobChangesService,
  ) {}

  @RequirePermissions('job:create')
  @Throttle(WRITE_LIMIT)
  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateJobDto) {
    const job = await this.service.createJob(user, dto);
    return this.service.fullJobView(job);
  }

  @Get('mine')
  async mine(
    @CurrentUser() user: RequestUser,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const states = state ? state.split(',') : null;
    if (states?.some((s) => !(JOB_STATES as readonly string[]).includes(s))) {
      throw DomainError.validation('Invalid state filter');
    }
    const items = await this.jobs.listByCustomer(
      user.id,
      states,
      Math.min(Number(limit ?? 20), 100),
      cursor ?? null,
    );
    return {
      items: items.map((j) => this.service.fullJobView(j)),
      next_cursor: items.length > 0 ? items[items.length - 1]!.id : null,
    };
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getJobForViewer(user, id);
  }

  @RequirePermissions('job:create')
  @Post(':id/post')
  async postDraft(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.fullJobView(await this.service.postDraft(user, id));
  }

  @RequirePermissions('job:create')
  @Throttle(WRITE_LIMIT)
  @Post(':id/duplicate')
  async duplicate(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.fullJobView(await this.service.duplicateJob(user, id));
  }

  @RequirePermissions('job:create')
  @HttpCode(200)
  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelJobDto,
  ) {
    return this.service.fullJobView(await this.service.cancelJob(user, id, dto));
  }

  @RequirePermissions('job:create')
  @HttpCode(200)
  @Post(':id/confirm-completion')
  async confirmCompletion(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.fullJobView(await this.service.confirmCompletion(user, id));
  }

  @Get(':id/timeline')
  async timeline(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return { items: await this.service.getTimelineForViewer(user, id) };
  }

  // ── Scope changes ──────────────────────────────────────────────────────────

  @RequirePermissions('job:create')
  @Post(':id/changes')
  propose(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposeChangeDto,
  ) {
    return this.changes.propose(user, id, dto);
  }

  @Get(':id/changes')
  async listChanges(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return { items: await this.changes.list(user, id) };
  }
}

@Controller('job-changes')
export class JobChangesController {
  constructor(private readonly changes: JobChangesService) {}

  @RequirePermissions('job:accept')
  @HttpCode(200)
  @Post(':id/approve')
  approve(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.changes.decide(user, id, true);
  }

  @RequirePermissions('job:accept')
  @HttpCode(200)
  @Post(':id/decline')
  decline(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.changes.decide(user, id, false);
  }
}

/** Admin restricted-work review queue. */
@RequirePermissions('admin:access')
@Controller('admin')
export class JobsAdminController {
  constructor(
    private readonly service: JobsService,
    private readonly jobs: JobsRepository,
  ) {}

  @Get('review-queue')
  async reviewQueue() {
    const { rows } = await this.jobs.db.query(
      `SELECT id, customer_user_id, category_id, title, description, review_reasons, created_at
       FROM jobs WHERE state = 'PENDING_REVIEW' ORDER BY created_at LIMIT 100`,
    );
    return { items: rows };
  }

  @HttpCode(200)
  @Post('jobs/:id/review')
  async review(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.service.fullJobView(await this.service.reviewJob(admin, id, dto.approve, dto.reason));
  }
}
