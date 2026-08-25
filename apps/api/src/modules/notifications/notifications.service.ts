import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RequestUser } from '../../common/auth.decorators';

export type NotificationCategory = 'TRANSACTIONAL' | 'JOB_ALERTS' | 'MARKETING';

/** Expo push tokens look like ExponentPushToken[xxxx] / ExpoPushToken[xxxx]. */
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Notification records + preference checks (Phase 14). In-app records always;
 * device push via Expo's documented push HTTP API when real Expo tokens are
 * registered. sent_at is set only when the push service actually accepted the
 * message — no fake delivery claims.
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
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, type, title, body, JSON.stringify(data)],
    );
    await this.dispatchPush(rows[0]!.id, userId, title, body, data);
  }

  /** Expo push to the user's registered devices; failures never break callers. */
  private async dispatchPush(
    notificationId: string,
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const { rows: devices } = await this.db.query<{ token: string }>(
        'SELECT token FROM device_tokens WHERE user_id = $1 AND disabled_at IS NULL',
        [userId],
      );
      const valid = devices.map((d) => d.token).filter((t) => EXPO_TOKEN_RE.test(t));
      if (valid.length === 0) return; // No real devices (e.g. web/dev) — in-app record only.

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(valid.map((to) => ({ to, sound: 'default', title, body, data }))),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: Array<{ status: string; details?: { error?: string } }>;
      } | null;
      const tickets = payload?.data ?? [];
      const accepted = res.ok && tickets.some((t) => t.status === 'ok');
      await this.db.query(
        `UPDATE notifications SET ${accepted ? 'sent_at' : 'failed_at'} = now() WHERE id = $1`,
        [notificationId],
      );
      // Disable tokens the push service says are no longer registered.
      for (let i = 0; i < tickets.length; i++) {
        if (tickets[i]!.status === 'error' && tickets[i]!.details?.error === 'DeviceNotRegistered') {
          await this.db.query('UPDATE device_tokens SET disabled_at = now() WHERE token = $1', [valid[i]]);
        }
      }
    } catch (err) {
      this.logger.error(`Push dispatch failed for user ${userId}: ${(err as Error).message}`);
      await this.db
        .query('UPDATE notifications SET failed_at = now() WHERE id = $1', [notificationId])
        .catch(() => undefined);
    }
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
