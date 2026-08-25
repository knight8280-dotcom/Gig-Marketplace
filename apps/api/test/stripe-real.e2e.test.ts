import Stripe from 'stripe';
import { RealStripeGateway } from '../src/modules/payments/stripe.gateway';

/**
 * REAL Stripe test-mode smoke test (Phase 19 gate).
 *
 * Runs only when a Stripe TEST secret key is available (Stripe_sk_test or a
 * test-mode STRIPE_SECRET_KEY). Skipped otherwise — e.g. in CI without
 * credentials — so the rest of the suite stays deterministic via the fake
 * gateway. Never runs against live keys.
 *
 * Exercises the exact RealStripeGateway code paths the app uses:
 * customer creation, SetupIntent, payment-method reads, off-session charge
 * (success and card-declined), refund, and Express account + onboarding link.
 */
const candidate = process.env.Stripe_sk_test ?? process.env.STRIPE_SECRET_KEY ?? '';
const testKey = candidate.startsWith('sk_test') || candidate.startsWith('rk_test') ? candidate : '';
const describeReal = testKey ? describe : describe.skip;

describeReal('RealStripeGateway against Stripe test mode', () => {
  jest.setTimeout(120_000);

  let gateway: RealStripeGateway;
  let stripe: Stripe;
  const createdCustomers: string[] = [];

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = testKey;
    gateway = new RealStripeGateway();
    stripe = new Stripe(testKey);
  });

  afterAll(async () => {
    for (const id of createdCustomers) {
      await stripe.customers.del(id).catch(() => undefined);
    }
  });

  const uniqueUserId = () => `test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const customerWithCard = async (card: string): Promise<{ customerId: string; paymentMethodId: string }> => {
    const userId = uniqueUserId();
    const { id: customerId } = await gateway.createCustomer(`${userId}@example.test`, userId);
    createdCustomers.push(customerId);
    const pm = await stripe.paymentMethods.attach(card, { customer: customerId });
    return { customerId, paymentMethodId: pm.id };
  };

  it('creates a customer and a confirmable SetupIntent', async () => {
    const userId = uniqueUserId();
    const { id: customerId } = await gateway.createCustomer(`${userId}@example.test`, userId);
    createdCustomers.push(customerId);
    expect(customerId).toMatch(/^cus_/);

    const si = await gateway.createSetupIntent(customerId);
    expect(si.id).toMatch(/^seti_/);
    expect(si.client_secret).toContain(si.id);

    const fetched = await gateway.getSetupIntent(si.id);
    expect(fetched.status).toBe('requires_payment_method');
    expect(fetched.customer).toBe(customerId);
  });

  it('charges a saved card off-session and refunds it', async () => {
    const { customerId, paymentMethodId } = await customerWithCard('pm_card_visa');
    expect(await gateway.getPaymentMethodCustomer(paymentMethodId)).toBe(customerId);

    const charge = await gateway.chargeCustomer({
      amountCents: 12_50,
      currency: 'usd',
      customerId,
      paymentMethodId,
      idempotencyKey: `test-charge-${customerId}`,
      metadata: { purpose: 'real-stripe-smoke-test' },
    });
    expect(charge.status).toBe('succeeded');
    expect(charge.latest_charge_id).toMatch(/^ch_/);

    // Idempotency: same key returns the same PaymentIntent, no double charge.
    const repeat = await gateway.chargeCustomer({
      amountCents: 12_50,
      currency: 'usd',
      customerId,
      paymentMethodId,
      idempotencyKey: `test-charge-${customerId}`,
      metadata: { purpose: 'real-stripe-smoke-test' },
    });
    expect(repeat.id).toBe(charge.id);

    const refund = await gateway.refund({
      paymentIntentId: charge.id,
      amountCents: 12_50,
      idempotencyKey: `test-refund-${customerId}`,
    });
    expect(refund.id).toMatch(/^re_/);
    expect(['succeeded', 'pending']).toContain(refund.status);
  });

  it('surfaces a declined off-session charge as a failed result, not a crash', async () => {
    const { customerId, paymentMethodId } = await customerWithCard('pm_card_chargeCustomerFail');
    const charge = await gateway.chargeCustomer({
      amountCents: 10_00,
      currency: 'usd',
      customerId,
      paymentMethodId,
      idempotencyKey: `test-decline-${customerId}`,
      metadata: { purpose: 'real-stripe-smoke-test' },
    });
    expect(charge.status).toBe('failed');
    expect(charge.failure_code).toBeTruthy();
  });

  it('creates an Express connected account and an onboarding link (when Connect is enabled)', async () => {
    const userId = uniqueUserId();
    try {
      const { id: accountId } = await gateway.createExpressAccount(`${userId}@example.test`, userId);
      expect(accountId).toMatch(/^acct_/);

      const link = await gateway.createAccountOnboardingLink(
        accountId,
        'https://app.example/refresh',
        'https://app.example/return',
      );
      expect(link.url).toContain('connect.stripe.com');

      const status = await gateway.getAccountStatus(accountId);
      expect(status.payouts_enabled).toBe(false); // onboarding not completed

      await stripe.accounts.del(accountId).catch(() => undefined);
    } catch (err) {
      const message = (err as Error).message;
      if (/signed up for Connect/i.test(message)) {
        // External precondition, not a code bug: Connect must be enabled in
        // the Stripe dashboard before workers can be paid out. The
        // verify:providers tool reports this as a readiness failure; here we
        // warn loudly and skip so code-correctness CI stays meaningful.
        // eslint-disable-next-line no-console
        console.warn(
          '\n⚠ SKIPPED: Stripe Connect is not enabled on this account — worker payouts will not work. ' +
            'Enable it at https://dashboard.stripe.com/connect\n',
        );
        return;
      }
      throw err;
    }
  });
});
