import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  AssignmentState,
  JobState,
  isValidAssignmentTransition,
  isValidJobTransition,
} from '@gig/shared';
import { DomainError } from '../../common/errors';

/**
 * The ONLY code path that changes job/assignment states (ADR-006).
 * Every transition: validated against the shared transition tables, executed
 * inside the caller's transaction, and recorded as an immutable job_event.
 */
@Injectable()
export class JobStateMachine {
  async transitionJob(
    client: PoolClient,
    jobId: string,
    from: JobState,
    to: JobState,
    actorUserId: string | null,
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!isValidJobTransition(from, to)) {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Job cannot move from ${from} to ${to}`,
        409,
        { from, to },
      );
    }
    const { rowCount } = await client.query(
      `UPDATE jobs SET state = $2::job_state, updated_at = now(),
         posted_at    = CASE WHEN $2::job_state IN ('POSTED','MATCHING') AND posted_at IS NULL THEN now() ELSE posted_at END,
         filled_at    = CASE WHEN $2::job_state = 'FILLED' THEN now() ELSE filled_at END,
         completed_at = CASE WHEN $2::job_state = 'COMPLETED' THEN now() ELSE completed_at END,
         cancelled_at = CASE WHEN $2::job_state = 'CANCELLED' THEN now() ELSE cancelled_at END,
         closed_at    = CASE WHEN $2::job_state = 'CLOSED' THEN now() ELSE closed_at END
       WHERE id = $1 AND state = $3::job_state`,
      [jobId, to, from],
    );
    if ((rowCount ?? 0) === 0) {
      // State changed concurrently — caller must have locked the row; treat as conflict.
      throw DomainError.conflict('Job state changed concurrently — retry');
    }
    await this.recordEvent(client, jobId, null, actorUserId, eventType, from, to, metadata);
  }

  async transitionAssignment(
    client: PoolClient,
    assignmentId: string,
    jobId: string,
    from: AssignmentState,
    to: AssignmentState,
    actorUserId: string | null,
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!isValidAssignmentTransition(from, to)) {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Assignment cannot move from ${from} to ${to}`,
        409,
        { from, to },
      );
    }
    const timestampCol: Partial<Record<AssignmentState, string>> = {
      CONFIRMED: 'confirmed_at',
      EN_ROUTE: 'en_route_at',
      ARRIVED: 'arrived_at',
      STARTED: 'started_at',
      COMPLETED: 'completed_at',
      CANCELLED_BY_WORKER: 'cancelled_at',
      CANCELLED_BY_CUSTOMER: 'cancelled_at',
      NO_SHOW: 'cancelled_at',
      REMOVED: 'cancelled_at',
    };
    const col = timestampCol[to];
    const { rowCount } = await client.query(
      `UPDATE job_workers SET state = $2, updated_at = now()
         ${col ? `, ${col} = now()` : ''}
       WHERE id = $1 AND state = $3`,
      [assignmentId, to, from],
    );
    if ((rowCount ?? 0) === 0) {
      throw DomainError.conflict('Assignment state changed concurrently — retry');
    }
    await this.recordEvent(client, jobId, assignmentId, actorUserId, eventType, from, to, metadata);
  }

  async recordEvent(
    client: PoolClient,
    jobId: string,
    assignmentId: string | null,
    actorUserId: string | null,
    eventType: string,
    fromState?: string,
    toState?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO job_events (job_id, assignment_id, actor_user_id, event_type, from_state, to_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [jobId, assignmentId, actorUserId, eventType, fromState ?? null, toState ?? null, metadata ?? null],
    );
  }
}
