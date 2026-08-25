import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { AssignmentState, JobState } from '@gig/shared';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { RequestUser } from '../../common/auth.decorators';
import { CatalogRepository } from '../catalog/catalog.repository';
import { JobStateMachine } from './job-state-machine';
import {
  ACTIVE_ASSIGNMENT_STATES,
  AssignmentRow,
  JobRow,
  JobsRepository,
} from './jobs.repository';
import { ArrivedDto, CancelAssignmentDto, CancelJobDto, CreateJobDto } from './dto';

const OPEN_STATES: JobState[] = ['POSTED', 'MATCHING', 'PARTIALLY_FILLED'];

@Injectable()
export class JobsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsRepository,
    private readonly catalog: CatalogRepository,
    private readonly fsm: JobStateMachine,
  ) {}

  // ── Creation / posting ─────────────────────────────────────────────────────

  async createJob(customer: RequestUser, dto: CreateJobDto): Promise<JobRow> {
    if (!customer.emailVerified) {
      throw new DomainError('EMAIL_NOT_VERIFIED', 'Verify your email before posting jobs', 403);
    }
    const category = await this.catalog.findCategory(dto.category_id);
    if (!category || !category.enabled) {
      throw DomainError.validation('This category is not available');
    }
    if (dto.urgency === 'SCHEDULED') {
      if (!dto.scheduled_start_at) throw DomainError.validation('Scheduled jobs need a start time');
      if (new Date(dto.scheduled_start_at).getTime() < Date.now()) {
        throw DomainError.validation('Start time must be in the future');
      }
    }
    if (
      category.max_duration_minutes !== null &&
      dto.estimated_duration_minutes > category.max_duration_minutes
    ) {
      throw DomainError.validation(
        `This category allows at most ${category.max_duration_minutes} minutes`,
      );
    }

    const screening = await this.jobs.screenText(`${dto.title} ${dto.description}`);
    const blocked = screening.filter((s) => s.kind === 'BLOCK');
    if (blocked.length > 0) {
      throw new DomainError(
        'RESTRICTED_JOB_PENDING_REVIEW',
        'This job cannot be posted on the platform',
        422,
        { reasons: blocked.map((b) => b.reason) },
      );
    }
    const reviewReasons = screening.map((s) => s.reason);
    const needsReview = reviewReasons.length > 0;

    const asDraft = dto.save_as_draft === true;
    const state: JobState = asDraft ? 'DRAFT' : needsReview ? 'PENDING_REVIEW' : 'POSTED';

    return this.db.withTransaction(async (client) => {
      const job = await this.jobs.insertJob(
        client,
        customer.id,
        dto,
        state,
        needsReview ? 'PENDING_REVIEW' : 'NONE',
        reviewReasons,
      );
      await this.fsm.recordEvent(client, job.id, null, customer.id, 'job.created', undefined, state);
      if (state === 'POSTED') {
        // Posting immediately opens matching.
        await this.fsm.transitionJob(client, job.id, 'POSTED', 'MATCHING', null, 'job.matching_started');
        return (await this.jobs.findById(job.id, client))!;
      }
      return job;
    });
  }

  async postDraft(customer: RequestUser, jobId: string): Promise<JobRow> {
    return this.db.withTransaction(async (client) => {
      const job = await this.mustOwnJob(client, customer, jobId);
      if (job.state !== 'DRAFT' && job.state !== 'PENDING_REVIEW') {
        throw DomainError.conflict('Only drafts can be posted');
      }
      if (job.state === 'PENDING_REVIEW') {
        throw new DomainError(
          'RESTRICTED_JOB_PENDING_REVIEW',
          'This job is waiting for review before going live',
          409,
        );
      }
      if (job.urgency === 'SCHEDULED') {
        if (!job.scheduled_start_at) {
          throw DomainError.validation('Set a start time before posting this draft');
        }
        if (job.scheduled_start_at.getTime() < Date.now()) {
          throw DomainError.validation('Start time must be in the future');
        }
      }
      const screening = await this.jobs.screenText(`${job.title} ${job.description}`);
      if (screening.some((s) => s.kind === 'BLOCK')) {
        throw new DomainError('RESTRICTED_JOB_PENDING_REVIEW', 'This job cannot be posted', 422);
      }
      if (screening.length > 0) {
        await client.query(
          `UPDATE jobs SET review_status = 'PENDING_REVIEW', review_reasons = $2, updated_at = now() WHERE id = $1`,
          [jobId, screening.map((s) => s.reason)],
        );
        await this.fsm.transitionJob(client, jobId, 'DRAFT', 'PENDING_REVIEW', customer.id, 'job.review_required');
      } else {
        await this.fsm.transitionJob(client, jobId, 'DRAFT', 'POSTED', customer.id, 'job.posted');
        await this.fsm.transitionJob(client, jobId, 'POSTED', 'MATCHING', null, 'job.matching_started');
      }
      return (await this.jobs.findById(jobId, client))!;
    });
  }

  async duplicateJob(customer: RequestUser, jobId: string): Promise<JobRow> {
    const source = await this.jobs.findById(jobId);
    if (!source || source.customer_user_id !== customer.id) {
      throw DomainError.notFound('Job not found');
    }
    return this.db.withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO jobs
           (customer_user_id, category_id, title, description, state,
            address_line1, address_line2, city, region, postal_code, country,
            location, approx_location, timezone, urgency, scheduled_start_at,
            estimated_duration_minutes, workers_needed, pay_type, pay_cents,
            required_equipment, physical_requirements, special_instructions,
            access_instructions, parent_job_id)
         SELECT customer_user_id, category_id, title, description, 'DRAFT',
            address_line1, address_line2, city, region, postal_code, country,
            location, approx_location, timezone, urgency, NULL,
            estimated_duration_minutes, workers_needed, pay_type, pay_cents,
            required_equipment, physical_requirements, special_instructions,
            access_instructions, id
         FROM jobs WHERE id = $1
         RETURNING id`,
        [jobId],
      );
      const newId = rows[0]!.id;
      await this.fsm.recordEvent(client, newId, null, customer.id, 'job.duplicated', undefined, 'DRAFT', {
        source_job_id: jobId,
      });
      return (await this.jobs.findById(newId, client))!;
    });
  }

  // ── Admin review queue ─────────────────────────────────────────────────────

  async reviewJob(admin: RequestUser, jobId: string, approve: boolean, reason?: string): Promise<JobRow> {
    return this.db.withTransaction(async (client) => {
      const job = await this.jobs.lockJob(client, jobId);
      if (!job || job.state !== 'PENDING_REVIEW') {
        throw DomainError.notFound('No job awaiting review with this id');
      }
      if (approve) {
        await client.query(
          `UPDATE jobs SET review_status = 'APPROVED', updated_at = now() WHERE id = $1`,
          [jobId],
        );
        await this.fsm.transitionJob(client, jobId, 'PENDING_REVIEW', 'POSTED', admin.id, 'job.review_approved');
        await this.fsm.transitionJob(client, jobId, 'POSTED', 'MATCHING', null, 'job.matching_started');
      } else {
        await client.query(
          `UPDATE jobs SET review_status = 'REJECTED', updated_at = now() WHERE id = $1`,
          [jobId],
        );
        await this.fsm.transitionJob(client, jobId, 'PENDING_REVIEW', 'CANCELLED', admin.id, 'job.review_rejected', {
          reason: reason ?? null,
        });
      }
      return (await this.jobs.findById(jobId, client))!;
    });
  }

  // ── Acceptance (concurrency-critical) ──────────────────────────────────────

  async acceptJob(worker: RequestUser, jobId: string): Promise<AssignmentRow> {
    if (!worker.emailVerified || !worker.phoneVerified) {
      throw new DomainError(
        'REQUIREMENTS_NOT_MET',
        'Verify your email and phone before accepting jobs',
        403,
        { missing: [!worker.emailVerified && 'EMAIL', !worker.phoneVerified && 'PHONE'].filter(Boolean) },
      );
    }

    return this.db.withTransaction(async (client) => {
      const job = await this.jobs.lockJob(client, jobId);
      if (!job) throw DomainError.notFound('Job not found');
      if (job.customer_user_id === worker.id) {
        throw DomainError.forbidden('You cannot accept your own job');
      }

      // Idempotent retry: an existing active assignment is returned as-is.
      const existing = await this.jobs.findAssignment(jobId, worker.id, client);
      if (existing) {
        if ((ACTIVE_ASSIGNMENT_STATES as readonly string[]).includes(existing.state)) return existing;
        throw DomainError.conflict('You previously left this job and cannot re-accept it');
      }

      if (!(OPEN_STATES as string[]).includes(job.state)) {
        throw new DomainError('JOB_ALREADY_FILLED', 'This job is no longer available', 409);
      }
      if (job.review_status === 'PENDING_REVIEW') {
        throw new DomainError('JOB_NOT_OPEN', 'This job is not open yet', 409);
      }

      await this.assertWorkerEligible(client, worker.id, job.category_id);

      const { rows: blocks } = await client.query(
        `SELECT 1 FROM user_blocks
         WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
            OR (blocker_user_id = $2 AND blocked_user_id = $1)`,
        [worker.id, job.customer_user_id],
      );
      if (blocks.length > 0) {
        throw new DomainError('JOB_NOT_OPEN', 'This job is not available to you', 409);
      }

      if (job.workers_filled >= job.workers_needed) {
        // Defensive: state should already be FILLED, but the CHECK + this guard
        // make overfill impossible even under bugs.
        throw new DomainError('JOB_ALREADY_FILLED', 'This job is no longer available', 409);
      }

      const { rows } = await client.query<AssignmentRow>(
        `INSERT INTO job_workers (job_id, worker_user_id, source)
         VALUES ($1, $2, 'DIRECT_ACCEPT')
         RETURNING id, job_id, worker_user_id, state, source, accepted_at, en_route_at,
                   arrived_at, started_at, completed_at, cancelled_at, earnings_cents, currency`,
        [jobId, worker.id],
      );
      const assignment = rows[0]!;
      const filled = job.workers_filled + 1;
      await client.query('UPDATE jobs SET workers_filled = $2, updated_at = now() WHERE id = $1', [
        jobId,
        filled,
      ]);
      await this.fsm.recordEvent(client, jobId, assignment.id, worker.id, 'job.worker_accepted', undefined, undefined, {
        workers_filled: filled,
        workers_needed: job.workers_needed,
      });

      let state = job.state;
      if (state === 'POSTED') {
        await this.fsm.transitionJob(client, jobId, 'POSTED', 'MATCHING', null, 'job.matching_started');
        state = 'MATCHING';
      }
      if (filled >= job.workers_needed) {
        await this.fsm.transitionJob(client, jobId, state, 'FILLED', null, 'job.filled');
      } else if (state === 'MATCHING') {
        await this.fsm.transitionJob(client, jobId, 'MATCHING', 'PARTIALLY_FILLED', null, 'job.partially_filled');
      }
      return assignment;
    });
  }

  /** Category verification requirements enforced server-side at accept time. */
  private async assertWorkerEligible(client: PoolClient, workerId: string, categoryId: string): Promise<void> {
    const { rows: profiles } = await client.query<{ user_id: string }>(
      'SELECT user_id FROM worker_profiles WHERE user_id = $1',
      [workerId],
    );
    if (profiles.length === 0) {
      throw new DomainError('REQUIREMENTS_NOT_MET', 'Create a worker profile first', 403, {
        missing: ['WORKER_PROFILE'],
      });
    }
    const { rows: cats } = await client.query<{
      requires_identity_verification: boolean;
      requires_background_check: boolean;
      min_worker_age: number | null;
    }>(
      'SELECT requires_identity_verification, requires_background_check, min_worker_age FROM categories WHERE id = $1',
      [categoryId],
    );
    const cat = cats[0]!;
    const missing: string[] = [];
    for (const [flag, type] of [
      [cat.requires_identity_verification, 'IDENTITY'],
      [cat.requires_background_check, 'BACKGROUND'],
    ] as const) {
      if (!flag) continue;
      const { rows } = await client.query(
        `SELECT 1 FROM verification_records
         WHERE user_id = $1 AND type = $2 AND status = 'PASSED'
           AND (expires_at IS NULL OR expires_at > now())`,
        [workerId, type],
      );
      if (rows.length === 0) missing.push(type);
    }
    if (missing.length > 0) {
      throw new DomainError(
        'REQUIREMENTS_NOT_MET',
        'This job category requires additional verification',
        403,
        { missing },
      );
    }
  }

  // ── Execution lifecycle ────────────────────────────────────────────────────

  async assignmentTransition(
    worker: RequestUser,
    assignmentId: string,
    to: Extract<AssignmentState, 'EN_ROUTE' | 'ARRIVED' | 'STARTED' | 'COMPLETED'>,
    dto?: ArrivedDto,
  ): Promise<AssignmentRow> {
    const eventType: Record<string, string> = {
      EN_ROUTE: 'assignment.en_route',
      ARRIVED: 'assignment.arrived',
      STARTED: 'assignment.started',
      COMPLETED: 'assignment.completed',
    };
    return this.db.withTransaction(async (client) => {
      const assignment = await this.jobs.findAssignmentById(assignmentId, client);
      if (!assignment || assignment.worker_user_id !== worker.id) {
        throw DomainError.notFound('Assignment not found');
      }
      const job = await this.jobs.lockJob(client, assignment.job_id);
      if (!job) throw DomainError.notFound('Job not found');

      // Idempotent retry: repeating the same transition returns current state.
      if (assignment.state === to) return assignment;

      await this.fsm.transitionAssignment(
        client,
        assignmentId,
        job.id,
        assignment.state,
        to,
        worker.id,
        eventType[to]!,
        to === 'ARRIVED' && dto?.location ? { reported_location: dto.location } : undefined,
      );
      if (to === 'ARRIVED' && dto?.location) {
        await client.query(
          `UPDATE job_workers SET arrival_location = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography WHERE id = $1`,
          [assignmentId, dto.location.lng, dto.location.lat],
        );
      }

      if (to === 'STARTED' && (job.state === 'FILLED' || job.state === 'PARTIALLY_FILLED')) {
        await this.fsm.transitionJob(client, job.id, job.state, 'IN_PROGRESS', null, 'job.started');
      }

      if (to === 'COMPLETED') {
        await this.setEarnings(client, job, assignmentId);
        const all = await this.jobs.listAssignmentsForJob(job.id, client);
        const active = all.filter((a) =>
          (ACTIVE_ASSIGNMENT_STATES as readonly string[]).includes(a.state),
        );
        if (active.length === 0 && job.state === 'IN_PROGRESS') {
          await this.fsm.transitionJob(
            client,
            job.id,
            'IN_PROGRESS',
            'COMPLETION_PENDING',
            null,
            'job.completion_pending',
          );
        }
      }
      return (await this.jobs.findAssignmentById(assignmentId, client))!;
    });
  }

  /** MVP earnings: FLAT = pay per worker; HOURLY = rate × estimated duration.
   *  Extra time requires a customer-approved scope change (PAYMENT_MODEL P-2). */
  private async setEarnings(client: PoolClient, job: JobRow, assignmentId: string): Promise<void> {
    const pay = Number(job.pay_cents);
    const earnings =
      job.pay_type === 'FLAT' ? pay : Math.round((pay * job.estimated_duration_minutes) / 60);
    await client.query(
      'UPDATE job_workers SET earnings_cents = $2, currency = $3 WHERE id = $1',
      [assignmentId, earnings, job.currency],
    );
  }

  async confirmCompletion(customer: RequestUser, jobId: string): Promise<JobRow> {
    return this.db.withTransaction(async (client) => {
      const job = await this.mustOwnJob(client, customer, jobId, true);
      if (job.state !== 'COMPLETION_PENDING') {
        throw DomainError.conflict('This job is not awaiting completion confirmation');
      }
      await this.fsm.transitionJob(
        client,
        jobId,
        'COMPLETION_PENDING',
        'COMPLETED',
        customer.id,
        'job.completion_confirmed',
      );
      // Payment initiation hooks in at the payments phase (job → PAYMENT_PENDING).
      return (await this.jobs.findById(jobId, client))!;
    });
  }

  // ── Cancellations (policy fees arrive with the payments phase) ────────────

  async cancelJob(customer: RequestUser, jobId: string, dto: CancelJobDto): Promise<JobRow> {
    if (!dto.acknowledged_consequences) {
      throw new DomainError('CANCELLATION_NOT_ACKNOWLEDGED', 'Consequences must be acknowledged', 422);
    }
    return this.db.withTransaction(async (client) => {
      const job = await this.mustOwnJob(client, customer, jobId, true);
      const cancellable: JobState[] = [
        'DRAFT', 'PENDING_REVIEW', 'POSTED', 'MATCHING', 'PARTIALLY_FILLED', 'FILLED', 'IN_PROGRESS',
      ];
      if (!cancellable.includes(job.state)) {
        throw DomainError.conflict(`A job in state ${job.state} cannot be cancelled`);
      }
      const assignments = await this.jobs.listAssignmentsForJob(jobId, client);
      for (const a of assignments) {
        if ((ACTIVE_ASSIGNMENT_STATES as readonly string[]).includes(a.state)) {
          await this.fsm.transitionAssignment(
            client, a.id, jobId, a.state, 'CANCELLED_BY_CUSTOMER', customer.id, 'assignment.cancelled_by_customer',
            { reason: dto.reason },
          );
        }
      }
      await this.fsm.transitionJob(client, jobId, job.state, 'CANCELLED', customer.id, 'job.cancelled', {
        reason: dto.reason,
        cancelled_by: 'CUSTOMER',
      });
      return (await this.jobs.findById(jobId, client))!;
    });
  }

  async cancelAssignment(worker: RequestUser, assignmentId: string, dto: CancelAssignmentDto): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const assignment = await this.jobs.findAssignmentById(assignmentId, client);
      if (!assignment || assignment.worker_user_id !== worker.id) {
        throw DomainError.notFound('Assignment not found');
      }
      const job = await this.jobs.lockJob(client, assignment.job_id);
      if (!job) throw DomainError.notFound('Job not found');
      if (!(ACTIVE_ASSIGNMENT_STATES as readonly string[]).includes(assignment.state)) {
        throw DomainError.conflict('This assignment is not active');
      }
      await this.fsm.transitionAssignment(
        client, assignmentId, job.id, assignment.state, 'CANCELLED_BY_WORKER', worker.id,
        'assignment.cancelled_by_worker', { reason: dto.reason, detail: dto.detail ?? null },
      );
      await client.query(
        'UPDATE jobs SET workers_filled = workers_filled - 1, updated_at = now() WHERE id = $1',
        [job.id],
      );
      await client.query(
        `UPDATE worker_profiles SET jobs_cancelled = jobs_cancelled + 1, updated_at = now() WHERE user_id = $1`,
        [worker.id],
      );
      // Reopen the slot for matching when the job hasn't started yet.
      if (job.state === 'FILLED') {
        await this.fsm.transitionJob(client, job.id, 'FILLED', 'MATCHING', null, 'job.slot_reopened');
      } else if (job.state === 'PARTIALLY_FILLED') {
        await this.fsm.transitionJob(client, job.id, 'PARTIALLY_FILLED', 'MATCHING', null, 'job.slot_reopened');
      }
    });
  }

  // ── Reads with viewer-dependent shaping ────────────────────────────────────

  async getJobForViewer(viewer: RequestUser, jobId: string): Promise<Record<string, unknown>> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw DomainError.notFound('Job not found');
    const isOwner = job.customer_user_id === viewer.id;
    const isAdmin = viewer.roles.includes('ADMIN');
    const assignment = await this.jobs.findAssignment(jobId, viewer.id);
    const isActiveWorker =
      assignment !== null &&
      (ACTIVE_ASSIGNMENT_STATES as readonly string[]).concat('COMPLETED').includes(assignment.state);

    if (isOwner || isAdmin) {
      const assignments = await this.jobs.listAssignmentsForJob(jobId);
      return { ...this.fullJobView(job), assignments };
    }
    if (isActiveWorker) {
      return { ...this.fullJobView(job), my_assignment: assignment };
    }
    // Everyone else: approximate location only, no address/access details.
    if (!(OPEN_STATES as string[]).includes(job.state)) {
      throw DomainError.notFound('Job not found');
    }
    return this.publicJobView(job);
  }

  fullJobView(job: JobRow): Record<string, unknown> {
    const { approx_lat, approx_lng, review_reasons, ...rest } = job as unknown as Record<string, unknown>;
    return { ...rest, pay_cents: Number(job.pay_cents) };
  }

  publicJobView(job: JobRow): Record<string, unknown> {
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      category_id: job.category_id,
      state: job.state,
      city: job.city,
      region: job.region,
      approx_location: { lat: job.approx_lat, lng: job.approx_lng },
      timezone: job.timezone,
      urgency: job.urgency,
      scheduled_start_at: job.scheduled_start_at,
      estimated_duration_minutes: job.estimated_duration_minutes,
      workers_needed: job.workers_needed,
      workers_filled: job.workers_filled,
      pay_type: job.pay_type,
      pay_cents: Number(job.pay_cents),
      currency: job.currency,
      required_equipment: job.required_equipment,
      physical_requirements: job.physical_requirements,
      created_at: job.created_at,
    };
  }

  async getTimelineForViewer(viewer: RequestUser, jobId: string): Promise<Array<Record<string, unknown>>> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw DomainError.notFound('Job not found');
    const isOwner = job.customer_user_id === viewer.id;
    const isAdmin = viewer.roles.includes('ADMIN');
    const assignment = await this.jobs.findAssignment(jobId, viewer.id);
    if (!isOwner && !isAdmin && !assignment) throw DomainError.notFound('Job not found');
    return this.jobs.getTimeline(jobId);
  }

  private async mustOwnJob(
    client: PoolClient,
    customer: RequestUser,
    jobId: string,
    lock = false,
  ): Promise<JobRow> {
    const job = lock ? await this.jobs.lockJob(client, jobId) : await this.jobs.findById(jobId, client);
    if (!job || job.customer_user_id !== customer.id) {
      // 404 (not 403) so outsiders cannot confirm the job exists.
      throw DomainError.notFound('Job not found');
    }
    return job;
  }
}
