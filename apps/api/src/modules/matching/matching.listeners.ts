import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { MatchingService } from './matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Matching fan-out (Phase 7 → 14 wiring): when a job opens for matching,
 * notify the top-ranked eligible nearby workers in a configurable batch.
 * MVP sends one ranked batch synchronously post-commit; interval-based batch
 * waves move to the queue worker when it is split out.
 */
@Injectable()
export class MatchingListeners {
  private readonly logger = new Logger(MatchingListeners.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly matching: MatchingService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  @OnEvent('job.opened_for_matching')
  onJobOpened(p: { jobId: string }): void {
    this.fanOut(p.jobId).catch((err) =>
      this.logger.error(`matching fan-out failed for ${p.jobId}: ${(err as Error).message}`),
    );
  }

  private async fanOut(jobId: string): Promise<void> {
    const config = await this.settings.get<{ batch_size: number }>('matching');
    const { rows } = await this.db.query<{ title: string; pay_cents: string; pay_type: string }>(
      `SELECT title, pay_cents, pay_type FROM jobs WHERE id = $1
         AND state IN ('POSTED','MATCHING','PARTIALLY_FILLED')`,
      [jobId],
    );
    const job = rows[0];
    if (!job) return;
    const candidates = await this.matching.findCandidatesForJob(jobId, config.batch_size);
    const pay =
      job.pay_type === 'FLAT'
        ? `$${(Number(job.pay_cents) / 100).toFixed(0)}`
        : `$${(Number(job.pay_cents) / 100).toFixed(0)}/h`;
    for (const candidate of candidates) {
      await this.notifications.notify(
        candidate.worker_user_id,
        'NEW_NEARBY_JOB',
        'New job near you',
        `${job.title} — ${pay}, ${(candidate.distance_m / 1609).toFixed(1)} mi away`,
        { job_id: jobId },
        'JOB_ALERTS',
      );
    }
    this.logger.log(`Notified ${candidates.length} candidate workers for job ${jobId}`);
  }
}
