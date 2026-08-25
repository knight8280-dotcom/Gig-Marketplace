import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { RequestUser } from '../../common/auth.decorators';
import { JobsRepository } from '../jobs/jobs.repository';
import { SettingsService } from '../settings/settings.service';

export interface SubmitRatingInput {
  overall: number;
  reliability?: number;
  communication?: number;
  professionalism?: number;
  accuracy?: number;
  comment?: string;
}

/** Job states in which rating is allowed (work finished). */
const RATEABLE_JOB_STATES = ['COMPLETED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'];

@Injectable()
export class RatingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsRepository,
    private readonly settings: SettingsService,
  ) {}

  async submit(user: RequestUser, assignmentId: string, input: SubmitRatingInput) {
    const assignment = await this.jobs.findAssignmentById(assignmentId);
    if (!assignment) throw DomainError.notFound('Assignment not found');
    const job = await this.jobs.findById(assignment.job_id);
    if (!job) throw DomainError.notFound('Job not found');

    let direction: 'CUSTOMER_TO_WORKER' | 'WORKER_TO_CUSTOMER';
    let rateeId: string;
    if (user.id === job.customer_user_id) {
      direction = 'CUSTOMER_TO_WORKER';
      rateeId = assignment.worker_user_id;
    } else if (user.id === assignment.worker_user_id) {
      direction = 'WORKER_TO_CUSTOMER';
      rateeId = job.customer_user_id;
    } else {
      throw DomainError.notFound('Assignment not found');
    }

    if (assignment.state !== 'COMPLETED' || !RATEABLE_JOB_STATES.includes(job.state)) {
      throw DomainError.conflict('Rating opens after the job is completed');
    }

    return this.db.withTransaction(async (client) => {
      let ratingId: string;
      try {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO ratings
             (job_id, assignment_id, rater_user_id, ratee_user_id, direction,
              overall, reliability, communication, professionalism, accuracy, comment)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            job.id, assignmentId, user.id, rateeId, direction,
            input.overall, input.reliability ?? null, input.communication ?? null,
            input.professionalism ?? null, input.accuracy ?? null, input.comment ?? null,
          ],
        );
        ratingId = rows[0]!.id;
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw DomainError.conflict('You already rated this job');
        }
        throw err;
      }

      // Double-blind: both directions submitted → both become visible now.
      const { rows: pair } = await client.query(
        'SELECT id FROM ratings WHERE assignment_id = $1',
        [assignmentId],
      );
      if (pair.length === 2) {
        await client.query('UPDATE ratings SET visible_at = now() WHERE assignment_id = $1', [assignmentId]);
      }

      await this.recomputeAggregates(client, rateeId, direction);
      // The rater's own ratee aggregates may also unlock (pair became visible).
      if (pair.length === 2) {
        await this.recomputeAggregates(
          client,
          user.id,
          direction === 'CUSTOMER_TO_WORKER' ? 'WORKER_TO_CUSTOMER' : 'CUSTOMER_TO_WORKER',
        );
      }
      return { id: ratingId, direction, visible: pair.length === 2 };
    });
  }

  /** Visible = mutually submitted OR blind window elapsed (config). */
  private visibilityCondition(blindDays: number): string {
    return `(visible_at IS NOT NULL OR created_at < now() - make_interval(days => ${Number(blindDays)}))`;
  }

  private async recomputeAggregates(
    client: import('pg').PoolClient,
    userId: string,
    direction: string,
  ): Promise<void> {
    const blindDays = await this.settings.get<number>('rating_blind_window_days');
    const table = direction === 'CUSTOMER_TO_WORKER' ? 'worker_profiles' : 'customer_profiles';
    await client.query(
      `UPDATE ${table} p SET
         rating_avg = sub.avg, rating_count = sub.count, updated_at = now()
       FROM (SELECT round(avg(overall)::numeric, 2) AS avg, count(*)::int AS count
             FROM ratings
             WHERE ratee_user_id = $1 AND direction = $2
               AND ${this.visibilityCondition(blindDays)}) sub
       WHERE p.user_id = $1`,
      [userId, direction],
    );
  }

  async listReceived(user: RequestUser) {
    const blindDays = await this.settings.get<number>('rating_blind_window_days');
    const { rows } = await this.db.query(
      `SELECT id, job_id, direction, overall, reliability, communication,
              professionalism, accuracy, comment, created_at
       FROM ratings
       WHERE ratee_user_id = $1 AND ${this.visibilityCondition(blindDays)}
       ORDER BY created_at DESC
       LIMIT 100`,
      [user.id],
    );
    return rows;
  }

  /** Ratings I still owe (completed assignments without my rating). */
  async listPending(user: RequestUser) {
    const { rows } = await this.db.query(
      `SELECT a.id AS assignment_id, a.job_id, j.title,
              CASE WHEN j.customer_user_id = $1 THEN 'CUSTOMER_TO_WORKER' ELSE 'WORKER_TO_CUSTOMER' END AS direction
       FROM job_workers a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.state = 'COMPLETED'
         AND j.state IN ('COMPLETED','PAYMENT_PENDING','PAID','CLOSED')
         AND (j.customer_user_id = $1 OR a.worker_user_id = $1)
         AND NOT EXISTS (SELECT 1 FROM ratings r
                         WHERE r.assignment_id = a.id AND r.rater_user_id = $1)
       ORDER BY a.completed_at DESC
       LIMIT 50`,
      [user.id],
    );
    return rows;
  }
}
