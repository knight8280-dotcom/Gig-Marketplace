import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { RequestUser } from '../../common/auth.decorators';
import { JobsRepository } from '../jobs/jobs.repository';
import { JobStateMachine } from '../jobs/job-state-machine';

const DISPUTABLE_JOB_STATES = [
  'IN_PROGRESS', 'COMPLETION_PENDING', 'COMPLETED', 'PAYMENT_PENDING', 'PAID', 'CANCELLED',
];

/**
 * Formal disputes (Phase 13). Opening a dispute moves the job to DISPUTED,
 * which pauses payout release (payments refuses non-payable states).
 * Resolution is admin-only, audited, and executes money via the payments
 * module ('dispute.resolved' event).
 */
@Injectable()
export class DisputesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsRepository,
    private readonly fsm: JobStateMachine,
    private readonly events: EventEmitter2,
  ) {}

  async open(
    user: RequestUser,
    input: { job_id: string; assignment_id?: string; category: string; description: string },
  ) {
    const result = await this.db.withTransaction(async (client) => {
      const job = await this.jobs.lockJob(client, input.job_id);
      if (!job) throw DomainError.notFound('Job not found');
      const assignment = await this.jobs.findAssignment(input.job_id, user.id, client);
      const isParty = job.customer_user_id === user.id || assignment !== null;
      if (!isParty) throw DomainError.notFound('Job not found');
      if (!DISPUTABLE_JOB_STATES.includes(job.state)) {
        throw DomainError.conflict('This job cannot be disputed in its current state');
      }
      const { rows: existing } = await client.query(
        `SELECT 1 FROM disputes WHERE job_id = $1 AND status IN ('OPEN','UNDER_REVIEW')`,
        [input.job_id],
      );
      if (existing.length > 0) throw DomainError.conflict('A dispute is already open for this job');

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO disputes (job_id, assignment_id, opened_by, category, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [input.job_id, input.assignment_id ?? null, user.id, input.category, input.description],
      );
      const disputeId = rows[0]!.id;
      await client.query(
        `INSERT INTO dispute_evidence (dispute_id, created_by, kind, note)
         VALUES ($1, $2, 'TEXT', $3)`,
        [disputeId, user.id, input.description],
      );
      await this.fsm.transitionJob(client, job.id, job.state, 'DISPUTED', user.id, 'job.disputed', {
        dispute_id: disputeId,
        category: input.category,
      });
      return { disputeId, customerUserId: job.customer_user_id };
    });
    this.events.emit('dispute.opened', { jobId: input.job_id, disputeId: result.disputeId });
    return this.getForUser(user, result.disputeId);
  }

  async addEvidence(user: RequestUser, disputeId: string, note: string) {
    const dispute = await this.findRow(disputeId);
    await this.assertParty(user, dispute);
    if (dispute.status === 'RESOLVED' || dispute.status === 'CLOSED') {
      throw DomainError.conflict('This dispute is closed');
    }
    await this.db.query(
      `INSERT INTO dispute_evidence (dispute_id, created_by, kind, note) VALUES ($1, $2, 'TEXT', $3)`,
      [disputeId, user.id, note],
    );
    return this.getForUser(user, disputeId);
  }

  async listMine(user: RequestUser) {
    const { rows } = await this.db.query(
      `SELECT d.id, d.job_id, d.category, d.status, d.resolution, d.created_at, d.resolved_at
       FROM disputes d
       JOIN jobs j ON j.id = d.job_id
       WHERE j.customer_user_id = $1
          OR EXISTS (SELECT 1 FROM job_workers a WHERE a.job_id = d.job_id AND a.worker_user_id = $1)
       ORDER BY d.created_at DESC LIMIT 100`,
      [user.id],
    );
    return rows;
  }

  async getForUser(user: RequestUser, disputeId: string) {
    const dispute = await this.findRow(disputeId);
    if (!user.roles.includes('ADMIN')) await this.assertParty(user, dispute);
    const { rows: evidence } = await this.db.query(
      `SELECT id, created_by, kind, note, ref_table, ref_id, created_at
       FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at`,
      [disputeId],
    );
    return { ...dispute, evidence };
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  async adminList(status?: string) {
    const { rows } = await this.db.query(
      `SELECT d.*, j.title AS job_title FROM disputes d
       JOIN jobs j ON j.id = d.job_id
       WHERE ($1::text IS NULL OR d.status = $1)
       ORDER BY d.created_at LIMIT 100`,
      [status ?? null],
    );
    return rows;
  }

  /** Full evidence view: dispute + text evidence + timeline + payments + messages. */
  async adminDetail(disputeId: string) {
    const dispute = await this.findRow(disputeId);
    const [evidence, timeline, payments, messages] = await Promise.all([
      this.db.query(`SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at`, [disputeId]),
      this.jobs.getTimeline(dispute.job_id),
      this.db.query(
        `SELECT id, kind, status, amount_cents, currency, refunded_cents, created_at
         FROM payments WHERE job_id = $1 ORDER BY created_at`,
        [dispute.job_id],
      ),
      this.db.query(
        `SELECT m.id, m.sender_user_id, m.body, m.created_at
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE c.job_id = $1 ORDER BY m.seq`,
        [dispute.job_id],
      ),
    ]);
    return {
      ...dispute,
      evidence: evidence.rows,
      timeline,
      payments: payments.rows,
      messages: messages.rows,
    };
  }

  async resolve(
    admin: RequestUser,
    disputeId: string,
    resolution: 'RELEASE' | 'REFUND_FULL' | 'REFUND_PARTIAL' | 'OTHER',
    reason: string,
    amountCents?: number,
  ) {
    if (resolution === 'REFUND_PARTIAL' && (!amountCents || amountCents <= 0)) {
      throw DomainError.validation('A positive amount is required for partial refunds');
    }
    const jobId = await this.db.withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; job_id: string; status: string }>(
        'SELECT id, job_id, status FROM disputes WHERE id = $1 FOR UPDATE',
        [disputeId],
      );
      const dispute = rows[0];
      if (!dispute) throw DomainError.notFound('Dispute not found');
      if (dispute.status === 'RESOLVED' || dispute.status === 'CLOSED') {
        throw DomainError.conflict('This dispute is already resolved');
      }
      await client.query(
        `UPDATE disputes SET status = 'RESOLVED', resolution = $2, resolution_amount_cents = $3,
           resolution_reason = $4, resolved_by = $5, resolved_at = now(), updated_at = now()
         WHERE id = $1`,
        [disputeId, resolution, amountCents ?? null, reason, admin.id],
      );
      const job = await this.jobs.lockJob(client, dispute.job_id);
      if (job?.state === 'DISPUTED') {
        // RELEASE → back to payment pipeline; refunds/other → closed.
        const target = resolution === 'RELEASE' ? 'PAYMENT_PENDING' : 'CLOSED';
        await this.fsm.transitionJob(client, job.id, 'DISPUTED', target, admin.id, 'job.dispute_resolved', {
          dispute_id: disputeId,
          resolution,
          reason,
        });
      }
      return dispute.job_id;
    });

    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_table, entity_id, reason, new_state)
       VALUES ($1, 'ADMIN', 'dispute.resolved', 'disputes', $2, $3, $4)`,
      [admin.id, disputeId, reason, JSON.stringify({ resolution, amount_cents: amountCents ?? null })],
    );
    this.events.emit('dispute.resolved', { jobId, disputeId, resolution, amountCents });
    return this.adminDetail(disputeId);
  }

  private async findRow(disputeId: string): Promise<{
    id: string; job_id: string; assignment_id: string | null; opened_by: string;
    category: string; status: string; description: string; resolution: string | null;
    resolution_amount_cents: string | null; resolution_reason: string | null;
    resolved_at: Date | null; created_at: Date;
  }> {
    const { rows } = await this.db.query(
      `SELECT id, job_id, assignment_id, opened_by, category, status, description,
              resolution, resolution_amount_cents, resolution_reason, resolved_at, created_at
       FROM disputes WHERE id = $1`,
      [disputeId],
    );
    if (!rows[0]) throw DomainError.notFound('Dispute not found');
    return rows[0] as never;
  }

  private async assertParty(user: RequestUser, dispute: { job_id: string }): Promise<void> {
    const job = await this.jobs.findById(dispute.job_id);
    const assignment = await this.jobs.findAssignment(dispute.job_id, user.id);
    if (job?.customer_user_id !== user.id && !assignment) {
      throw DomainError.notFound('Dispute not found');
    }
  }
}
