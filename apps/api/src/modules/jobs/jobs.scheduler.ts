import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { SettingsService } from '../settings/settings.service';
import { JobStateMachine } from './job-state-machine';
import { JobsRepository } from './jobs.repository';

/**
 * Scheduled job maintenance. MVP runs these crons in-process; they are
 * idempotent and safe to move to the dedicated worker process when the
 * deployment splits API/worker (SYSTEM_ARCHITECTURE §4).
 */
@Injectable()
export class JobsScheduler {
  private readonly logger = new Logger(JobsScheduler.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsRepository,
    private readonly fsm: JobStateMachine,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Auto-confirm completions the customer never responded to (documented,
   * still disputable afterward — PRD §22). Runs every 10 minutes.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async autoConfirmCompletions(): Promise<void> {
    const hours = await this.settings.get<number>('completion_auto_confirm_hours');
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT j.id FROM jobs j
       WHERE j.state = 'COMPLETION_PENDING'
         AND EXISTS (SELECT 1 FROM job_events e
                     WHERE e.job_id = j.id AND e.event_type = 'job.completion_pending'
                       AND e.created_at < now() - make_interval(hours => $1))
       LIMIT 50`,
      [hours],
    );
    for (const row of rows) {
      try {
        await this.db.withTransaction(async (client) => {
          const job = await this.jobs.lockJob(client, row.id);
          if (job?.state !== 'COMPLETION_PENDING') return;
          await this.fsm.transitionJob(
            client, row.id, 'COMPLETION_PENDING', 'COMPLETED', null,
            'job.completion_auto_confirmed', { after_hours: hours },
          );
        });
        this.events.emit('job.completion_confirmed', { jobId: row.id });
        this.logger.log(`Auto-confirmed completion for job ${row.id} after ${hours}h`);
      } catch (err) {
        this.logger.error(`Auto-confirm failed for job ${row.id}: ${(err as Error).message}`);
      }
    }
  }

  /** Close out fully-settled jobs (PAID → CLOSED) after a quiet day. */
  @Cron(CronExpression.EVERY_HOUR)
  async closeSettledJobs(): Promise<void> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM jobs WHERE state = 'PAID' AND updated_at < now() - interval '24 hours' LIMIT 100`,
    );
    for (const row of rows) {
      try {
        await this.db.withTransaction(async (client) => {
          const job = await this.jobs.lockJob(client, row.id);
          if (job?.state !== 'PAID') return;
          await this.fsm.transitionJob(client, row.id, 'PAID', 'CLOSED', null, 'job.closed');
        });
      } catch (err) {
        this.logger.error(`Close failed for job ${row.id}: ${(err as Error).message}`);
      }
    }
  }
}
