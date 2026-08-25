import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { NotificationsService } from './notifications.service';

/**
 * Maps domain events → user notifications (catalog in API_SPECIFICATION.md).
 * Runs post-commit; failures are logged, never break the triggering request.
 */
@Injectable()
export class NotificationsListeners {
  private readonly logger = new Logger(NotificationsListeners.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  private async jobInfo(jobId: string): Promise<{ customer: string; title: string } | null> {
    const { rows } = await this.db.query<{ customer_user_id: string; title: string }>(
      'SELECT customer_user_id, title FROM jobs WHERE id = $1',
      [jobId],
    );
    return rows[0] ? { customer: rows[0].customer_user_id, title: rows[0].title } : null;
  }

  private async workerIds(jobId: string, states: string[]): Promise<string[]> {
    const { rows } = await this.db.query<{ worker_user_id: string }>(
      'SELECT worker_user_id FROM job_workers WHERE job_id = $1 AND state = ANY($2::assignment_state[])',
      [jobId, states],
    );
    return rows.map((r) => r.worker_user_id);
  }

  private safe(fn: () => Promise<void>): void {
    fn().catch((err) => this.logger.error(`notification failed: ${(err as Error).message}`));
  }

  @OnEvent('job.worker_accepted')
  onAccepted(p: { jobId: string; workerUserId: string }): void {
    this.safe(async () => {
      const job = await this.jobInfo(p.jobId);
      if (!job) return;
      await this.notifications.notify(job.customer, 'JOB_ACCEPTED', 'A worker accepted your job',
        `A worker accepted "${job.title}".`, { job_id: p.jobId });
    });
  }

  @OnEvent('job.filled')
  onFilled(p: { jobId: string }): void {
    this.safe(async () => {
      const job = await this.jobInfo(p.jobId);
      if (!job) return;
      await this.notifications.notify(job.customer, 'JOB_FILLED', 'Your job is fully staffed',
        `All workers are confirmed for "${job.title}".`, { job_id: p.jobId });
    });
  }

  @OnEvent('assignment.transition')
  onAssignmentTransition(p: { jobId: string; to: string }): void {
    this.safe(async () => {
      const job = await this.jobInfo(p.jobId);
      if (!job) return;
      const map: Record<string, [string, string]> = {
        EN_ROUTE: ['WORKER_EN_ROUTE', 'Your worker is on the way'],
        ARRIVED: ['WORKER_ARRIVED', 'Your worker has arrived'],
        STARTED: ['JOB_STARTED', 'Work has started'],
        COMPLETED: ['JOB_COMPLETED_PENDING', 'Work marked complete — please confirm'],
      };
      const entry = map[p.to];
      if (!entry) return;
      await this.notifications.notify(job.customer, entry[0], entry[1], `Job: "${job.title}"`, {
        job_id: p.jobId,
      });
    });
  }

  @OnEvent('job.completion_confirmed')
  onConfirmed(p: { jobId: string }): void {
    this.safe(async () => {
      const job = await this.jobInfo(p.jobId);
      if (!job) return;
      for (const worker of await this.workerIds(p.jobId, ['COMPLETED'])) {
        await this.notifications.notify(worker, 'COMPLETION_CONFIRMED', 'Completion confirmed',
          `The customer confirmed "${job.title}". Your payout is being processed.`, { job_id: p.jobId });
      }
    });
  }

  @OnEvent('job.cancelled')
  onJobCancelled(p: { jobId: string }): void {
    this.safe(async () => {
      const job = await this.jobInfo(p.jobId);
      if (!job) return;
      for (const worker of await this.workerIds(p.jobId, ['CANCELLED_BY_CUSTOMER'])) {
        await this.notifications.notify(worker, 'JOB_CANCELLED', 'A job was cancelled',
          `"${job.title}" was cancelled by the customer.`, { job_id: p.jobId });
      }
    });
  }

  @OnEvent('assignment.cancelled_by_worker')
  onWorkerCancelled(p: { jobId: string; customerUserId: string }): void {
    this.safe(async () => {
      const job = await this.jobInfo(p.jobId);
      if (!job) return;
      await this.notifications.notify(p.customerUserId, 'WORKER_CANCELLED', 'A worker left your job',
        `A worker cancelled on "${job.title}". We reopened the spot for matching.`, { job_id: p.jobId });
    });
  }

  @OnEvent('message.sent')
  onMessage(p: { recipientUserId: string; jobId: string; preview: string }): void {
    this.safe(async () => {
      await this.notifications.notify(p.recipientUserId, 'MESSAGE_RECEIVED', 'New message',
        p.preview.slice(0, 120), { job_id: p.jobId });
    });
  }

  @OnEvent('payment.succeeded')
  onPaymentSucceeded(p: { jobId: string; customerUserId: string; amountCents: number }): void {
    this.safe(async () => {
      await this.notifications.notify(p.customerUserId, 'PAYMENT_PROCESSED', 'Payment processed',
        `Your payment of $${(p.amountCents / 100).toFixed(2)} was processed.`, { job_id: p.jobId });
    });
  }

  @OnEvent('payment.failed')
  onPaymentFailed(p: { jobId: string; customerUserId: string }): void {
    this.safe(async () => {
      await this.notifications.notify(p.customerUserId, 'PAYMENT_FAILED', 'Payment problem',
        'We could not process your payment. Update your payment method and retry.', { job_id: p.jobId });
    });
  }

  @OnEvent('payout.released')
  onPayoutReleased(p: { workerUserId: string; jobId: string; amountCents: number }): void {
    this.safe(async () => {
      await this.notifications.notify(p.workerUserId, 'PAYOUT_RELEASED', 'You got paid',
        `$${(p.amountCents / 100).toFixed(2)} is on the way to your bank.`, { job_id: p.jobId });
    });
  }

  @OnEvent('payout.failed')
  onPayoutFailed(p: { workerUserId: string; jobId: string; reason: string }): void {
    this.safe(async () => {
      const body =
        p.reason === 'PAYOUT_ACCOUNT_INCOMPLETE'
          ? 'Finish setting up your payout account to receive this payment.'
          : 'We hit a problem sending your payout. Support has been notified.';
      await this.notifications.notify(p.workerUserId, 'PAYOUT_FAILED', 'Payout needs attention', body, {
        job_id: p.jobId,
      });
    });
  }

  @OnEvent('dispute.opened')
  onDisputeOpened(p: { jobId: string; disputeId: string }): void {
    this.safe(async () => {
      const job = await this.jobInfo(p.jobId);
      if (!job) return;
      const parties = [job.customer, ...(await this.workerIds(p.jobId, ['COMPLETED', 'STARTED', 'ARRIVED']))];
      for (const userId of parties) {
        await this.notifications.notify(userId, 'DISPUTE_UPDATE', 'A dispute was opened',
          `A dispute was opened on "${job.title}". Payouts are paused while we review.`, {
            job_id: p.jobId, dispute_id: p.disputeId,
          });
      }
    });
  }

  @OnEvent('dispute.resolved')
  onDisputeResolved(p: { jobId: string; disputeId: string; resolution: string }): void {
    this.safe(async () => {
      const job = await this.jobInfo(p.jobId);
      if (!job) return;
      const parties = [job.customer, ...(await this.workerIds(p.jobId, ['COMPLETED']))];
      for (const userId of parties) {
        await this.notifications.notify(userId, 'DISPUTE_UPDATE', 'Dispute resolved',
          `The dispute on "${job.title}" was resolved.`, { job_id: p.jobId, dispute_id: p.disputeId });
      }
    });
  }
}
