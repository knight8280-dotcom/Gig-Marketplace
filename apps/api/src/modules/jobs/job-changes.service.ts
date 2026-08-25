import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { RequestUser } from '../../common/auth.decorators';
import { JobStateMachine } from './job-state-machine';
import { ACTIVE_ASSIGNMENT_STATES, JobsRepository } from './jobs.repository';
import { ProposeChangeDto } from './dto';

const CHANGEABLE_FIELDS = ['description', 'pay_cents', 'estimated_duration_minutes', 'scheduled_start_at'] as const;

/**
 * Scope protection (PRD §20): the original agreement is never silently
 * modified. Customers propose changes; every active worker must approve;
 * only then is the job updated — with the full diff preserved forever.
 */
@Injectable()
export class JobChangesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsRepository,
    private readonly fsm: JobStateMachine,
  ) {}

  async propose(customer: RequestUser, jobId: string, dto: ProposeChangeDto): Promise<Record<string, unknown>> {
    return this.db.withTransaction(async (client) => {
      const job = await this.jobs.lockJob(client, jobId);
      if (!job || job.customer_user_id !== customer.id) throw DomainError.notFound('Job not found');
      if (!['MATCHING', 'PARTIALLY_FILLED', 'FILLED', 'IN_PROGRESS'].includes(job.state)) {
        throw DomainError.conflict('This job cannot be changed in its current state');
      }
      const { rows: open } = await client.query(
        `SELECT 1 FROM job_changes WHERE job_id = $1 AND status = 'PROPOSED'`,
        [jobId],
      );
      if (open.length > 0) throw DomainError.conflict('There is already a pending change proposal');

      const changes: Record<string, { old: unknown; new: unknown }> = {};
      for (const field of CHANGEABLE_FIELDS) {
        const next = dto[field as keyof ProposeChangeDto];
        if (next === undefined) continue;
        const current = (job as unknown as Record<string, unknown>)[field];
        const currentNorm = field === 'pay_cents' ? Number(current) : current;
        if (String(currentNorm) !== String(next)) changes[field] = { old: currentNorm, new: next };
      }
      if (Object.keys(changes).length === 0) {
        throw DomainError.validation('The proposal contains no changes');
      }

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO job_changes (job_id, proposed_by, changes) VALUES ($1, $2, $3) RETURNING id`,
        [jobId, customer.id, JSON.stringify(changes)],
      );
      const changeId = rows[0]!.id;
      await this.fsm.recordEvent(client, jobId, null, customer.id, 'job.change_proposed', undefined, undefined, {
        change_id: changeId,
        changes,
      });

      const assignments = (await this.jobs.listAssignmentsForJob(jobId, client)).filter((a) =>
        (ACTIVE_ASSIGNMENT_STATES as readonly string[]).includes(a.state),
      );
      for (const a of assignments) {
        await client.query(
          'INSERT INTO job_change_approvals (job_change_id, assignment_id) VALUES ($1, $2)',
          [changeId, a.id],
        );
      }
      if (assignments.length === 0) {
        // No workers yet — the change applies immediately.
        await this.apply(client, jobId, changeId, changes, null);
      }
      return { id: changeId, job_id: jobId, changes, status: assignments.length === 0 ? 'APPROVED' : 'PROPOSED' };
    });
  }

  async decide(worker: RequestUser, changeId: string, approve: boolean): Promise<Record<string, unknown>> {
    return this.db.withTransaction(async (client) => {
      const { rows: changes } = await client.query<{
        id: string; job_id: string; changes: Record<string, { old: unknown; new: unknown }>; status: string;
      }>('SELECT id, job_id, changes, status FROM job_changes WHERE id = $1 FOR UPDATE', [changeId]);
      const change = changes[0];
      if (!change) throw DomainError.notFound('Change proposal not found');
      if (change.status !== 'PROPOSED') throw DomainError.conflict('This proposal is already decided');

      const assignment = await this.jobs.findAssignment(change.job_id, worker.id, client);
      if (!assignment) throw DomainError.notFound('Change proposal not found');

      const { rowCount } = await client.query(
        `UPDATE job_change_approvals SET decision = $3, decided_at = now()
         WHERE job_change_id = $1 AND assignment_id = $2 AND decision IS NULL`,
        [changeId, assignment.id, approve ? 'APPROVED' : 'DECLINED'],
      );
      if ((rowCount ?? 0) === 0) throw DomainError.conflict('You already responded to this proposal');

      await this.fsm.recordEvent(client, change.job_id, assignment.id, worker.id,
        approve ? 'job.change_approved_by_worker' : 'job.change_declined_by_worker',
        undefined, undefined, { change_id: changeId });

      if (!approve) {
        await client.query(
          `UPDATE job_changes SET status = 'DECLINED', decided_at = now() WHERE id = $1`,
          [changeId],
        );
        await this.fsm.recordEvent(client, change.job_id, null, null, 'job.change_declined', undefined, undefined, {
          change_id: changeId,
        });
        return { id: changeId, status: 'DECLINED' };
      }

      const { rows: pending } = await client.query(
        `SELECT 1 FROM job_change_approvals WHERE job_change_id = $1 AND decision IS NULL`,
        [changeId],
      );
      if (pending.length === 0) {
        await client.query('SELECT id FROM jobs WHERE id = $1 FOR UPDATE', [change.job_id]);
        await this.apply(client, change.job_id, changeId, change.changes, null);
        return { id: changeId, status: 'APPROVED' };
      }
      return { id: changeId, status: 'PROPOSED', pending_approvals: pending.length };
    });
  }

  async list(viewer: RequestUser, jobId: string): Promise<Array<Record<string, unknown>>> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw DomainError.notFound('Job not found');
    const assignment = await this.jobs.findAssignment(jobId, viewer.id);
    if (job.customer_user_id !== viewer.id && !assignment && !viewer.roles.includes('ADMIN')) {
      throw DomainError.notFound('Job not found');
    }
    const { rows } = await this.jobs.db.query(
      `SELECT c.id, c.changes, c.status, c.created_at, c.decided_at,
              COALESCE(json_agg(json_build_object('assignment_id', a.assignment_id, 'decision', a.decision))
                FILTER (WHERE a.assignment_id IS NOT NULL), '[]') AS approvals
       FROM job_changes c LEFT JOIN job_change_approvals a ON a.job_change_id = c.id
       WHERE c.job_id = $1 GROUP BY c.id ORDER BY c.created_at DESC`,
      [jobId],
    );
    return rows;
  }

  private async apply(
    client: import('pg').PoolClient,
    jobId: string,
    changeId: string,
    changes: Record<string, { old: unknown; new: unknown }>,
    actorUserId: string | null,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [jobId];
    let i = 2;
    for (const field of CHANGEABLE_FIELDS) {
      if (changes[field]) {
        sets.push(`${field} = $${i}`);
        params.push(changes[field].new);
        i += 1;
      }
    }
    if (sets.length > 0) {
      await client.query(`UPDATE jobs SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
    }
    await client.query(
      `UPDATE job_changes SET status = 'APPROVED', decided_at = now() WHERE id = $1`,
      [changeId],
    );
    await this.fsm.recordEvent(client, jobId, null, actorUserId, 'job.change_applied', undefined, undefined, {
      change_id: changeId,
      changes,
    });
  }
}
