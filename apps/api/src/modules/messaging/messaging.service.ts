import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { RequestUser } from '../../common/auth.decorators';
import { JobsRepository, ACTIVE_ASSIGNMENT_STATES } from '../jobs/jobs.repository';

export interface ConversationRow {
  id: string;
  job_id: string;
  customer_user_id: string;
  worker_user_id: string;
  created_at: Date;
  closed_at: Date | null;
}

/** Messaging is read-only this long after a job reaches a terminal state. */
const MESSAGING_GRACE_DAYS = 14;

@Injectable()
export class MessagingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsRepository,
  ) {}

  /** A conversation exists per job per customer↔worker pair, opened at/after acceptance. */
  async ensureConversation(user: RequestUser, jobId: string, workerUserId?: string): Promise<ConversationRow> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw DomainError.notFound('Job not found');

    let worker: string;
    if (job.customer_user_id === user.id) {
      if (!workerUserId) throw DomainError.validation('worker_user_id is required');
      worker = workerUserId;
    } else {
      worker = user.id; // Worker opening a conversation with the customer.
    }

    const assignment = await this.jobs.findAssignment(jobId, worker);
    if (!assignment) throw DomainError.notFound('No assignment between these users on this job');
    if (job.customer_user_id !== user.id && worker !== user.id) {
      throw DomainError.notFound('No assignment between these users on this job');
    }

    const { rows } = await this.db.query<ConversationRow>(
      `INSERT INTO conversations (job_id, customer_user_id, worker_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id, worker_user_id) DO UPDATE SET job_id = EXCLUDED.job_id
       RETURNING *`,
      [jobId, job.customer_user_id, worker],
    );
    return rows[0]!;
  }

  async listMine(user: RequestUser): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.db.query(
      `SELECT c.*, j.title AS job_title, j.state AS job_state,
              (SELECT count(*) FROM messages m
                WHERE m.conversation_id = c.id AND m.read_at IS NULL
                  AND m.sender_user_id <> $1 AND m.hidden_at IS NULL) AS unread_count,
              (SELECT m.body FROM messages m
                WHERE m.conversation_id = c.id AND m.hidden_at IS NULL
                ORDER BY m.seq DESC LIMIT 1) AS last_message
       FROM conversations c
       JOIN jobs j ON j.id = c.job_id
       WHERE c.customer_user_id = $1 OR c.worker_user_id = $1
       ORDER BY c.created_at DESC
       LIMIT 100`,
      [user.id],
    );
    return rows;
  }

  async listMessages(user: RequestUser, conversationId: string, limit: number, cursorSeq: number | null) {
    const conversation = await this.mustBeParticipant(user, conversationId);
    const { rows } = await this.db.query(
      `SELECT id, seq, sender_user_id, body, created_at, read_at
       FROM messages
       WHERE conversation_id = $1 AND hidden_at IS NULL
         AND ($2::bigint IS NULL OR seq < $2::bigint)
       ORDER BY seq DESC
       LIMIT $3`,
      [conversation.id, cursorSeq, limit],
    );
    return {
      items: rows,
      next_cursor: rows.length === limit ? String((rows[rows.length - 1] as { seq: string }).seq) : null,
    };
  }

  async sendMessage(user: RequestUser, conversationId: string, body: string) {
    const conversation = await this.mustBeParticipant(user, conversationId);
    const other =
      conversation.customer_user_id === user.id
        ? conversation.worker_user_id
        : conversation.customer_user_id;

    const { rows: blocks } = await this.db.query(
      `SELECT 1 FROM user_blocks
       WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
          OR (blocker_user_id = $2 AND blocked_user_id = $1)`,
      [user.id, other],
    );
    if (blocks.length > 0) {
      throw DomainError.forbidden('Messaging is unavailable for this conversation');
    }

    await this.assertConversationWritable(conversation);

    const { rows } = await this.db.query(
      `INSERT INTO messages (conversation_id, sender_user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, seq, sender_user_id, body, created_at, read_at`,
      [conversation.id, user.id, body],
    );
    return rows[0]!;
  }

  async markRead(user: RequestUser, conversationId: string): Promise<void> {
    const conversation = await this.mustBeParticipant(user, conversationId);
    await this.db.query(
      `UPDATE messages SET read_at = now()
       WHERE conversation_id = $1 AND sender_user_id <> $2 AND read_at IS NULL`,
      [conversation.id, user.id],
    );
  }

  async reportMessage(user: RequestUser, messageId: string, reason: string): Promise<void> {
    const { rows } = await this.db.query<{ conversation_id: string }>(
      'SELECT conversation_id FROM messages WHERE id = $1',
      [messageId],
    );
    if (!rows[0]) throw DomainError.notFound('Message not found');
    await this.mustBeParticipant(user, rows[0].conversation_id);
    await this.db.query('UPDATE messages SET reported_at = now() WHERE id = $1', [messageId]);
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_table, entity_id, reason)
       VALUES ($1, 'USER', 'message.reported', 'messages', $2, $3)`,
      [user.id, messageId, reason],
    );
  }

  async blockUser(user: RequestUser, blockedUserId: string): Promise<void> {
    if (user.id === blockedUserId) throw DomainError.validation('You cannot block yourself');
    await this.db.query(
      `INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, blockedUserId],
    );
  }

  async unblockUser(user: RequestUser, blockedUserId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2',
      [user.id, blockedUserId],
    );
  }

  private async mustBeParticipant(user: RequestUser, conversationId: string): Promise<ConversationRow> {
    const { rows } = await this.db.query<ConversationRow>(
      'SELECT * FROM conversations WHERE id = $1',
      [conversationId],
    );
    const conversation = rows[0];
    // 404 (not 403) so outsiders cannot confirm the conversation exists.
    if (!conversation) throw DomainError.notFound('Conversation not found');
    if (conversation.customer_user_id !== user.id && conversation.worker_user_id !== user.id) {
      throw DomainError.notFound('Conversation not found');
    }
    return conversation;
  }

  private async assertConversationWritable(conversation: ConversationRow): Promise<void> {
    const job = await this.jobs.findById(conversation.job_id);
    if (!job) throw DomainError.notFound('Job not found');
    const terminal = ['CANCELLED', 'CLOSED', 'PAID', 'COMPLETED', 'PAYMENT_PENDING'].includes(job.state);
    if (!terminal) {
      const assignment = await this.jobs.findAssignment(job.id, conversation.worker_user_id);
      const active =
        assignment &&
        (ACTIVE_ASSIGNMENT_STATES as readonly string[]).concat('COMPLETED').includes(assignment.state);
      if (!active) throw DomainError.forbidden('Messaging is unavailable for this conversation');
      return;
    }
    const anchor = job.cancelled_at ?? job.completed_at ?? job.created_at;
    const cutoff = new Date(anchor).getTime() + MESSAGING_GRACE_DAYS * 24 * 3600 * 1000;
    if (Date.now() > cutoff) {
      throw DomainError.forbidden('This conversation is read-only now');
    }
  }
}
