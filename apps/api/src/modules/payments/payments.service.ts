import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { RequestUser } from '../../common/auth.decorators';
import { JobsRepository, JobRow } from '../jobs/jobs.repository';
import { JobStateMachine } from '../jobs/job-state-machine';
import { STRIPE_GATEWAY, StripeGateway } from './stripe.gateway';

export interface FeeBreakdown {
  gross_cents: number;
  platform_fee_cents: number;
  net_cents: number;
  platform_fee_id: string | null;
}

/**
 * All money logic lives here (PAYMENT_MODEL.md). Invariants:
 *  - integer cents only; explicit currency;
 *  - every Stripe call carries an idempotency key derived from our ledger row;
 *  - unique constraints make duplicate charges/payouts structurally impossible;
 *  - payment state changes come from Stripe responses/webhooks, never clients.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsRepository,
    private readonly fsm: JobStateMachine,
    private readonly events: EventEmitter2,
    @Inject(STRIPE_GATEWAY) private readonly stripe: StripeGateway,
  ) {}

  // ── Fee math (centralized; banker's-free deterministic rounding) ──────────

  /** Fee config row: category-specific override wins over the default (NULL category). */
  async computeFee(grossCents: number, categoryId: string | null): Promise<FeeBreakdown> {
    const { rows } = await this.db.query<{ id: string; percent_bps: number; fixed_cents: string }>(
      `SELECT id, percent_bps, fixed_cents FROM platform_fees
       WHERE (category_id = $1 OR category_id IS NULL)
         AND active_from <= now() AND (active_to IS NULL OR active_to > now())
       ORDER BY category_id NULLS LAST, active_from DESC
       LIMIT 1`,
      [categoryId],
    );
    const fee = rows[0];
    if (!fee) {
      // No fee configured — platform takes nothing rather than guessing.
      return { gross_cents: grossCents, platform_fee_cents: 0, net_cents: grossCents, platform_fee_id: null };
    }
    const feeCents = Math.min(
      grossCents,
      Math.round((grossCents * fee.percent_bps) / 10000) + Number(fee.fixed_cents),
    );
    return {
      gross_cents: grossCents,
      platform_fee_cents: feeCents,
      net_cents: grossCents - feeCents,
      platform_fee_id: fee.id,
    };
  }

  grossPerWorker(job: JobRow): number {
    const pay = Number(job.pay_cents);
    return job.pay_type === 'FLAT' ? pay : Math.round((pay * job.estimated_duration_minutes) / 60);
  }

  // ── Customer payment methods ───────────────────────────────────────────────

  async ensureStripeCustomer(user: RequestUser): Promise<string> {
    const { rows } = await this.db.query<{ stripe_customer_id: string }>(
      'SELECT stripe_customer_id FROM payment_customers WHERE user_id = $1',
      [user.id],
    );
    if (rows[0]) return rows[0].stripe_customer_id;
    const customer = await this.stripe.createCustomer(user.email, user.id);
    await this.db.query(
      `INSERT INTO payment_customers (user_id, stripe_customer_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, customer.id],
    );
    return customer.id;
  }

  async createSetupIntent(user: RequestUser): Promise<{ id: string; client_secret: string }> {
    try {
      const customerId = await this.ensureStripeCustomer(user);
      const si = await this.stripe.createSetupIntent(customerId);
      return { id: si.id, client_secret: si.client_secret };
    } catch (err) {
      this.logger.error(`SetupIntent creation failed: ${(err as Error).message}`);
      throw new DomainError(
        'PAYMENT_FAILED',
        'Payments are not available right now (Stripe is not configured in this environment)',
        503,
      );
    }
  }

  /** After the client confirms the SetupIntent (payment sheet), adopt its card as default. */
  async syncFromSetupIntent(user: RequestUser, setupIntentId: string): Promise<void> {
    const customerId = await this.ensureStripeCustomer(user);
    const si = await this.stripe.getSetupIntent(setupIntentId);
    if (si.customer !== customerId) {
      throw DomainError.validation('This setup intent does not belong to your account');
    }
    if (si.status !== 'succeeded' || !si.payment_method) {
      throw DomainError.conflict('The card setup has not completed yet');
    }
    await this.db.query(
      'UPDATE payment_customers SET default_payment_method = $2, updated_at = now() WHERE user_id = $1',
      [user.id, si.payment_method],
    );
  }

  /** Client reports the confirmed PaymentMethod; we verify it belongs to this customer. */
  async setDefaultPaymentMethod(user: RequestUser, paymentMethodId: string): Promise<void> {
    const customerId = await this.ensureStripeCustomer(user);
    const owner = await this.stripe.getPaymentMethodCustomer(paymentMethodId);
    if (owner !== customerId) {
      throw DomainError.validation('This payment method does not belong to your account');
    }
    await this.db.query(
      'UPDATE payment_customers SET default_payment_method = $2, updated_at = now() WHERE user_id = $1',
      [user.id, paymentMethodId],
    );
  }

  async getPaymentProfile(userId: string): Promise<{ has_payment_method: boolean }> {
    const { rows } = await this.db.query<{ default_payment_method: string | null }>(
      'SELECT default_payment_method FROM payment_customers WHERE user_id = $1',
      [userId],
    );
    return { has_payment_method: Boolean(rows[0]?.default_payment_method) };
  }

  // ── Worker payout accounts (Stripe Connect Express) ───────────────────────

  async createOnboardingLink(user: RequestUser, refreshUrl: string, returnUrl: string): Promise<{ url: string }> {
    let accountId: string;
    const { rows } = await this.db.query<{ stripe_account_id: string }>(
      'SELECT stripe_account_id FROM payout_accounts WHERE worker_user_id = $1',
      [user.id],
    );
    try {
      if (rows[0]) {
        accountId = rows[0].stripe_account_id;
      } else {
        const account = await this.stripe.createExpressAccount(user.email, user.id);
        accountId = account.id;
        await this.db.query(
          `INSERT INTO payout_accounts (worker_user_id, stripe_account_id) VALUES ($1, $2)
           ON CONFLICT (worker_user_id) DO NOTHING`,
          [user.id, accountId],
        );
      }
      return await this.stripe.createAccountOnboardingLink(accountId, refreshUrl, returnUrl);
    } catch (err) {
      this.logger.error(`Onboarding link failed: ${(err as Error).message}`);
      throw new DomainError(
        'PAYMENT_FAILED',
        'Payout setup is not available right now (Stripe is not configured in this environment)',
        503,
      );
    }
  }

  async refreshPayoutAccountStatus(workerUserId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.db.query<{ stripe_account_id: string }>(
      'SELECT stripe_account_id FROM payout_accounts WHERE worker_user_id = $1',
      [workerUserId],
    );
    if (!rows[0]) return null;
    const status = await this.stripe.getAccountStatus(rows[0].stripe_account_id);
    return this.updatePayoutAccount(rows[0].stripe_account_id, status);
  }

  private async updatePayoutAccount(
    stripeAccountId: string,
    status: { charges_enabled: boolean; payouts_enabled: boolean; requirements: unknown },
  ): Promise<Record<string, unknown>> {
    const onboarding = status.payouts_enabled ? 'COMPLETE' : 'PENDING';
    const { rows } = await this.db.query(
      `UPDATE payout_accounts SET charges_enabled = $2, payouts_enabled = $3,
         requirements = $4, onboarding_status = $5, updated_at = now()
       WHERE stripe_account_id = $1
       RETURNING worker_user_id, onboarding_status, charges_enabled, payouts_enabled`,
      [stripeAccountId, status.charges_enabled, status.payouts_enabled, JSON.stringify(status.requirements), onboarding],
    );
    return rows[0] as Record<string, unknown>;
  }

  async getPayoutAccount(userId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.db.query(
      `SELECT onboarding_status, charges_enabled, payouts_enabled, created_at
       FROM payout_accounts WHERE worker_user_id = $1`,
      [userId],
    );
    return (rows[0] as Record<string, unknown>) ?? null;
  }

  // ── Charge at fill ─────────────────────────────────────────────────────────

  /**
   * Charge triggers: job FILLED (normal path) or work starting on a
   * partially-staffed job (customer chose to proceed with fewer workers).
   * The charge covers the workers actually committed, not workers_needed.
   */
  async chargeForJob(jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId);
    if (!job || !['FILLED', 'IN_PROGRESS'].includes(job.state)) return;

    const committed = (await this.jobs.listAssignmentsForJob(jobId)).filter((a) =>
      ['ACCEPTED', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'STARTED', 'COMPLETED'].includes(a.state),
    ).length;
    if (committed === 0) return;

    const gross = this.grossPerWorker(job) * committed;
    const fee = await this.computeFee(
      // Platform fee is taken from worker earnings (PAYMENT_MODEL): customer
      // pays the job total; fee snapshot recorded for the whole charge.
      gross,
      job.category_id,
    );
    const idempotencyKey = `job:${jobId}:charge:v1`;

    // Ledger row first (unique idempotency_key makes double charge impossible).
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO payments
         (job_id, customer_user_id, kind, status, amount_cents, currency,
          platform_fee_cents, platform_fee_id, idempotency_key)
       VALUES ($1, $2, 'JOB_PAYMENT', 'REQUIRES_PAYMENT', $3, $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [jobId, job.customer_user_id, gross, job.currency, fee.platform_fee_cents, fee.platform_fee_id, idempotencyKey],
    );
    if (!rows[0]) return; // Already charged/charging (retry-safe no-op).
    const paymentId = rows[0].id;

    const { rows: pc } = await this.db.query<{ stripe_customer_id: string; default_payment_method: string | null }>(
      'SELECT stripe_customer_id, default_payment_method FROM payment_customers WHERE user_id = $1',
      [job.customer_user_id],
    );
    if (!pc[0]?.default_payment_method) {
      await this.markPaymentFailed(paymentId, jobId, 'no_payment_method', 'No payment method on file');
      return;
    }

    try {
      const result = await this.stripe.chargeCustomer({
        amountCents: gross,
        currency: job.currency,
        customerId: pc[0].stripe_customer_id,
        paymentMethodId: pc[0].default_payment_method,
        // Gateway key derives from the ledger row id: a retry after failure is
        // a NEW ledger row → new key (Stripe replays responses per key).
        idempotencyKey: `payment:${paymentId}:charge`,
        metadata: { job_id: jobId, payment_id: paymentId },
      });
      if (result.status === 'succeeded') {
        await this.db.query(
          `UPDATE payments SET status = 'SUCCEEDED', stripe_payment_intent_id = $2,
             stripe_charge_id = $3, updated_at = now() WHERE id = $1`,
          [paymentId, result.id, result.latest_charge_id],
        );
        await this.recordPaymentEvent(jobId, 'payment.succeeded', { payment_id: paymentId, amount_cents: gross });
        this.events.emit('payment.succeeded', { jobId, customerUserId: job.customer_user_id, amountCents: gross });
      } else if (result.status === 'failed') {
        await this.db.query(
          `UPDATE payments SET status = 'FAILED', stripe_payment_intent_id = $2,
             failure_code = $3, failure_message = $4, updated_at = now() WHERE id = $1`,
          [paymentId, result.id, result.failure_code ?? null, result.failure_message ?? null],
        );
        await this.recordPaymentEvent(jobId, 'payment.failed', { payment_id: paymentId });
        this.events.emit('payment.failed', { jobId, customerUserId: job.customer_user_id });
      } else {
        await this.db.query(
          `UPDATE payments SET status = 'PROCESSING', stripe_payment_intent_id = $2, updated_at = now() WHERE id = $1`,
          [paymentId, result.id],
        );
      }
    } catch (err) {
      this.logger.error(`Charge failed for job ${jobId}: ${(err as Error).message}`);
      await this.markPaymentFailed(paymentId, jobId, 'gateway_error', (err as Error).message);
    }
  }

  /** Customer retries after fixing their payment method. */
  async retryCharge(user: RequestUser, jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId);
    if (!job || job.customer_user_id !== user.id) throw DomainError.notFound('Job not found');
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM payments WHERE job_id = $1 AND kind = 'JOB_PAYMENT' AND status = 'FAILED'`,
      [jobId],
    );
    if (!rows[0]) throw DomainError.conflict('There is no failed payment to retry');
    // New attempt = new ledger row with a versioned idempotency key.
    await this.db.query(`UPDATE payments SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, [rows[0].id]);
    await this.db.query(
      `UPDATE payments SET idempotency_key = idempotency_key || ':superseded:' || id WHERE id = $1`,
      [rows[0].id],
    );
    await this.chargeForJob(jobId);
    const { rows: check } = await this.db.query<{ status: string }>(
      `SELECT status FROM payments WHERE job_id = $1 AND kind = 'JOB_PAYMENT' ORDER BY created_at DESC LIMIT 1`,
      [jobId],
    );
    if (check[0]?.status !== 'SUCCEEDED') {
      throw new DomainError('PAYMENT_FAILED', 'The payment could not be completed', 402);
    }
  }

  private async markPaymentFailed(paymentId: string, jobId: string, code: string, message: string): Promise<void> {
    await this.db.query(
      `UPDATE payments SET status = 'FAILED', failure_code = $2, failure_message = $3, updated_at = now()
       WHERE id = $1`,
      [paymentId, code, message],
    );
    await this.recordPaymentEvent(jobId, 'payment.failed', { payment_id: paymentId, failure_code: code });
    const job = await this.jobs.findById(jobId);
    if (job) this.events.emit('payment.failed', { jobId, customerUserId: job.customer_user_id });
  }

  // ── Payout release on confirmed completion ─────────────────────────────────

  async releasePayouts(jobId: string): Promise<void> {
    // Guard + transition inside a transaction; transfers outside it.
    const prepared = await this.db.withTransaction(async (client) => {
      const job = await this.jobs.lockJob(client, jobId);
      if (!job) return null;
      if (job.state === 'COMPLETED') {
        const { rows: paid } = await client.query(
          `SELECT 1 FROM payments WHERE job_id = $1 AND kind = 'JOB_PAYMENT' AND status = 'SUCCEEDED'`,
          [jobId],
        );
        if (paid.length === 0) {
          // No successful charge — never pay out unfunded work (no fake payouts).
          await this.fsm.recordEvent(client, jobId, null, null, 'payout.blocked_no_successful_payment');
          return null;
        }
        await this.fsm.transitionJob(client, jobId, 'COMPLETED', 'PAYMENT_PENDING', null, 'job.payment_pending');
      } else if (job.state !== 'PAYMENT_PENDING') {
        return null; // Not in a payable state (e.g. DISPUTED pauses release).
      }

      const assignments = (await this.jobs.listAssignmentsForJob(jobId, client)).filter(
        (a) => a.state === 'COMPLETED',
      );
      const payouts: Array<{ payoutId: string; assignmentId: string; workerId: string; net: number; currency: string }> = [];
      for (const a of assignments) {
        const gross = Number(a.earnings_cents ?? 0);
        if (gross <= 0) continue;
        const fee = await this.computeFee(gross, (await this.jobs.findById(jobId, client))!.category_id);
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO payouts
             (job_id, assignment_id, worker_user_id, kind, status, amount_cents, currency,
              platform_fee_cents, idempotency_key)
           VALUES ($1, $2, $3, 'JOB_EARNINGS', 'PENDING', $4, $5, $6, $7)
           ON CONFLICT (assignment_id, kind) DO NOTHING
           RETURNING id`,
          [jobId, a.id, a.worker_user_id, fee.net_cents, a.currency, fee.platform_fee_cents,
           `assignment:${a.id}:earnings:v1`],
        );
        if (rows[0]) {
          payouts.push({ payoutId: rows[0].id, assignmentId: a.id, workerId: a.worker_user_id, net: fee.net_cents, currency: a.currency });
        } else {
          // Retry path: pick up payouts still missing a transfer.
          const { rows: pending } = await client.query<{ id: string; amount_cents: string; currency: string }>(
            `SELECT id, amount_cents, currency FROM payouts
             WHERE assignment_id = $1 AND kind = 'JOB_EARNINGS' AND status IN ('PENDING','FAILED')`,
            [a.id],
          );
          if (pending[0]) {
            payouts.push({
              payoutId: pending[0].id, assignmentId: a.id, workerId: a.worker_user_id,
              net: Number(pending[0].amount_cents), currency: pending[0].currency,
            });
          }
        }
      }
      return payouts;
    });

    if (!prepared) return;

    for (const p of prepared) {
      const { rows: account } = await this.db.query<{ stripe_account_id: string; payouts_enabled: boolean }>(
        'SELECT stripe_account_id, payouts_enabled FROM payout_accounts WHERE worker_user_id = $1',
        [p.workerId],
      );
      if (!account[0]?.payouts_enabled) {
        await this.db.query(
          `UPDATE payouts SET status = 'FAILED', failure_code = 'payout_account_incomplete', updated_at = now()
           WHERE id = $1 AND stripe_transfer_id IS NULL`,
          [p.payoutId],
        );
        this.events.emit('payout.failed', { workerUserId: p.workerId, jobId, reason: 'PAYOUT_ACCOUNT_INCOMPLETE' });
        continue;
      }
      try {
        const transfer = await this.stripe.createTransfer({
          amountCents: p.net,
          currency: p.currency,
          destinationAccountId: account[0].stripe_account_id,
          idempotencyKey: `assignment:${p.assignmentId}:earnings:v1`,
          metadata: { job_id: jobId, payout_id: p.payoutId },
        });
        await this.db.query(
          `UPDATE payouts SET status = 'IN_TRANSIT', stripe_transfer_id = $2, updated_at = now()
           WHERE id = $1 AND stripe_transfer_id IS NULL`,
          [p.payoutId, transfer.id],
        );
        await this.recordPaymentEvent(jobId, 'payout.released', { payout_id: p.payoutId, amount_cents: p.net });
        this.events.emit('payout.released', { workerUserId: p.workerId, jobId, amountCents: p.net });
      } catch (err) {
        this.logger.error(`Transfer failed for payout ${p.payoutId}: ${(err as Error).message}`);
        await this.db.query(
          `UPDATE payouts SET status = 'FAILED', failure_code = 'gateway_error', updated_at = now()
           WHERE id = $1 AND stripe_transfer_id IS NULL`,
          [p.payoutId],
        );
        this.events.emit('payout.failed', { workerUserId: p.workerId, jobId, reason: 'GATEWAY_ERROR' });
      }
    }

    // All completed assignments funded → job PAID.
    await this.db.withTransaction(async (client) => {
      const job = await this.jobs.lockJob(client, jobId);
      if (!job || job.state !== 'PAYMENT_PENDING') return;
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM job_workers a
         WHERE a.job_id = $1 AND a.state = 'COMPLETED' AND a.earnings_cents > 0
           AND NOT EXISTS (SELECT 1 FROM payouts p
                           WHERE p.assignment_id = a.id AND p.kind = 'JOB_EARNINGS'
                             AND p.status IN ('IN_TRANSIT','PAID'))`,
        [jobId],
      );
      if (Number(rows[0]!.n) === 0) {
        await this.fsm.transitionJob(client, jobId, 'PAYMENT_PENDING', 'PAID', null, 'job.paid');
      }
    });
  }

  // ── Cancellation refunds / compensation ────────────────────────────────────

  async executeCancellationOutcome(
    jobId: string,
    outcome: { refund_bps: number; worker_compensation_cents: number; description: string },
  ): Promise<void> {
    const { rows: payments } = await this.db.query<{
      id: string; amount_cents: string; stripe_payment_intent_id: string | null; status: string;
    }>(
      `SELECT id, amount_cents, stripe_payment_intent_id, status FROM payments
       WHERE job_id = $1 AND kind = 'JOB_PAYMENT' AND status = 'SUCCEEDED'`,
      [jobId],
    );
    const payment = payments[0];
    if (!payment) return; // Nothing was charged — nothing to move.

    const amount = Number(payment.amount_cents);
    const job = await this.jobs.findById(jobId);
    if (!job) return;

    // Worker callout compensation first (from the charged funds).
    let compensationTotal = 0;
    if (outcome.worker_compensation_cents > 0) {
      const assignments = (await this.jobs.listAssignmentsForJob(jobId)).filter((a) =>
        ['CANCELLED_BY_CUSTOMER'].includes(a.state) && (a.en_route_at !== null || a.arrived_at !== null),
      );
      for (const a of assignments) {
        const { rows: account } = await this.db.query<{ stripe_account_id: string; payouts_enabled: boolean }>(
          'SELECT stripe_account_id, payouts_enabled FROM payout_accounts WHERE worker_user_id = $1',
          [a.worker_user_id],
        );
        const { rows: inserted } = await this.db.query<{ id: string }>(
          `INSERT INTO payouts
             (job_id, assignment_id, worker_user_id, kind, status, amount_cents, currency, idempotency_key)
           VALUES ($1, $2, $3, 'CANCELLATION_COMPENSATION', 'PENDING', $4, $5, $6)
           ON CONFLICT (assignment_id, kind) DO NOTHING RETURNING id`,
          [jobId, a.id, a.worker_user_id, outcome.worker_compensation_cents, job.currency,
           `assignment:${a.id}:cancel-comp:v1`],
        );
        if (!inserted[0]) continue;
        compensationTotal += outcome.worker_compensation_cents;
        if (account[0]?.payouts_enabled) {
          try {
            const transfer = await this.stripe.createTransfer({
              amountCents: outcome.worker_compensation_cents,
              currency: job.currency,
              destinationAccountId: account[0].stripe_account_id,
              idempotencyKey: `assignment:${a.id}:cancel-comp:v1`,
              metadata: { job_id: jobId, kind: 'cancellation_compensation' },
            });
            await this.db.query(
              `UPDATE payouts SET status = 'IN_TRANSIT', stripe_transfer_id = $2, updated_at = now() WHERE id = $1`,
              [inserted[0].id, transfer.id],
            );
          } catch {
            await this.db.query(
              `UPDATE payouts SET status = 'FAILED', failure_code = 'gateway_error', updated_at = now() WHERE id = $1`,
              [inserted[0].id],
            );
          }
        } else {
          await this.db.query(
            `UPDATE payouts SET status = 'FAILED', failure_code = 'payout_account_incomplete', updated_at = now() WHERE id = $1`,
            [inserted[0].id],
          );
        }
      }
    }

    const refundCents = Math.min(
      amount - compensationTotal,
      Math.round((amount * outcome.refund_bps) / 10000),
    );
    if (refundCents > 0 && payment.stripe_payment_intent_id) {
      const idempotencyKey = `payment:${payment.id}:refund:v1`;
      const { rows: refundRow } = await this.db.query<{ id: string }>(
        `INSERT INTO payments
           (job_id, customer_user_id, kind, status, amount_cents, currency, idempotency_key)
         SELECT $1, customer_user_id, 'REFUND', 'PROCESSING', $2, currency, $3
         FROM payments WHERE id = $4
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [jobId, refundCents, idempotencyKey, payment.id],
      );
      if (refundRow[0]) {
        try {
          const refund = await this.stripe.refund({
            paymentIntentId: payment.stripe_payment_intent_id,
            amountCents: refundCents,
            idempotencyKey,
          });
          await this.db.query(
            `UPDATE payments SET status = 'SUCCEEDED', stripe_refund_id = $2, updated_at = now() WHERE id = $1`,
            [refundRow[0].id, refund.id],
          );
          await this.db.query(
            `UPDATE payments SET refunded_cents = refunded_cents + $2,
               status = CASE WHEN refunded_cents + $2 >= amount_cents THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
               updated_at = now()
             WHERE id = $1`,
            [payment.id, refundCents],
          );
          await this.recordPaymentEvent(jobId, 'payment.refunded', {
            refund_cents: refundCents, policy: outcome.description,
          });
        } catch (err) {
          this.logger.error(`Refund failed for job ${jobId}: ${(err as Error).message}`);
          await this.db.query(
            `UPDATE payments SET status = 'FAILED', failure_code = 'gateway_error', updated_at = now() WHERE id = $1`,
            [refundRow[0].id],
          );
        }
      }
    }
  }

  // ── Tips (no platform fee — PAYMENT_MODEL) ─────────────────────────────────

  async tipWorker(
    customer: RequestUser,
    jobId: string,
    assignmentId: string,
    amountCents: number,
  ): Promise<{ status: string }> {
    const job = await this.jobs.findById(jobId);
    if (!job || job.customer_user_id !== customer.id) throw DomainError.notFound('Job not found');
    if (!['COMPLETED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'].includes(job.state)) {
      throw DomainError.conflict('Tips open once the job is completed');
    }
    const assignment = await this.jobs.findAssignmentById(assignmentId);
    if (!assignment || assignment.job_id !== jobId || assignment.state !== 'COMPLETED') {
      throw DomainError.notFound('Assignment not found');
    }

    const { rows: pc } = await this.db.query<{ stripe_customer_id: string; default_payment_method: string | null }>(
      'SELECT stripe_customer_id, default_payment_method FROM payment_customers WHERE user_id = $1',
      [customer.id],
    );
    if (!pc[0]?.default_payment_method) {
      throw new DomainError('PAYMENT_METHOD_REQUIRED', 'Add a payment method to tip', 402);
    }

    // One tip per assignment (ledger unique key); retries replay safely.
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO payments (job_id, customer_user_id, kind, status, amount_cents, currency, idempotency_key)
       VALUES ($1, $2, 'TIP', 'REQUIRES_PAYMENT', $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [jobId, customer.id, amountCents, job.currency, `assignment:${assignmentId}:tip:v1`],
    );
    if (!rows[0]) throw DomainError.conflict('A tip was already sent for this job');
    const paymentId = rows[0].id;

    const result = await this.stripe.chargeCustomer({
      amountCents,
      currency: job.currency,
      customerId: pc[0].stripe_customer_id,
      paymentMethodId: pc[0].default_payment_method,
      idempotencyKey: `payment:${paymentId}:charge`,
      metadata: { job_id: jobId, payment_id: paymentId, kind: 'tip' },
    });
    if (result.status !== 'succeeded') {
      await this.db.query(
        `UPDATE payments SET status = 'FAILED', stripe_payment_intent_id = $2,
           failure_code = $3, updated_at = now() WHERE id = $1`,
        [paymentId, result.id, result.failure_code ?? 'unknown'],
      );
      throw new DomainError('PAYMENT_FAILED', 'The tip could not be charged', 402);
    }
    await this.db.query(
      `UPDATE payments SET status = 'SUCCEEDED', stripe_payment_intent_id = $2,
         stripe_charge_id = $3, updated_at = now() WHERE id = $1`,
      [paymentId, result.id, result.latest_charge_id],
    );

    // Pass the full tip to the worker (fee-free), transferring when possible.
    const { rows: payoutRows } = await this.db.query<{ id: string }>(
      `INSERT INTO payouts (job_id, assignment_id, worker_user_id, kind, status, amount_cents, currency, idempotency_key)
       VALUES ($1, $2, $3, 'TIP', 'PENDING', $4, $5, $6)
       ON CONFLICT (assignment_id, kind) DO NOTHING RETURNING id`,
      [jobId, assignmentId, assignment.worker_user_id, amountCents, job.currency,
       `assignment:${assignmentId}:tip-payout:v1`],
    );
    if (payoutRows[0]) {
      const { rows: account } = await this.db.query<{ stripe_account_id: string; payouts_enabled: boolean }>(
        'SELECT stripe_account_id, payouts_enabled FROM payout_accounts WHERE worker_user_id = $1',
        [assignment.worker_user_id],
      );
      if (account[0]?.payouts_enabled) {
        try {
          const transfer = await this.stripe.createTransfer({
            amountCents,
            currency: job.currency,
            destinationAccountId: account[0].stripe_account_id,
            idempotencyKey: `assignment:${assignmentId}:tip-payout:v1`,
            metadata: { job_id: jobId, kind: 'tip' },
          });
          await this.db.query(
            `UPDATE payouts SET status = 'IN_TRANSIT', stripe_transfer_id = $2, updated_at = now() WHERE id = $1`,
            [payoutRows[0].id, transfer.id],
          );
        } catch {
          await this.db.query(
            `UPDATE payouts SET status = 'FAILED', failure_code = 'gateway_error', updated_at = now() WHERE id = $1`,
            [payoutRows[0].id],
          );
        }
      } else {
        await this.db.query(
          `UPDATE payouts SET status = 'FAILED', failure_code = 'payout_account_incomplete', updated_at = now() WHERE id = $1`,
          [payoutRows[0].id],
        );
      }
    }
    await this.recordPaymentEvent(jobId, 'payment.tip', { assignment_id: assignmentId, amount_cents: amountCents });
    this.events.emit('payout.released', {
      workerUserId: assignment.worker_user_id,
      jobId,
      amountCents,
    });
    return { status: 'SUCCEEDED' };
  }

  /** Fixed-amount refund (dispute resolutions). Ledger-keyed, idempotent. */
  async refundFixedAmount(jobId: string, amountCents: number, description: string): Promise<void> {
    const { rows } = await this.db.query<{ id: string; stripe_payment_intent_id: string | null; amount_cents: string; refunded_cents: string }>(
      `SELECT id, stripe_payment_intent_id, amount_cents, refunded_cents FROM payments
       WHERE job_id = $1 AND kind = 'JOB_PAYMENT' AND status IN ('SUCCEEDED','PARTIALLY_REFUNDED')`,
      [jobId],
    );
    const payment = rows[0];
    if (!payment?.stripe_payment_intent_id) return;
    const refundable = Number(payment.amount_cents) - Number(payment.refunded_cents);
    const refundCents = Math.min(amountCents, refundable);
    if (refundCents <= 0) return;

    const idempotencyKey = `payment:${payment.id}:dispute-refund:v1`;
    const { rows: refundRow } = await this.db.query<{ id: string }>(
      `INSERT INTO payments
         (job_id, customer_user_id, kind, status, amount_cents, currency, idempotency_key)
       SELECT $1, customer_user_id, 'REFUND', 'PROCESSING', $2, currency, $3
       FROM payments WHERE id = $4
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [jobId, refundCents, idempotencyKey, payment.id],
    );
    if (!refundRow[0]) return;
    try {
      const refund = await this.stripe.refund({
        paymentIntentId: payment.stripe_payment_intent_id,
        amountCents: refundCents,
        idempotencyKey,
      });
      await this.db.query(
        `UPDATE payments SET status = 'SUCCEEDED', stripe_refund_id = $2, updated_at = now() WHERE id = $1`,
        [refundRow[0].id, refund.id],
      );
      await this.db.query(
        `UPDATE payments SET refunded_cents = refunded_cents + $2,
           status = CASE WHEN refunded_cents + $2 >= amount_cents THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
           updated_at = now()
         WHERE id = $1`,
        [payment.id, refundCents],
      );
      await this.recordPaymentEvent(jobId, 'payment.refunded', { refund_cents: refundCents, reason: description });
    } catch (err) {
      this.logger.error(`Fixed refund failed for job ${jobId}: ${(err as Error).message}`);
      await this.db.query(
        `UPDATE payments SET status = 'FAILED', failure_code = 'gateway_error', updated_at = now() WHERE id = $1`,
        [refundRow[0].id],
      );
    }
  }

  // ── Histories & earnings ───────────────────────────────────────────────────

  async listPayments(userId: string, jobId?: string) {
    const { rows } = await this.db.query(
      `SELECT id, job_id, kind, status, amount_cents, currency, platform_fee_cents,
              refunded_cents, failure_code, created_at
       FROM payments
       WHERE customer_user_id = $1 AND ($2::uuid IS NULL OR job_id = $2::uuid)
       ORDER BY created_at DESC LIMIT 100`,
      [userId, jobId ?? null],
    );
    return rows;
  }

  async listPayouts(userId: string) {
    const { rows } = await this.db.query(
      `SELECT id, job_id, assignment_id, kind, status, amount_cents, currency,
              platform_fee_cents, failure_code, created_at
       FROM payouts WHERE worker_user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    return rows;
  }

  /** Pending / in-transit / paid are never conflated (PRD §30). */
  async earningsSummary(userId: string) {
    const { rows } = await this.db.query<{
      pending_cents: string; in_transit_cents: string; paid_cents: string;
      today_cents: string; week_cents: string; month_cents: string; jobs_completed: string;
    }>(
      `SELECT
         COALESCE(sum(amount_cents) FILTER (WHERE status = 'PENDING'), 0) AS pending_cents,
         COALESCE(sum(amount_cents) FILTER (WHERE status = 'IN_TRANSIT'), 0) AS in_transit_cents,
         COALESCE(sum(amount_cents) FILTER (WHERE status = 'PAID'), 0) AS paid_cents,
         COALESCE(sum(amount_cents) FILTER (WHERE status IN ('IN_TRANSIT','PAID')
           AND created_at >= date_trunc('day', now())), 0) AS today_cents,
         COALESCE(sum(amount_cents) FILTER (WHERE status IN ('IN_TRANSIT','PAID')
           AND created_at >= date_trunc('week', now())), 0) AS week_cents,
         COALESCE(sum(amount_cents) FILTER (WHERE status IN ('IN_TRANSIT','PAID')
           AND created_at >= date_trunc('month', now())), 0) AS month_cents,
         count(DISTINCT job_id) FILTER (WHERE status IN ('IN_TRANSIT','PAID')) AS jobs_completed
       FROM payouts WHERE worker_user_id = $1`,
      [userId],
    );
    const r = rows[0]!;
    return {
      pending_cents: Number(r.pending_cents),
      in_transit_cents: Number(r.in_transit_cents),
      paid_cents: Number(r.paid_cents),
      today_cents: Number(r.today_cents),
      week_cents: Number(r.week_cents),
      month_cents: Number(r.month_cents),
      paid_jobs: Number(r.jobs_completed),
      currency: 'USD',
    };
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  async processWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    let event: { id: string; type: string; data: { object: Record<string, unknown> } };
    try {
      event = this.stripe.verifyWebhook(rawBody, signature);
    } catch {
      throw DomainError.validation('Invalid webhook signature');
    }

    // Insert-then-process: duplicate deliveries hit the unique constraint and no-op.
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO stripe_events (stripe_event_id, type, payload, signature_verified_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (stripe_event_id) DO NOTHING RETURNING id`,
      [event.id, event.type, JSON.stringify(event.data.object)],
    );
    if (!rows[0]) return { received: true };

    try {
      await this.handleEvent(event);
      await this.db.query('UPDATE stripe_events SET processed_at = now() WHERE id = $1', [rows[0].id]);
    } catch (err) {
      await this.db.query('UPDATE stripe_events SET processing_error = $2 WHERE id = $1', [
        rows[0].id,
        (err as Error).message,
      ]);
      this.logger.error(`Webhook ${event.type} processing failed: ${(err as Error).message}`);
    }
    return { received: true };
  }

  private async handleEvent(event: { type: string; data: { object: Record<string, unknown> } }): Promise<void> {
    const obj = event.data.object;
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.db.query(
          `UPDATE payments SET status = 'SUCCEEDED', updated_at = now()
           WHERE stripe_payment_intent_id = $1 AND status IN ('REQUIRES_PAYMENT','PROCESSING')`,
          [obj.id],
        );
        break;
      case 'payment_intent.payment_failed':
        await this.db.query(
          `UPDATE payments SET status = 'FAILED', failure_code = $2, updated_at = now()
           WHERE stripe_payment_intent_id = $1 AND status IN ('REQUIRES_PAYMENT','PROCESSING')`,
          [obj.id, (obj.last_payment_error as { code?: string } | undefined)?.code ?? 'unknown'],
        );
        break;
      case 'account.updated': {
        await this.updatePayoutAccount(obj.id as string, {
          charges_enabled: Boolean(obj.charges_enabled),
          payouts_enabled: Boolean(obj.payouts_enabled),
          requirements: obj.requirements ?? null,
        });
        break;
      }
      case 'transfer.reversed':
        await this.db.query(
          `UPDATE payouts SET status = 'REVERSED', updated_at = now() WHERE stripe_transfer_id = $1`,
          [obj.id],
        );
        break;
      default:
        // Recorded in stripe_events; intentionally unhandled.
        break;
    }
  }

  private async recordPaymentEvent(jobId: string, type: string, metadata: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO job_events (job_id, event_type, metadata) VALUES ($1, $2, $3)`,
      [jobId, type, JSON.stringify(metadata)],
    );
  }

  /** Transfers mark payouts PAID once Stripe settles them; MVP treats
   *  IN_TRANSIT → PAID via reconciliation (documented) — here we expose a
   *  hook the reconciliation job / webhook can call. */
  async markPayoutPaid(stripeTransferId: string): Promise<void> {
    await this.db.query(
      `UPDATE payouts SET status = 'PAID', updated_at = now()
       WHERE stripe_transfer_id = $1 AND status = 'IN_TRANSIT'`,
      [stripeTransferId],
    );
  }
}
