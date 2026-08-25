import { createHmac } from 'node:crypto';
import type { PaymentIntentResult, StripeGateway } from '../src/modules/payments/stripe.gateway';

/**
 * Deterministic in-memory Stripe test double — AUTOMATED TESTS ONLY.
 * Simulates the exact gateway surface PaymentsService uses, including
 * idempotency-key replay semantics, so payment logic is tested realistically
 * without network access. Production always uses RealStripeGateway.
 */
export class FakeStripeGateway implements StripeGateway {
  customers = new Map<string, { email: string; userId: string }>();
  paymentMethods = new Map<string, { customerId: string; failNextCharge?: boolean }>();
  paymentIntents = new Map<string, { amount: number; customerId: string; status: string }>();
  refunds: Array<{ paymentIntentId: string; amount: number }> = [];
  transfers: Array<{ id: string; amount: number; destination: string }> = [];
  accounts = new Map<string, { payouts_enabled: boolean; charges_enabled: boolean }>();
  private idempotencyReplay = new Map<string, unknown>();
  private counter = 0;

  /** Test control: make the next charge for this PM fail (card decline). */
  failChargesFor = new Set<string>();

  private id(prefix: string): string {
    this.counter += 1;
    return `${prefix}_fake_${this.counter}`;
  }

  private replay<T>(key: string, produce: () => T): T {
    if (this.idempotencyReplay.has(key)) return this.idempotencyReplay.get(key) as T;
    const value = produce();
    this.idempotencyReplay.set(key, value);
    return value;
  }

  async createCustomer(email: string, userId: string): Promise<{ id: string }> {
    const id = this.id('cus');
    this.customers.set(id, { email, userId });
    return { id };
  }

  setupIntents = new Map<string, { customerId: string; confirmedPm: string | null }>();

  async createSetupIntent(customerId: string): Promise<{ id: string; client_secret: string }> {
    const id = this.id('seti');
    this.setupIntents.set(id, { customerId, confirmedPm: null });
    return { id, client_secret: `seti_secret_${customerId}` };
  }

  /** Test helper: simulate the client confirming the setup intent with a card. */
  confirmSetupIntent(setupIntentId: string): string {
    const si = this.setupIntents.get(setupIntentId);
    if (!si) throw new Error('unknown setup intent');
    const pm = this.attachPaymentMethod(si.customerId);
    si.confirmedPm = pm;
    return pm;
  }

  async getSetupIntent(setupIntentId: string) {
    const si = this.setupIntents.get(setupIntentId);
    if (!si) return { status: 'unknown', payment_method: null, customer: null };
    return {
      status: si.confirmedPm ? 'succeeded' : 'requires_payment_method',
      payment_method: si.confirmedPm,
      customer: si.customerId,
    };
  }

  /** Test helper: attach a card to a customer (simulates client-side confirm). */
  attachPaymentMethod(customerId: string): string {
    const id = this.id('pm');
    this.paymentMethods.set(id, { customerId });
    return id;
  }

  async getPaymentMethodCustomer(paymentMethodId: string): Promise<string | null> {
    return this.paymentMethods.get(paymentMethodId)?.customerId ?? null;
  }

  async chargeCustomer(params: {
    amountCents: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<PaymentIntentResult> {
    return this.replay(params.idempotencyKey, () => {
      if (this.failChargesFor.has(params.paymentMethodId)) {
        return {
          id: this.id('pi'),
          status: 'failed',
          latest_charge_id: null,
          failure_code: 'card_declined',
          failure_message: 'Your card was declined (test)',
        };
      }
      const id = this.id('pi');
      this.paymentIntents.set(id, {
        amount: params.amountCents,
        customerId: params.customerId,
        status: 'succeeded',
      });
      return { id, status: 'succeeded', latest_charge_id: this.id('ch') };
    });
  }

  async refund(params: { paymentIntentId: string; amountCents: number; idempotencyKey: string }) {
    return this.replay(params.idempotencyKey, () => {
      this.refunds.push({ paymentIntentId: params.paymentIntentId, amount: params.amountCents });
      return { id: this.id('re'), status: 'succeeded' };
    });
  }

  async createExpressAccount(_email: string, _userId: string): Promise<{ id: string }> {
    const id = this.id('acct');
    this.accounts.set(id, { payouts_enabled: false, charges_enabled: false });
    return { id };
  }

  async createAccountOnboardingLink(accountId: string) {
    return { url: `https://connect.stripe.example/onboard/${accountId}` };
  }

  /** Test helper: simulate completed Express onboarding. */
  completeOnboarding(accountId: string): void {
    this.accounts.set(accountId, { payouts_enabled: true, charges_enabled: true });
  }

  async getAccountStatus(accountId: string) {
    const account = this.accounts.get(accountId) ?? { payouts_enabled: false, charges_enabled: false };
    return { ...account, requirements: null };
  }

  async createTransfer(params: {
    amountCents: number;
    currency: string;
    destinationAccountId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string }> {
    return this.replay(params.idempotencyKey, () => {
      const id = this.id('tr');
      this.transfers.push({ id, amount: params.amountCents, destination: params.destinationAccountId });
      return { id };
    });
  }

  /** Webhook signature: HMAC with a fixed test secret (mirrors real verification shape). */
  static readonly WEBHOOK_SECRET = 'whsec_test_fake';

  static sign(payload: string): string {
    return createHmac('sha256', FakeStripeGateway.WEBHOOK_SECRET).update(payload).digest('hex');
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    const expected = FakeStripeGateway.sign(rawBody.toString());
    if (signature !== expected) throw new Error('Invalid signature');
    return JSON.parse(rawBody.toString()) as { id: string; type: string; data: { object: Record<string, unknown> } };
  }
}
