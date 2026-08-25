import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { AssignmentState, JobState } from '@gig/shared';
import { DatabaseService } from '../../database/database.service';
import { CreateJobDto } from './dto';

export interface JobRow {
  id: string;
  customer_user_id: string;
  category_id: string;
  title: string;
  description: string;
  state: JobState;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  lat: number;
  lng: number;
  approx_lat: number;
  approx_lng: number;
  timezone: string;
  urgency: string;
  scheduled_start_at: Date | null;
  estimated_duration_minutes: number;
  workers_needed: number;
  workers_filled: number;
  pay_type: 'FLAT' | 'HOURLY';
  pay_cents: string;
  currency: string;
  required_equipment: string[];
  physical_requirements: string | null;
  special_instructions: string | null;
  access_instructions: string | null;
  review_status: string;
  review_reasons: string[] | null;
  posted_at: Date | null;
  filled_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

export interface AssignmentRow {
  id: string;
  job_id: string;
  worker_user_id: string;
  state: AssignmentState;
  source: string;
  accepted_at: Date;
  en_route_at: Date | null;
  arrived_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  earnings_cents: string | null;
  currency: string;
}

export const JOB_SELECT = `
  j.id, j.customer_user_id, j.category_id, j.title, j.description, j.state,
  j.address_line1, j.address_line2, j.city, j.region, j.postal_code, j.country,
  ST_Y(j.location::geometry) AS lat, ST_X(j.location::geometry) AS lng,
  ST_Y(j.approx_location::geometry) AS approx_lat, ST_X(j.approx_location::geometry) AS approx_lng,
  j.timezone, j.urgency, j.scheduled_start_at, j.estimated_duration_minutes,
  j.workers_needed, j.workers_filled, j.pay_type, j.pay_cents, j.currency,
  j.required_equipment, j.physical_requirements, j.special_instructions,
  j.access_instructions, j.review_status, j.review_reasons,
  j.posted_at, j.filled_at, j.completed_at, j.cancelled_at, j.created_at`;

const ASSIGNMENT_SELECT = `
  id, job_id, worker_user_id, state, source, accepted_at, en_route_at, arrived_at,
  started_at, completed_at, cancelled_at, earnings_cents, currency`;

export const ACTIVE_ASSIGNMENT_STATES = [
  'ACCEPTED',
  'CONFIRMED',
  'EN_ROUTE',
  'ARRIVED',
  'STARTED',
] as const;

@Injectable()
export class JobsRepository {
  constructor(readonly db: DatabaseService) {}

  async insertJob(
    client: PoolClient,
    customerId: string,
    dto: CreateJobDto,
    state: JobState,
    reviewStatus: string,
    reviewReasons: string[],
  ): Promise<JobRow> {
    const { rows } = await client.query<JobRow>(
      `INSERT INTO jobs
         (customer_user_id, category_id, title, description, state,
          address_line1, address_line2, city, region, postal_code, country,
          location, approx_location, timezone, urgency, scheduled_start_at,
          estimated_duration_minutes, workers_needed, pay_type, pay_cents,
          required_equipment, physical_requirements, special_instructions,
          access_instructions, review_status, review_reasons,
          posted_at)
       SELECT $1::uuid, $2::uuid, $3::text, $4, $5::job_state,
              $6, $7, $8, $9, $10, $11,
              loc,
              -- Deterministic ~150–350 m obfuscation for pre-acceptance privacy.
              ST_Project(loc, 150 + abs(hashtext($3::text || ($1::uuid)::text)) % 200,
                         radians(abs(hashtext(($1::uuid)::text || $3::text)) % 360))::geography,
              $14, $15::job_urgency, $16,
              $17, $18, $19::pay_type, $20,
              COALESCE($21::text[], '{}'::text[]), $22, $23,
              $24, $25::job_review_status, $26::text[],
              CASE WHEN $5::job_state IN ('POSTED','MATCHING') THEN now() END
       FROM (SELECT ST_SetSRID(ST_MakePoint($12::float8, $13::float8), 4326)::geography AS loc) AS l
       RETURNING id`,
      [
        customerId,
        dto.category_id,
        dto.title,
        dto.description,
        state,
        dto.address_line1,
        dto.address_line2 ?? null,
        dto.city,
        dto.region,
        dto.postal_code,
        dto.country ?? 'US',
        dto.location.lng,
        dto.location.lat,
        dto.timezone,
        dto.urgency,
        dto.scheduled_start_at ?? null,
        dto.estimated_duration_minutes,
        dto.workers_needed,
        dto.pay_type,
        dto.pay_cents,
        dto.required_equipment ?? null,
        dto.physical_requirements ?? null,
        dto.special_instructions ?? null,
        dto.access_instructions ?? null,
        reviewStatus,
        reviewReasons,
      ],
    );
    return (await this.findById((rows[0] as unknown as { id: string }).id, client))!;
  }

