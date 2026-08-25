import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ASSIGNMENT_STATES } from '@gig/shared';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { DomainError } from '../../common/errors';
import { JobsService } from './jobs.service';
import { JobsRepository } from './jobs.repository';
import { DiscoveryService } from './discovery.service';
import { ArrivedDto, CancelAssignmentDto, DiscoveryQueryDto } from './dto';

const WRITE_LIMIT = { default: { limit: 60, ttl: 60 * 60 * 1000 } };

/** Worker-side: discovery, acceptance, and execution lifecycle. */
@Controller()
export class AssignmentsController {
  constructor(
    private readonly service: JobsService,
    private readonly jobs: JobsRepository,
    private readonly discovery: DiscoveryService,
  ) {}

  // ── Discovery (Phase 6) ────────────────────────────────────────────────────

  @Get('discovery/jobs')
  nearby(@Query() query: DiscoveryQueryDto) {
    return this.discovery.nearbyJobs(query);
  }

  @Get('discovery/jobs/map')
  map(@Query() query: DiscoveryQueryDto) {
    return this.discovery.mapPins(query);
  }

  @Get('pricing/suggestion')
  suggestion(
    @Query('category_id', ParseUUIDPipe) categoryId: string,
    @Query() query: DiscoveryQueryDto,
  ) {
    return this.discovery.pricingSuggestion(categoryId, query.lat, query.lng);
  }

  // ── Acceptance (Phase 7) ───────────────────────────────────────────────────

  @RequirePermissions('job:accept')
  @Throttle(WRITE_LIMIT)
  @HttpCode(200)
  @Post('jobs/:id/accept')
  async accept(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const assignment = await this.service.acceptJob(user, id);
    return assignment;
  }

  // ── My assignments ─────────────────────────────────────────────────────────

  @Get('assignments/mine')
  async mine(
    @CurrentUser() user: RequestUser,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const states = state ? state.split(',') : null;
    if (states?.some((s) => !(ASSIGNMENT_STATES as readonly string[]).includes(s))) {
      throw DomainError.validation('Invalid state filter');
    }
    const items = await this.jobs.listAssignmentsForWorker(
      user.id,
      states,
      Math.min(Number(limit ?? 20), 100),
      cursor ?? null,
    );
    return {
      items: items.map((a) => ({ ...a, job: this.service.fullJobView(a.job) })),
      next_cursor: items.length > 0 ? items[items.length - 1]!.id : null,
    };
  }

  @Get('assignments/:id')
  async getOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const assignment = await this.jobs.findAssignmentById(id);
    if (!assignment || assignment.worker_user_id !== user.id) {
      throw DomainError.notFound('Assignment not found');
    }
    const job = await this.jobs.findById(assignment.job_id);
    return { ...assignment, job: this.service.fullJobView(job!) };
  }

  // ── Execution lifecycle (Phase 8) ─────────────────────────────────────────

  @RequirePermissions('job:accept')
  @HttpCode(200)
  @Post('assignments/:id/en-route')
  enRoute(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.assignmentTransition(user, id, 'EN_ROUTE');
  }

  @RequirePermissions('job:accept')
  @HttpCode(200)
  @Post('assignments/:id/arrived')
  arrived(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArrivedDto,
  ) {
    return this.service.assignmentTransition(user, id, 'ARRIVED', dto);
  }

  @RequirePermissions('job:accept')
  @HttpCode(200)
  @Post('assignments/:id/start')
  start(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.assignmentTransition(user, id, 'STARTED');
  }

  @RequirePermissions('job:accept')
  @HttpCode(200)
  @Post('assignments/:id/complete')
  complete(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.assignmentTransition(user, id, 'COMPLETED');
  }

  @RequirePermissions('job:accept')
  @HttpCode(204)
  @Post('assignments/:id/cancel')
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAssignmentDto,
  ) {
    await this.service.cancelAssignment(user, id, dto);
  }
}
