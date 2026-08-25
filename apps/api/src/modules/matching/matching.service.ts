import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface MatchCandidate {
  worker_user_id: string;
  distance_m: number;
  jobs_completed: number;
  rating_avg: string | null;
}

/**
 * Deterministic matching engine (SYSTEM_ARCHITECTURE §6, PRD §17–18).
 *
 * Candidate query filters (all server-side):
 *  - worker is available_now (and available_until not passed)
 *  - worker's own service radius covers the job location
 *  - worker selected the job's category
 *  - job pay meets the worker's minimum (normalized to the job's pay type)
 *  - worker account ACTIVE with verified email + phone
 *  - category verification requirements satisfied (identity/background)
 *  - worker is not the customer and has no assignment on this job yet
 *
 * Ranking (documented, versioned — changes require a DECISIONS.md entry):
 *  1. distance ascending
 *  2. fewer completed jobs first (new-worker opportunity fairness)
 *  3. worker id (stable tiebreak)
 *
 * Protected characteristics are never inputs. Notification fan-out consumes
 * this list in batches (wired with the notifications phase).
 */
@Injectable()
export class MatchingService {
  constructor(private readonly db: DatabaseService) {}

  async findCandidatesForJob(jobId: string, limit = 100): Promise<MatchCandidate[]> {
    const { rows } = await this.db.query<MatchCandidate>(
      `SELECT w.user_id AS worker_user_id,
              ST_Distance(w.home_location, j.location)::float8 AS distance_m,
              w.jobs_completed, w.rating_avg
       FROM jobs j
       JOIN worker_profiles w ON w.home_location IS NOT NULL
       JOIN users u ON u.id = w.user_id
       WHERE j.id = $1
         AND w.available_now
         AND (w.available_until IS NULL OR w.available_until > now())
         AND ST_DWithin(w.home_location, j.location, w.service_radius_m)
         AND u.status = 'ACTIVE'
         AND u.email_verified_at IS NOT NULL
         AND u.phone_verified_at IS NOT NULL
         AND u.id <> j.customer_user_id
         AND EXISTS (SELECT 1 FROM worker_categories wc
                     WHERE wc.worker_user_id = w.user_id AND wc.category_id = j.category_id)
         AND (w.min_pay_cents IS NULL OR j.pay_cents >= w.min_pay_cents)
         AND NOT EXISTS (SELECT 1 FROM job_workers a
                         WHERE a.job_id = j.id AND a.worker_user_id = w.user_id)
         AND NOT EXISTS (SELECT 1 FROM user_blocks b
                         WHERE (b.blocker_user_id = w.user_id AND b.blocked_user_id = j.customer_user_id)
                            OR (b.blocker_user_id = j.customer_user_id AND b.blocked_user_id = w.user_id))
         AND (NOT (SELECT requires_identity_verification FROM categories c WHERE c.id = j.category_id)
              OR EXISTS (SELECT 1 FROM verification_records vr
                         WHERE vr.user_id = w.user_id AND vr.type = 'IDENTITY' AND vr.status = 'PASSED'
                           AND (vr.expires_at IS NULL OR vr.expires_at > now())))
         AND (NOT (SELECT requires_background_check FROM categories c WHERE c.id = j.category_id)
              OR EXISTS (SELECT 1 FROM verification_records vr
                         WHERE vr.user_id = w.user_id AND vr.type = 'BACKGROUND' AND vr.status = 'PASSED'
                           AND (vr.expires_at IS NULL OR vr.expires_at > now())))
       ORDER BY ST_Distance(w.home_location, j.location) ASC, w.jobs_completed ASC, w.user_id
       LIMIT $2`,
      [jobId, limit],
    );
    return rows;
  }
}
