import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/**
 * Configurable platform settings (platform_settings table) with code-level
 * defaults. Business rules read from here — never from hardcoded constants
 * scattered in services. Every write is audited by the admin controller.
 */
export const SETTING_DEFAULTS: Record<string, unknown> = {
  /** Hours the customer has to confirm completion before auto-confirm. */
  completion_auto_confirm_hours: 72,
  /** Cancellation policy thresholds/fees (evaluated by the policy engine, Phase 12). */
  cancellation_policy: {
    customer_free_cancel_hours_before_start: 4,
    customer_late_cancel_fee_bps: 2500, // 25% of job pay
    worker_grace_minutes_after_accept: 10,
  },
  /** Matching fan-out configuration (Phase 7). */
  matching: { batch_size: 25, batch_interval_sec: 120 },
  /** Ratings become mutually visible after this many days if only one side rated. */
  rating_blind_window_days: 14,
  /** Discovery hard limits. */
  discovery: { max_radius_m: 160934, default_radius_m: 16093 },
};

export type SettingKey = keyof typeof SETTING_DEFAULTS | string;

@Injectable()
export class SettingsService {
  constructor(private readonly db: DatabaseService) {}

  async get<T>(key: SettingKey): Promise<T> {
    const { rows } = await this.db.query<{ value: T }>(
      'SELECT value FROM platform_settings WHERE key = $1',
      [key],
    );
    if (rows[0]) return rows[0].value;
    if (key in SETTING_DEFAULTS) return SETTING_DEFAULTS[key] as T;
    throw new Error(`Unknown platform setting: ${key}`);
  }

  async set(key: SettingKey, value: unknown, updatedBy: string): Promise<void> {
    await this.db.query(
      `INSERT INTO platform_settings (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
         updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), updatedBy],
    );
  }
}
