import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentsService } from './payments.service';
import type { CancellationOutcome } from '../jobs/cancellation-policy.service';

/**
 * Money side-effects of job lifecycle events, executed post-commit.
 * MVP runs these in-process; they are idempotent (ledger-key based) so moving
 * them onto a queue (BullMQ) later is a transport change, not a logic change.
 */
@Injectable()
export class PaymentsListeners {
  private readonly logger = new Logger(PaymentsListeners.name);

  constructor(private readonly payments: PaymentsService) {}

  @OnEvent('job.filled', { async: true })
  async onJobFilled(payload: { jobId: string }): Promise<void> {
    try {
      await this.payments.chargeForJob(payload.jobId);
    } catch (err) {
      this.logger.error(`chargeForJob(${payload.jobId}) failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('job.completion_confirmed', { async: true })
  async onCompletionConfirmed(payload: { jobId: string }): Promise<void> {
    try {
      await this.payments.releasePayouts(payload.jobId);
    } catch (err) {
      this.logger.error(`releasePayouts(${payload.jobId}) failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('job.cancelled', { async: true })
  async onJobCancelled(payload: { jobId: string; outcome: CancellationOutcome }): Promise<void> {
    try {
      await this.payments.executeCancellationOutcome(payload.jobId, payload.outcome);
    } catch (err) {
      this.logger.error(`cancellation outcome(${payload.jobId}) failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('dispute.resolved', { async: true })
  async onDisputeResolved(payload: {
    jobId: string;
    resolution: 'RELEASE' | 'REFUND_FULL' | 'REFUND_PARTIAL' | 'OTHER';
    amountCents?: number;
  }): Promise<void> {
    try {
      if (payload.resolution === 'RELEASE') {
        await this.payments.releasePayouts(payload.jobId);
      } else if (payload.resolution === 'REFUND_FULL') {
        await this.payments.executeCancellationOutcome(payload.jobId, {
          refund_bps: 10000,
          worker_compensation_cents: 0,
          description: 'Dispute resolution: full refund',
        } as CancellationOutcome);
      } else if (payload.resolution === 'REFUND_PARTIAL' && payload.amountCents) {
        await this.payments.refundFixedAmount(payload.jobId, payload.amountCents, 'Dispute resolution: partial refund');
      }
    } catch (err) {
      this.logger.error(`dispute resolution money(${payload.jobId}) failed: ${(err as Error).message}`);
    }
  }
}
