import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { AssignmentRow, JobRow, ACTIVE_ASSIGNMENT_STATES } from './jobs.repository';

export interface CancellationOutcome {
  refund_bps: number;
  cancellation_fee_cents: number;
  worker_compensation_cents: number;
  reliability_impact: 'NONE' | 'MINOR' | 'MAJOR';
  description: string;
}

interface CancellationPolicyConfig {
  customer_free_cancel_hours_before_start: number;
  customer_late_cancel_fee_bps: number;
  worker_grace_minutes_after_accept: number;
}

/**
 * Centralized cancellation policy engine (Phase 12). All thresholds/fees are
 * platform settings — nothing hardcoded in controllers. Consequences are
 * computed here, shown to users BEFORE they confirm, recorded in job_events,
 * and executed by the payments module.
 */
@Injectable()
export class CancellationPolicyService {
  constructor(private readonly settings: SettingsService) {}

  async forCustomerCancellation(
    job: JobRow,
    assignments: AssignmentRow[],
    now = new Date(),
  ): Promise<CancellationOutcome> {
    const config = await this.settings.get<CancellationPolicyConfig>('cancellation_policy');
    const active = assignments.filter((a) =>
      (ACTIVE_ASSIGNMENT_STATES as readonly string[]).includes(a.state),
    );

    // Nothing charged yet (charge happens at fill) or nobody committed.
    if (active.length === 0) {
      return {
        refund_bps: 10000,
        cancellation_fee_cents: 0,
        worker_compensation_cents: 0,
        reliability_impact: 'NONE',
        description: 'Cancelled before any worker accepted — no charge.',
      };
    }

    const anyTravelling = active.some((a) => a.en_route_at !== null || a.arrived_at !== null);
    const grossPerWorker =
      job.pay_type === 'FLAT'
        ? Number(job.pay_cents)
        : Math.round((Number(job.pay_cents) * job.estimated_duration_minutes) / 60);

    if (anyTravelling) {
      // Callout: workers who travelled get 25% of their gross; remainder refunded.
      const compensation = Math.round(grossPerWorker * 0.25);
      return {
        refund_bps: 10000,
        cancellation_fee_cents: 0,
        worker_compensation_cents: compensation,
        reliability_impact: 'NONE',
        description:
          'Cancelled after a worker was en route — travelling workers receive a callout compensation; the remainder is refunded.',
      };
    }

    const startsAt = job.scheduled_start_at ? new Date(job.scheduled_start_at).getTime() : now.getTime();
    const hoursUntilStart = (startsAt - now.getTime()) / 3600e3;
    if (hoursUntilStart >= config.customer_free_cancel_hours_before_start) {
      return {
        refund_bps: 10000,
        cancellation_fee_cents: 0,
        worker_compensation_cents: 0,
        reliability_impact: 'NONE',
        description: 'Cancelled with enough notice — full refund.',
      };
    }
    return {
      refund_bps: 10000 - config.customer_late_cancel_fee_bps,
      cancellation_fee_cents: 0,
      worker_compensation_cents: 0,
      reliability_impact: 'NONE',
      description: `Late cancellation — ${config.customer_late_cancel_fee_bps / 100}% fee applies; the rest is refunded.`,
    };
  }

  async forWorkerCancellation(
    assignment: AssignmentRow,
    reason: string,
    now = new Date(),
  ): Promise<{ reliability_impact: 'NONE' | 'MINOR' | 'MAJOR'; description: string }> {
    if (reason === 'SAFETY' || reason === 'JOB_MISREPRESENTED') {
      return {
        reliability_impact: 'NONE',
        description: 'Safety or misrepresentation cancellations carry no penalty and open a report for review.',
      };
    }
    const config = await this.settings.get<CancellationPolicyConfig>('cancellation_policy');
    const minutesSinceAccept = (now.getTime() - new Date(assignment.accepted_at).getTime()) / 60e3;
    if (minutesSinceAccept <= config.worker_grace_minutes_after_accept) {
      return { reliability_impact: 'MINOR', description: 'Cancelled within the grace window.' };
    }
    return { reliability_impact: 'MAJOR', description: 'Cancellation after commitment affects reliability metrics.' };
  }
}
