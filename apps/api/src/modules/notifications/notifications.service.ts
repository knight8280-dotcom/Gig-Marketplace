import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RequestUser } from '../../common/auth.decorators';

export type NotificationCategory = 'TRANSACTIONAL' | 'JOB_ALERTS' | 'MARKETING';

/**
 * Notification records + preference checks (Phase 14). Delivery adapters:
 * in-app records always; push delivery via Expo arrives with the mobile app —
 * until then dispatch logs through the dev adapter (clearly labeled, no fake
 * delivery claims: sent_at is only set when a channel actually accepted it).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly db: DatabaseService) {}

  async notify(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
    category: NotificationCategory = 'TRANSACTIONAL',
  ): Promise<void> {
    // Marketing respects opt-outs; critical transactional notices are always
    // recorded in-app (PRD §41).
    if (category === 'MARKETING') {
      const { rows } = await this.db.query<{ enabled: boolean }>(
        `SELECT enabled FROM notification_preferences
         WHERE user_id = $1 AND channel = 'PUSH' AND category = 'MARKETING'`,
        [userId],
      );
      if (rows[0] && !rows[0].enabled) return;
    }
    await this.db.query(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, body, JSON.stringify(data)],
    );
    // Dev push adapter: log only. Real Expo push dispatch is wired with the
    // mobile app (device_tokens table is ready).
    this.logger.log(`[DEV PUSH — not actually sent] user=${userId} type=${type} title="${title}"`);
  }

  async list(user: RequestUser, limit: number, cursor: string | null) {
    const { rows } = await this.db.query(
      `SELECT id, type, title, body, data, created_at, read_at
       FROM notifications
       WHERE user_id = $1 AND ($2::uuid IS NULL OR id < $2::uuid)
       ORDER BY created_at DESC, id DESC LIMIT $3`,
      [user.id, cursor, limit],
    );
    const { rows: unread } = await this.db.query<{ n: string }>(
      'SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [user.id],
    );
    return {
      items: rows,
      unread_count: Number(unread[0]!.n),
      next_cursor: rows.length === limit ? (rows[rows.length - 1] as { id: string }).id : null,
    };
  }

  async markRead(user: RequestUser, ids: string[] | null): Promise<void> {
    await this.db.query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND read_at IS NULL AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
      [user.id, ids],
    );
  }

  async getPreferences(user: RequestUser) {
    const { rows } = await this.db.query(
      'SELECT channel, category, enabled FROM notification_preferences WHERE user_id = $1',
      [user.id],
    );
    return rows;
  }

  async setPreference(user: RequestUser, channel: string, category: string, enabled: boolean): Promise<void> {
    await this.db.query(
      `INSERT INTO notification_preferences (user_id, channel, category, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, channel, category) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [user.id, channel, category, enabled],
    );
  }

  async registerDeviceToken(user: RequestUser, platform: string, token: string): Promise<void> {
    await this.db.query(
      `INSERT INTO device_tokens (user_id, platform, token)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, last_seen_at = now(), disabled_at = NULL`,
      [user.id, platform, token],
    );
  }
}
