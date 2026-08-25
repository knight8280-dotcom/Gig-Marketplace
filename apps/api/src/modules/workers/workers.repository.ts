import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { AvailabilityWindowDto, UpsertWorkerProfileDto } from './dto';

export interface WorkerProfileRow {
  user_id: string;
  display_name: string;
  bio: string | null;
  experience: string | null;
  transportation: string[];
  equipment: string[];
  languages: string[];
  service_radius_m: number;
  available_now: boolean;
  available_until: Date | null;
  min_pay_cents: string | null;
  currency: string;
  rating_avg: string | null;
  rating_count: number;
  jobs_completed: number;
  jobs_cancelled: number;
  created_at: Date;
}

/** home_location is deliberately excluded from every SELECT — private matching input. */
const WORKER_PROFILE_SELECT = `
  user_id, display_name, bio, experience, transportation, equipment, languages,
  service_radius_m, available_now, available_until, min_pay_cents, currency,
  rating_avg, rating_count, jobs_completed, jobs_cancelled, created_at`;

@Injectable()
export class WorkersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findProfile(userId: string): Promise<WorkerProfileRow | null> {
    const { rows } = await this.db.query<WorkerProfileRow>(
      `SELECT ${WORKER_PROFILE_SELECT} FROM worker_profiles WHERE user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async hasHomeLocation(userId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ has: boolean }>(
      'SELECT (home_location IS NOT NULL) AS has FROM worker_profiles WHERE user_id = $1',
      [userId],
    );
    return rows[0]?.has ?? false;
  }

  async upsertProfile(userId: string, dto: UpsertWorkerProfileDto): Promise<WorkerProfileRow> {
    const { rows } = await this.db.query<WorkerProfileRow>(
      `INSERT INTO worker_profiles
         (user_id, display_name, bio, experience, transportation, equipment, languages,
          service_radius_m, home_location, min_pay_cents)
       VALUES ($1, $2, $3, $4,
               COALESCE($5::worker_transport[], '{}'::worker_transport[]),
               COALESCE($6::text[], '{}'::text[]),
               COALESCE($7::text[], '{}'::text[]),
               COALESCE($8, 16093),
               CASE WHEN $9::float8 IS NOT NULL
                    THEN ST_SetSRID(ST_MakePoint($9::float8, $10::float8), 4326)::geography END,
               $11)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         bio = COALESCE(EXCLUDED.bio, worker_profiles.bio),
         experience = COALESCE(EXCLUDED.experience, worker_profiles.experience),
         transportation = CASE WHEN $5 IS NULL THEN worker_profiles.transportation ELSE EXCLUDED.transportation END,
         equipment = CASE WHEN $6 IS NULL THEN worker_profiles.equipment ELSE EXCLUDED.equipment END,
         languages = CASE WHEN $7 IS NULL THEN worker_profiles.languages ELSE EXCLUDED.languages END,
         service_radius_m = COALESCE($8, worker_profiles.service_radius_m),
         home_location = COALESCE(
           CASE WHEN $9::float8 IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint($9::float8, $10::float8), 4326)::geography END,
           worker_profiles.home_location),
         min_pay_cents = COALESCE($11, worker_profiles.min_pay_cents),
         updated_at = now()
       RETURNING ${WORKER_PROFILE_SELECT}`,
      [
        userId,
        dto.display_name,
        dto.bio ?? null,
        dto.experience ?? null,
        dto.transportation ?? null,
        dto.equipment ?? null,
        dto.languages ?? null,
        dto.service_radius_m ?? null,
        dto.home_location?.lng ?? null,
        dto.home_location?.lat ?? null,
        dto.min_pay_cents ?? null,
      ],
    );
    return rows[0]!;
  }

  async setSkills(userId: string, skillIds: string[]): Promise<void> {
    await this.db.withTransaction(async (client) => {
      await client.query('DELETE FROM worker_skills WHERE worker_user_id = $1', [userId]);
      if (skillIds.length > 0) {
        await client.query(
          `INSERT INTO worker_skills (worker_user_id, skill_id)
           SELECT $1, unnest($2::uuid[])`,
          [userId, skillIds],
        );
      }
    });
  }

  async setCategories(userId: string, categoryIds: string[]): Promise<void> {
    await this.db.withTransaction(async (client) => {
      // Only enabled categories are selectable.
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM categories WHERE id = ANY($1::uuid[]) AND enabled',
        [categoryIds],
      );
      if (rows.length !== categoryIds.length) {
        throw DomainError.validation('One or more categories are unavailable');
      }
      await client.query('DELETE FROM worker_categories WHERE worker_user_id = $1', [userId]);
      if (categoryIds.length > 0) {
        await client.query(
          `INSERT INTO worker_categories (worker_user_id, category_id)
           SELECT $1, unnest($2::uuid[])`,
          [userId, categoryIds],
        );
      }
    });
  }

  async getSkillIds(userId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ skill_id: string }>(
      'SELECT skill_id FROM worker_skills WHERE worker_user_id = $1',
      [userId],
    );
    return rows.map((r) => r.skill_id);
  }

  async getCategoryIds(userId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ category_id: string }>(
      'SELECT category_id FROM worker_categories WHERE worker_user_id = $1',
      [userId],
    );
    return rows.map((r) => r.category_id);
  }

  async setAvailability(
    userId: string,
    availableNow: boolean,
    availableUntil: string | null,
    windows: AvailabilityWindowDto[],
  ): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE worker_profiles SET available_now = $2, available_until = $3, updated_at = now()
         WHERE user_id = $1`,
        [userId, availableNow, availableUntil],
      );
      if ((rowCount ?? 0) === 0) throw DomainError.notFound('Create a worker profile first');
      await client.query('DELETE FROM worker_availability WHERE worker_user_id = $1', [userId]);
      for (const w of windows) {
        await client.query(
          `INSERT INTO worker_availability (worker_user_id, weekday, start_minute, end_minute, timezone)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, w.weekday, w.start_minute, w.end_minute, w.timezone],
        );
      }
    });
  }

  async getAvailability(userId: string): Promise<{
    available_now: boolean;
    available_until: Date | null;
    windows: AvailabilityWindowDto[];
  } | null> {
    const profile = await this.findProfile(userId);
    if (!profile) return null;
    const { rows } = await this.db.query<AvailabilityWindowDto>(
      `SELECT weekday, start_minute, end_minute, timezone FROM worker_availability
       WHERE worker_user_id = $1 ORDER BY weekday, start_minute`,
      [userId],
    );
    return {
      available_now: profile.available_now,
      available_until: profile.available_until,
      windows: rows,
    };
  }

  async acceptAgreement(userId: string, agreement: string, version: string): Promise<void> {
    await this.db.query(
      `INSERT INTO agreement_acceptances (user_id, agreement, version)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [userId, agreement, version],
    );
  }

  async getAgreements(userId: string): Promise<{ agreement: string; version: string; accepted_at: Date }[]> {
    const { rows } = await this.db.query<{ agreement: string; version: string; accepted_at: Date }>(
      'SELECT agreement, version, accepted_at FROM agreement_acceptances WHERE user_id = $1',
      [userId],
    );
    return rows;
  }
}
