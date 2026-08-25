import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { JobRow, JOB_SELECT } from './jobs.repository';
import { DiscoveryQueryDto } from './dto';

interface DiscoveryCursor {
  d: number; // distance meters of last item
  id: string;
}

function encodeCursor(c: DiscoveryCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(raw: string): DiscoveryCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as DiscoveryCursor;
    if (typeof parsed.d !== 'number' || typeof parsed.id !== 'string') throw new Error();
    return parsed;
  } catch {
    throw DomainError.validation('Invalid cursor');
  }
}

/**
 * Worker-facing nearby-job discovery (Phase 6). PostGIS ST_DWithin against the
 * exact location (server-side only); responses expose ONLY the obfuscated
 * approx_location. Distance-ordered keyset pagination.
 */
@Injectable()
export class DiscoveryService {
  constructor(private readonly db: DatabaseService) {}

  async nearbyJobs(query: DiscoveryQueryDto): Promise<{ items: Array<Record<string, unknown>>; next_cursor: string | null }> {
    const limit = query.limit ?? 20;
    const radius = query.radius_m ?? 16093;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const { rows } = await this.db.query<JobRow & { distance_m: number }>(
      `SELECT ${JOB_SELECT},
              ST_Distance(j.location, ref.point) AS distance_m
       FROM jobs j,
            (SELECT ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography AS point) ref
       WHERE j.state IN ('POSTED','MATCHING','PARTIALLY_FILLED')
         AND j.review_status IN ('NONE','APPROVED')
         AND ST_DWithin(j.location, ref.point, $3)
         AND ($4::uuid IS NULL OR j.category_id = $4::uuid)
         AND ($5::bigint IS NULL OR j.pay_cents >= $5::bigint)
         AND ($6::timestamptz IS NULL OR j.scheduled_start_at >= $6::timestamptz OR j.scheduled_start_at IS NULL)
         AND ($7::timestamptz IS NULL OR j.scheduled_start_at <= $7::timestamptz)
         AND (j.scheduled_start_at IS NULL OR j.scheduled_start_at > now() - interval '2 hours')
         AND ($8::float8 IS NULL OR (ST_Distance(j.location, ref.point), j.id::text) > ($8::float8, $9::text))
       ORDER BY ST_Distance(j.location, ref.point), j.id
       LIMIT $10`,
      [
        query.lng,
        query.lat,
        radius,
        query.category_id ?? null,
        query.min_pay_cents ?? null,
        query.start_after ?? null,
        query.start_before ?? null,
        cursor?.d ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );

    const page = rows.slice(0, limit);
    const items = page.map((j) => ({
      id: j.id,
      title: j.title,
      category_id: j.category_id,
      state: j.state,
      city: j.city,
      region: j.region,
      approx_location: { lat: j.approx_lat, lng: j.approx_lng },
      distance_m: Math.round(j.distance_m),
      urgency: j.urgency,
      scheduled_start_at: j.scheduled_start_at,
      estimated_duration_minutes: j.estimated_duration_minutes,
      workers_needed: j.workers_needed,
      workers_filled: j.workers_filled,
      pay_type: j.pay_type,
      pay_cents: Number(j.pay_cents),
      currency: j.currency,
      created_at: j.created_at,
    }));
    const next =
      rows.length > limit && page.length > 0
        ? encodeCursor({ d: page[page.length - 1]!.distance_m, id: page[page.length - 1]!.id })
        : null;
    return { items, next_cursor: next };
  }

  /** Map pins — approximate locations only, hard-capped. */
  async mapPins(query: DiscoveryQueryDto): Promise<{ items: Array<Record<string, unknown>> }> {
    const radius = query.radius_m ?? 16093;
    const { rows } = await this.db.query<{
      id: string; title: string; approx_lat: number; approx_lng: number; pay_cents: string;
      pay_type: string; workers_needed: number; workers_filled: number; category_id: string;
    }>(
      `SELECT j.id, j.title, j.category_id, j.pay_cents, j.pay_type, j.workers_needed, j.workers_filled,
              ST_Y(j.approx_location::geometry) AS approx_lat,
              ST_X(j.approx_location::geometry) AS approx_lng
       FROM jobs j
       WHERE j.state IN ('POSTED','MATCHING','PARTIALLY_FILLED')
         AND j.review_status IN ('NONE','APPROVED')
         AND ST_DWithin(j.location, ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography, $3)
         AND ($4::uuid IS NULL OR j.category_id = $4::uuid)
       LIMIT 200`,
      [query.lng, query.lat, radius, query.category_id ?? null],
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        category_id: r.category_id,
        approx_location: { lat: r.approx_lat, lng: r.approx_lng },
        pay_type: r.pay_type,
        pay_cents: Number(r.pay_cents),
        workers_needed: r.workers_needed,
        workers_filled: r.workers_filled,
      })),
    };
  }

  /**
   * Deterministic pricing suggestion (PRD §14): interquartile band of completed
   * jobs in the category within 25 mi over the last 90 days. Honest null when
   * there is not enough local data (no fake "AI pricing").
   */
  async pricingSuggestion(categoryId: string, lat: number, lng: number): Promise<Record<string, unknown>> {
    const { rows } = await this.db.query<{ n: string; p25: number | null; p75: number | null }>(
      `SELECT count(*) AS n,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY pay_cents) AS p25,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY pay_cents) AS p75
       FROM jobs
       WHERE category_id = $1
         AND state IN ('COMPLETED','PAYMENT_PENDING','PAID','CLOSED')
         AND completed_at > now() - interval '90 days'
         AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography, 40234)`,
      [categoryId, lng, lat],
    );
    const row = rows[0]!;
    const sample = Number(row.n);
    if (sample < 5 || row.p25 === null || row.p75 === null) {
      return { available: false, reason: 'Not enough completed local jobs in this category yet', sample_size: sample };
    }
    return {
      available: true,
      sample_size: sample,
      suggested_min_cents: Math.round(row.p25),
      suggested_max_cents: Math.round(row.p75),
      basis: 'Completed jobs in this category within 25 miles, last 90 days',
    };
  }
}