  async findById(id: string, client?: PoolClient): Promise<JobRow | null> {
    const q = `SELECT ${JOB_SELECT} FROM jobs j WHERE j.id = $1`;
    const { rows } = client
      ? await client.query<JobRow>(q, [id])
      : await this.db.query<JobRow>(q, [id]);
    return rows[0] ?? null;
  }

  /** Lock the job row for a state-changing operation. */
  async lockJob(client: PoolClient, id: string): Promise<JobRow | null> {
    await client.query('SELECT id FROM jobs WHERE id = $1 FOR UPDATE', [id]);
    return this.findById(id, client);
  }

  async listByCustomer(customerId: string, states: string[] | null, limit: number, cursor: string | null): Promise<JobRow[]> {
    const { rows } = await this.db.query<JobRow>(
      `SELECT ${JOB_SELECT} FROM jobs j
       WHERE j.customer_user_id = $1
         AND ($2::job_state[] IS NULL OR j.state = ANY($2::job_state[]))
         AND ($3::uuid IS NULL OR j.id < $3::uuid)
       ORDER BY j.created_at DESC, j.id DESC
       LIMIT $4`,
      [customerId, states, cursor, limit],
    );
    return rows;
  }

  async findAssignment(jobId: string, workerId: string, client?: PoolClient): Promise<AssignmentRow | null> {
    const q = `SELECT ${ASSIGNMENT_SELECT} FROM job_workers WHERE job_id = $1 AND worker_user_id = $2`;
    const { rows } = client
      ? await client.query<AssignmentRow>(q, [jobId, workerId])
      : await this.db.query<AssignmentRow>(q, [jobId, workerId]);
    return rows[0] ?? null;
  }

  async findAssignmentById(id: string, client?: PoolClient): Promise<AssignmentRow | null> {
    const q = `SELECT ${ASSIGNMENT_SELECT} FROM job_workers WHERE id = $1`;
    const { rows } = client
      ? await client.query<AssignmentRow>(q, [id])
      : await this.db.query<AssignmentRow>(q, [id]);
    return rows[0] ?? null;
  }

  async listAssignmentsForJob(jobId: string, client?: PoolClient): Promise<AssignmentRow[]> {
    const q = `SELECT ${ASSIGNMENT_SELECT} FROM job_workers WHERE job_id = $1 ORDER BY accepted_at`;
    const { rows } = client
      ? await client.query<AssignmentRow>(q, [jobId])
      : await this.db.query<AssignmentRow>(q, [jobId]);
    return rows;
  }

  async listAssignmentsForWorker(
    workerId: string,
    states: string[] | null,
    limit: number,
    cursor: string | null,
  ): Promise<(AssignmentRow & { job: JobRow })[]> {
    const { rows: assignments } = await this.db.query<AssignmentRow>(
      `SELECT ${ASSIGNMENT_SELECT} FROM job_workers
       WHERE worker_user_id = $1
         AND ($2::assignment_state[] IS NULL OR state = ANY($2::assignment_state[]))
         AND ($3::uuid IS NULL OR id < $3::uuid)
       ORDER BY accepted_at DESC, id DESC
       LIMIT $4`,
      [workerId, states, cursor, limit],
    );
    if (assignments.length === 0) return [];
    const jobIds = assignments.map((a) => a.job_id);
    const { rows: jobs } = await this.db.query<JobRow>(
      `SELECT ${JOB_SELECT} FROM jobs j WHERE j.id = ANY($1::uuid[])`,
      [jobIds],
    );
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return assignments.map((a) => ({ ...a, job: byId.get(a.job_id)! }));
  }

  async getTimeline(jobId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.db.query(
      `SELECT id, assignment_id, actor_user_id, event_type, from_state, to_state, metadata, created_at
       FROM job_events WHERE job_id = $1 ORDER BY seq`,
      [jobId],
    );
    return rows;
  }

  /** Restricted-work screening: match active patterns against title+description. */
  async screenText(text: string): Promise<{ kind: 'BLOCK' | 'REVIEW'; reason: string }[]> {
    const { rows } = await this.db.query<{ kind: 'BLOCK' | 'REVIEW'; reason: string }>(
      `SELECT kind, reason FROM restricted_terms WHERE active AND $1 ~* pattern`,
      [text],
    );
    return rows;
  }
}
