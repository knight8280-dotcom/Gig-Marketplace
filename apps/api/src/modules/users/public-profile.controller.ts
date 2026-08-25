import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';

/**
 * Public marketplace card — the ONLY cross-user profile view. Deliberately
 * minimal: first name + last initial, ratings, counts, member-since, and real
 * verification badges. Never email, phone, addresses, or locations.
 */
@Controller('users')
export class PublicProfileController {
  constructor(private readonly db: DatabaseService) {}

  @Get(':id/public')
  async publicCard(@Param('id', ParseUUIDPipe) id: string) {
    const { rows } = await this.db.query<{
      id: string;
      created_at: Date;
      status: string;
      customer_display_name: string | null;
      customer_rating_avg: string | null;
      customer_rating_count: number | null;
      customer_jobs_completed: number | null;
      worker_display_name: string | null;
      worker_bio: string | null;
      worker_rating_avg: string | null;
      worker_rating_count: number | null;
      worker_jobs_completed: number | null;
      verifications: string[] | null;
    }>(
      `SELECT u.id, u.created_at, u.status,
              cp.display_name AS customer_display_name,
              cp.rating_avg   AS customer_rating_avg,
              cp.rating_count AS customer_rating_count,
              cp.jobs_completed AS customer_jobs_completed,
              wp.display_name AS worker_display_name,
              wp.bio          AS worker_bio,
              wp.rating_avg   AS worker_rating_avg,
              wp.rating_count AS worker_rating_count,
              wp.jobs_completed AS worker_jobs_completed,
              (SELECT array_agg(vr.type::text) FROM verification_records vr
                WHERE vr.user_id = u.id AND vr.status = 'PASSED') AS verifications
       FROM users u
       LEFT JOIN customer_profiles cp ON cp.user_id = u.id
       LEFT JOIN worker_profiles  wp ON wp.user_id = u.id
       WHERE u.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row || row.status !== 'ACTIVE') throw DomainError.notFound('User not found');

    const name = row.worker_display_name ?? row.customer_display_name;
    if (!name) throw DomainError.notFound('User not found');

    return {
      id: row.id,
      display_name: shortenName(name),
      member_since: row.created_at,
      verifications: row.verifications ?? [],
      worker: row.worker_display_name
        ? {
            bio: row.worker_bio,
            rating_avg: row.worker_rating_avg,
            rating_count: row.worker_rating_count,
            jobs_completed: row.worker_jobs_completed,
          }
        : null,
      customer: row.customer_display_name
        ? {
            rating_avg: row.customer_rating_avg,
            rating_count: row.customer_rating_count,
            jobs_completed: row.customer_jobs_completed,
          }
        : null,
    };
  }
}

/** "Alexandra Smith" → "Alexandra S." */
function shortenName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}
