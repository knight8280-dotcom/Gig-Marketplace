import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

/**
 * Gateway abstraction over Stripe (ADR-004). All Stripe API access goes
 * through this interface so:
 *  - payment logic is testable with a deterministic fake (tests only),
 *  - the Stripe API surface we use is explicit and reviewable against
 *    current official documentation before pilot launch.
 */
export interface PaymentIntentResult {
  id: string;
  status: string;
  latest_charge_id: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
}

export interface StripeGateway {
  createCustomer(email: string, userId: string): Promise<{ id: string }>;
  createSetupIntent(customerId: string): Promise<{ id: string; client_secret: string }>;
  getPaymentMethodCustomer(paymentMethodId: string): Promise<string | null>;
  /** After the client confirms a SetupIntent, read its resulting payment method. */
  getSetupIntent(setupIntentId: string): Promise<{ status: string; payment_method: string | null; customer: string | null }>;
  /** Create AND confirm an off-session PaymentIntent (charge at fill). */
  chargeCustomer(params: {
    amountCents: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<PaymentIntentResult>;
  refund(params: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ id: string; status: string }>;
  createExpressAccount(email: string, userId: string): Promise<{ id: string }>;
  createAccountOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string }>;
  getAccountStatus(accountId: string): Promise<{
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements: unknown;
  }>;
  createTransfer(params: {
    amountCents: number;
    currency: string;
    destinationAccountId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string }>;
  /** Verify a webhook signature and return the parsed event. Throws when invalid. */
  verifyWebhook(rawBody: Buffer, signature: string): { id: string; type: string; data: { object: Record<string, unknown> } };
}

export const STRIPE_GATEWAY = 'STRIPE_GATEWAY';

/**
 * Real Stripe implementation. Requires STRIPE_SECRET_KEY (+ webhook secret).
 * NOTE (Phase 19 gate): exercise this against Stripe test mode with real test
 * keys and current official docs before pilot launch. Payment logic and
 * idempotency live in PaymentsService, not here.
 */
@Injectable()
export class RealStripeGateway implements StripeGateway {
  private readonly logger = new Logger(RealStripeGateway.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key.startsWith('sk_test_replace')) {
      // Fail loudly at first use, not at boot — dev environments without keys
      // can still run every non-payment feature. No fake payment behavior.
      this.logger.warn('STRIPE_SECRET_KEY is not configured — payment endpoints will fail until it is set');
    }
    this.stripe = new Stripe(key ?? 'sk_missing');
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  }

  async createCustomer(email: string, userId: string): Promise<{ id: string }> {
    const customer = await this.stripe.customers.create(
      { email, metadata: { user_id: userId } },
      { idempotencyKey: `customer:${userId}` },
    );
    return { id: customer.id };
  }

  async createSetupIntent(customerId: string): Promise<{ id: string; client_secret: string }> {
    const si = await this.stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    return { id: si.id, client_secret: si.client_secret! };
  }

  async getPaymentMethodCustomer(paymentMethodId: string): Promise<string | null> {
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    return typeof pm.customer === 'string' ? pm.customer : (pm.customer?.id ?? null);
  }

  async getSetupIntent(setupIntentId: string) {
    const si = await this.stripe.setupIntents.retrieve(setupIntentId);
    return {
      status: si.status,
      payment_method: typeof si.payment_method === 'string' ? si.payment_method : (si.payment_method?.id ?? null),
      customer: typeof si.customer === 'string' ? si.customer : (si.customer?.id ?? null),
    };
  }

  async chargeCustomer(params: {
    amountCents: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<PaymentIntentResult> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: params.amountCents,
          currency: params.currency.toLowerCase(),
          customer: params.customerId,
          payment_method: params.paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: params.metadata,
        },
        { idempotencyKey: params.idempotencyKey },
      );
      return {
        id: pi.id,
        status: pi.status,
        latest_charge_id: typeof pi.latest_charge === 'string' ? pi.latest_charge : (pi.latest_charge?.id ?? null),
      };
    } catch (err) {
      const stripeErr = err as Stripe.errors.StripeError & { payment_intent?: Stripe.PaymentIntent };
      if (stripeErr.payment_intent) {
        return {
          id: stripeErr.payment_intent.id,
          status: 'failed',
          latest_charge_id: null,
          failure_code: stripeErr.code ?? null,
          failure_message: stripeErr.message,
        };
      }
      throw err;
    }
  }

  async refund(params: { paymentIntentId: string; amountCents: number; idempotencyKey: string }) {
    const refund = await this.stripe.refunds.create(
      { payment_intent: params.paymentIntentId, amount: params.amountCents },
      { idempotencyKey: params.idempotencyKey },
    );
    return { id: refund.id, status: refund.status ?? 'unknown' };
  }

  /**
   * Worker payout account — Accounts v2 recipient configuration (current
   * Stripe guidance; v1 `type: 'express'` is deprecated for new platforms).
   * Marketplace defaults: express dashboard, platform collects fees and owns
   * losses, `stripe_transfers` capability for /v1/transfers payouts.
   */
  async createExpressAccount(email: string, userId: string): Promise<{ id: string }> {
    const account = await this.stripe.v2.core.accounts.create(
      {
        contact_email: email,
        display_name: email,
        dashboard: 'express',
        // ISO 3166-1 alpha-2; required before configuring a recipient. The
        // pilot is US-only (PRD) — override for other markets.
        identity: { country: process.env.STRIPE_ACCOUNT_COUNTRY ?? 'US' },
        defaults: {
          responsibilities: { fees_collector: 'application', losses_collector: 'application' },
        },
        configuration: {
          recipient: {
            capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
          },
        },
        metadata: { user_id: userId },
      },
      { idempotencyKey: `account:${userId}` },
    );
    return { id: account.id };
  }

  async createAccountOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string) {
    const link = await this.stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: refreshUrl,
          return_url: returnUrl,
        },
      },
    });
    return { url: link.url };
  }

  async getAccountStatus(accountId: string) {
    const account = await this.stripe.v2.core.accounts.retrieve(accountId, {
      include: ['configuration.recipient', 'requirements'],
    });
    // v2 capability status replaces the deprecated v1 charges_enabled /
    // payouts_enabled booleans. For recipient accounts, transfer readiness is
    // the single capability that gates payouts.
    const transfersActive =
      account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === 'active';
    return {
      charges_enabled: transfersActive,
      payouts_enabled: transfersActive,
      requirements: account.requirements ?? null,
    };
  }

  async createTransfer(params: {
    amountCents: number;
    currency: string;
    destinationAccountId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string }> {
    const transfer = await this.stripe.transfers.create(
      {
        amount: params.amountCents,
        currency: params.currency.toLowerCase(),
        destination: params.destinationAccountId,
        metadata: params.metadata,
      },
      { idempotencyKey: params.idempotencyKey },
    );
    return { id: transfer.id };
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    return event as unknown as { id: string; type: string; data: { object: Record<string, unknown> } };
  }
}
