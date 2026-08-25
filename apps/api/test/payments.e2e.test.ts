import request from 'supertest';
import { TestContext, createTestApp, registerVerifiedUser, settleEvents, truncateAll } from './helpers';
import { FakeStripeGateway } from './fake-stripe.gateway';
import { PaymentsService } from '../src/modules/payments/payments.service';

/** Phases 10, 12, 13, 14: payments, cancellation money, disputes, notifications. */
describe('Payments, disputes, notifications (Phases 10–14)', () => {
  let ctx: TestContext;
  let customer: { token: string; userId: string };
  let worker1: { token: string; userId: string };
  let worker2: { token: string; userId: string };
  let adminToken = '';
  let categoryId = '';
  let customerPmId = '';

  const server = () => ctx.app.getHttpServer();

  const jobPayload = (overrides: Record<string, unknown> = {}) => ({
    title: 'Payment flow verification job',
    description: 'Move boxes; this job exists to verify money flows.',
    category_id: categoryId,
    address_line1: '77 Pay St',
    city: 'Austin',
    region: 'TX',
    postal_code: '78701',
    location: { lat: 30.2672, lng: -97.7431 },
    timezone: 'America/Chicago',
    urgency: 'SCHEDULED',
    scheduled_start_at: new Date(Date.now() + 48 * 3600e3).toISOString(),
    estimated_duration_minutes: 120,
    workers_needed: 1,
    pay_type: 'FLAT',
    pay_cents: 10000,
    ...overrides,
  });

  const runLifecycle = async (jobId: string, workers: Array<{ token: string }>) => {
    for (const w of workers) {
      const a = await request(server())
        .post(`/v1/jobs/${jobId}/accept`)
        .set('Authorization', `Bearer ${w.token}`)
        .expect(200);
      (w as { assignmentId?: string }).assignmentId = a.body.id;
    }
    await settleEvents();
    for (const w of workers) {
      const id = (w as { assignmentId?: string }).assignmentId;
      for (const step of ['en-route', 'arrived', 'start', 'complete']) {
        await request(server())
          .post(`/v1/assignments/${id}/${step}`)
          .set('Authorization', `Bearer ${w.token}`)
          .expect(200);
      }
    }
  };

  const onboardWorkerPayout = async (w: { token: string; userId: string }) => {
    await request(server())
      .post('/v1/me/payout-account/onboarding-link')
      .set('Authorization', `Bearer ${w.token}`)
      .send({ refresh_url: 'https://app.example/refresh', return_url: 'https://app.example/return' })
      .expect(200);
    const { rows } = await ctx.db.query<{ stripe_account_id: string }>(
      'SELECT stripe_account_id FROM payout_accounts WHERE worker_user_id = $1',
      [w.userId],
    );
    ctx.stripe.completeOnboarding(rows[0]!.stripe_account_id);
    const refreshed = await request(server())
      .post('/v1/me/payout-account/refresh')
      .set('Authorization', `Bearer ${w.token}`)
      .expect(200);
    expect(refreshed.body.payouts_enabled).toBe(true);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.db);

    customer = await registerVerifiedUser(ctx, 'payc@example.test', 'CUSTOMER');
    worker1 = await registerVerifiedUser(ctx, 'payw1@example.test', 'WORKER');
    worker2 = await registerVerifiedUser(ctx, 'payw2@example.test', 'WORKER');

    await request(server())
      .post('/v1/auth/register')
      .send({ email: 'admin@example.test', password: 'admin-password-1', role: 'CUSTOMER' })
      .expect(201);
    await ctx.db.query(`UPDATE users SET roles = '{ADMIN}' WHERE email = 'admin@example.test'`);
    adminToken = (
      await request(server())
        .post('/v1/auth/login')
        .send({ email: 'admin@example.test', password: 'admin-password-1' })
        .expect(200)
    ).body.tokens.access_token;

    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (slug, name, enabled) VALUES ('moving-help','Moving Help',true) RETURNING id`,
    );
    categoryId = rows[0]!.id;

    // 15% + $0 platform fee (config row, as seeds would create).
    await ctx.db.query(
      `INSERT INTO platform_fees (name, percent_bps, fixed_cents, currency) VALUES ('default', 1500, 0, 'USD')`,
    );

    for (const w of [worker1, worker2]) {
      await request(server())
        .put('/v1/me/worker-profile')
        .set('Authorization', `Bearer ${w.token}`)
        .send({ display_name: 'Pay Worker', home_location: { lat: 30.27, lng: -97.74 } })
        .expect(200);
    }

    // Customer adds a payment method (SetupIntent → client confirm simulated → default).
    await request(server())
      .post('/v1/me/payment-methods/setup-intent')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const { rows: pc } = await ctx.db.query<{ stripe_customer_id: string }>(
      'SELECT stripe_customer_id FROM payment_customers WHERE user_id = $1',
      [customer.userId],
    );
    customerPmId = ctx.stripe.attachPaymentMethod(pc[0]!.stripe_customer_id);
    await request(server())
      .post('/v1/me/payment-methods/default')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ payment_method_id: customerPmId })
      .expect(200);

    await onboardWorkerPayout(worker1);
    await onboardWorkerPayout(worker2);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('rejects a foreign payment method (ownership check)', async () => {
    const foreignPm = ctx.stripe.attachPaymentMethod('cus_someone_else');
    await request(server())
      .post('/v1/me/payment-methods/default')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ payment_method_id: foreignPm })
      .expect(422);
  });

  it('golden money flow: fill → charge → complete → confirm → payouts → PAID', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ workers_needed: 2, title: 'Two-worker golden money flow' }))
      .expect(201);

    await runLifecycle(job.body.id, [worker1, worker2]);

    // Charge happened at fill: 2 workers × $100 = $200 gross, 15% fee = $30.
    const payments = await request(server())
      .get(`/v1/me/payments?job_id=${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const charge = payments.body.items.find((p: { kind: string }) => p.kind === 'JOB_PAYMENT');
    expect(charge.status).toBe('SUCCEEDED');
    expect(Number(charge.amount_cents)).toBe(20000);
    expect(Number(charge.platform_fee_cents)).toBe(3000);

    await request(server())
      .post(`/v1/jobs/${job.body.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    await settleEvents(300);

    // Each worker: $100 gross − 15% fee = $85 net, IN_TRANSIT via transfer.
    const payouts = await request(server())
      .get('/v1/me/payouts')
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    const payout = payouts.body.items[0];
    expect(payout.status).toBe('IN_TRANSIT');
    expect(Number(payout.amount_cents)).toBe(8500);
    expect(ctx.stripe.transfers.filter((t) => t.amount === 8500)).toHaveLength(2);

    const view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('PAID');

    // Earnings summary separates in-transit from pending/paid.
    const earnings = await request(server())
      .get('/v1/me/earnings')
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    expect(earnings.body.in_transit_cents).toBe(8500);
    expect(earnings.body.paid_cents).toBe(0);

    // Notifications flowed to both sides.
    const workerNotifs = await request(server())
      .get('/v1/notifications')
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    expect(workerNotifs.body.items.map((n: { type: string }) => n.type)).toEqual(
      expect.arrayContaining(['COMPLETION_CONFIRMED', 'PAYOUT_RELEASED']),
    );
  });

  it('releasing payouts twice never double-pays (idempotent, DB-guaranteed)', async () => {
    const transfersBefore = ctx.stripe.transfers.length;
    const jobs = await request(server())
      .get('/v1/jobs/mine?state=PAID')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const paidJobId = jobs.body.items[0].id;

    const paymentsService = ctx.app.get(PaymentsService);
    await paymentsService.releasePayouts(paidJobId);
    await paymentsService.releasePayouts(paidJobId);
    expect(ctx.stripe.transfers.length).toBe(transfersBefore);

    const { rows } = await ctx.db.query(
      `SELECT count(*) AS n FROM payouts WHERE job_id = $1 AND kind = 'JOB_EARNINGS'`,
      [paidJobId],
    );
    expect(Number((rows[0] as { n: string }).n)).toBe(2);
  });

  it('charge failure: honest FAILED state, notification, retry after fixing card', async () => {
    ctx.stripe.failChargesFor.add(customerPmId);

    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ title: 'Charge failure and retry test job' }))
      .expect(201);
    await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    await settleEvents();

    const payments = await request(server())
      .get(`/v1/me/payments?job_id=${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(payments.body.items[0].status).toBe('FAILED');
    expect(payments.body.items[0].failure_code).toBe('card_declined');

    const notifs = await request(server())
      .get('/v1/notifications')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(notifs.body.items.map((n: { type: string }) => n.type)).toContain('PAYMENT_FAILED');

    // Fix the card → retry succeeds with a fresh ledger row.
    ctx.stripe.failChargesFor.delete(customerPmId);
    await request(server())
      .post(`/v1/jobs/${job.body.id}/retry-payment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const after = await request(server())
      .get(`/v1/me/payments?job_id=${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const statuses = after.body.items.map((p: { status: string }) => p.status).sort();
    expect(statuses).toEqual(['CANCELLED', 'SUCCEEDED']);
  });

  it('late customer cancellation refunds per policy (75%) and records the ledger', async () => {
    // Starts in 2h — inside the 4h free-cancel window → 25% late fee.
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({
        title: 'Late cancellation refund test job',
        scheduled_start_at: new Date(Date.now() + 2 * 3600e3).toISOString(),
      }))
      .expect(201);
    await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    await settleEvents();

    const preview = await request(server())
      .get(`/v1/jobs/${job.body.id}/cancellation-preview`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(preview.body.refund_bps).toBe(7500);

    await request(server())
      .post(`/v1/jobs/${job.body.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Plans changed late', acknowledged_consequences: true })
      .expect(200);
    await settleEvents(300);

    const payments = await request(server())
      .get(`/v1/me/payments?job_id=${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const refund = payments.body.items.find((p: { kind: string }) => p.kind === 'REFUND');
    expect(refund.status).toBe('SUCCEEDED');
    expect(Number(refund.amount_cents)).toBe(7500);
    const original = payments.body.items.find((p: { kind: string }) => p.kind === 'JOB_PAYMENT');
    expect(original.status).toBe('PARTIALLY_REFUNDED');
    expect(ctx.stripe.refunds.some((r) => r.amount === 7500)).toBe(true);
  });

  it('disputes pause payouts; admin RELEASE resolution releases them', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ title: 'Dispute pause and release test' }))
      .expect(201);
    await runLifecycle(job.body.id, [worker1]);
    await settleEvents();

    // Customer reports a problem instead of confirming.
    const dispute = await request(server())
      .post('/v1/disputes')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ job_id: job.body.id, category: 'INCOMPLETE_WORK', description: 'Half the boxes were not moved.' })
      .expect(201);
    expect(dispute.body.status).toBe('OPEN');

    const view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('DISPUTED');

    // No payouts while disputed.
    const paymentsService = ctx.app.get(PaymentsService);
    const transfersBefore = ctx.stripe.transfers.length;
    await paymentsService.releasePayouts(job.body.id);
    expect(ctx.stripe.transfers.length).toBe(transfersBefore);

    // Outsider cannot see the dispute; worker (party) can.
    await request(server())
      .get(`/v1/disputes/${dispute.body.id}`)
      .set('Authorization', `Bearer ${worker2.token}`)
      .expect(404);
    await request(server())
      .get(`/v1/disputes/${dispute.body.id}`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);

    // Worker adds evidence; non-admin cannot resolve.
    await request(server())
      .post(`/v1/disputes/${dispute.body.id}/evidence`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .send({ note: 'I moved everything that was accessible; photos available.' })
      .expect(201);
    await request(server())
      .post(`/v1/admin/disputes/${dispute.body.id}/resolve`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ resolution: 'RELEASE', reason: 'nope' })
      .expect(403);

    // Admin reviews full evidence and releases.
    const detail = await request(server())
      .get(`/v1/admin/disputes/${dispute.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.evidence.length).toBeGreaterThanOrEqual(2);
    expect(detail.body.timeline.length).toBeGreaterThan(0);

    await request(server())
      .post(`/v1/admin/disputes/${dispute.body.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'RELEASE', reason: 'Work verified complete via evidence' })
      .expect(200);
    await settleEvents(300);

    expect(ctx.stripe.transfers.length).toBe(transfersBefore + 1);
    const finalView = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(finalView.body.state).toBe('PAID');

    // Resolution is audited.
    const { rows } = await ctx.db.query(
      `SELECT 1 FROM audit_logs WHERE action = 'dispute.resolved' AND entity_id = $1`,
      [dispute.body.id],
    );
    expect(rows).toHaveLength(1);
  });

  it('webhooks: signature required, duplicates no-op (insert-then-process)', async () => {
    const { rows: pa } = await ctx.db.query<{ stripe_account_id: string }>(
      'SELECT stripe_account_id FROM payout_accounts WHERE worker_user_id = $1',
      [worker1.userId],
    );
    const event = JSON.stringify({
      id: 'evt_test_dup_1',
      type: 'account.updated',
      data: { object: { id: pa[0]!.stripe_account_id, charges_enabled: true, payouts_enabled: true, requirements: null } },
    });

    // Bad signature rejected.
    await request(server())
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', 'garbage')
      .set('content-type', 'application/json')
      .send(event)
      .expect(422);

    const signature = FakeStripeGateway.sign(event);
    await request(server())
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('content-type', 'application/json')
      .send(event)
      .expect(200);
    // Exact duplicate delivery.
    await request(server())
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('content-type', 'application/json')
      .send(event)
      .expect(200);

    const { rows } = await ctx.db.query(
      `SELECT count(*) AS n FROM stripe_events WHERE stripe_event_id = 'evt_test_dup_1'`,
    );
    expect(Number((rows[0] as { n: string }).n)).toBe(1);
  });

  it('worker without payout onboarding: payout FAILED honestly, then recovered', async () => {
    const worker3 = await registerVerifiedUser(ctx, 'payw3@example.test', 'WORKER');
    await request(server())
      .put('/v1/me/worker-profile')
      .set('Authorization', `Bearer ${worker3.token}`)
      .send({ display_name: 'No Payout Worker', home_location: { lat: 30.27, lng: -97.74 } })
      .expect(200);

    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ title: 'Missing payout account recovery test' }))
      .expect(201);
    await runLifecycle(job.body.id, [worker3]);
    await request(server())
      .post(`/v1/jobs/${job.body.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    await settleEvents(300);

    const payouts = await request(server())
      .get('/v1/me/payouts')
      .set('Authorization', `Bearer ${worker3.token}`)
      .expect(200);
    expect(payouts.body.items[0].status).toBe('FAILED');
    expect(payouts.body.items[0].failure_code).toBe('payout_account_incomplete');

    // Job is NOT PAID — money truth preserved.
    const view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('PAYMENT_PENDING');

    // Worker completes onboarding → rerun release → transfer goes out, job PAID.
    await onboardWorkerPayout(worker3);
    await ctx.app.get(PaymentsService).releasePayouts(job.body.id);
    const after = await request(server())
      .get('/v1/me/payouts')
      .set('Authorization', `Bearer ${worker3.token}`)
      .expect(200);
    expect(after.body.items[0].status).toBe('IN_TRANSIT');
    const finalView = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(finalView.body.state).toBe('PAID');
  });

  it('partially-staffed jobs are charged for actual workers when work starts', async () => {
    // 2 workers wanted, only 1 accepts, work starts anyway.
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ workers_needed: 2, title: 'Partial staffing charge test job' }))
      .expect(201);
    const a = await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    await settleEvents();

    // Not filled → no charge yet.
    let payments = await request(server())
      .get(`/v1/me/payments?job_id=${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(payments.body.items).toHaveLength(0);

    for (const step of ['en-route', 'arrived', 'start']) {
      await request(server())
        .post(`/v1/assignments/${a.body.id}/${step}`)
        .set('Authorization', `Bearer ${worker1.token}`)
        .expect(200);
    }
    await settleEvents(300);

    // Charged for 1 committed worker (not 2 × workers_needed): $100 gross.
    payments = await request(server())
      .get(`/v1/me/payments?job_id=${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const charge = payments.body.items.find((p: { kind: string }) => p.kind === 'JOB_PAYMENT');
    expect(charge.status).toBe('SUCCEEDED');
    expect(Number(charge.amount_cents)).toBe(10000);

    // Complete + confirm → payout releases normally.
    await request(server())
      .post(`/v1/assignments/${a.body.id}/complete`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    await request(server())
      .post(`/v1/jobs/${job.body.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    await settleEvents(300);
    const view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('PAID');
  });

  it('payment-sheet flow: setup intent → client confirm → sync adopts the card', async () => {
    const fresh = await registerVerifiedUser(ctx, 'sheet@example.test', 'CUSTOMER');
    const si = await request(server())
      .post('/v1/me/payment-methods/setup-intent')
      .set('Authorization', `Bearer ${fresh.token}`)
      .expect(200);
    expect(si.body.client_secret).toBeTruthy();

    // Syncing before the client confirmed is refused (no fake success).
    await request(server())
      .post('/v1/me/payment-methods/sync-setup-intent')
      .set('Authorization', `Bearer ${fresh.token}`)
      .send({ setup_intent_id: si.body.id })
      .expect(409);

    ctx.stripe.confirmSetupIntent(si.body.id);
    const synced = await request(server())
      .post('/v1/me/payment-methods/sync-setup-intent')
      .set('Authorization', `Bearer ${fresh.token}`)
      .send({ setup_intent_id: si.body.id })
      .expect(200);
    expect(synced.body.has_payment_method).toBe(true);

    // Another user cannot adopt someone else's setup intent.
    await request(server())
      .post('/v1/me/payment-methods/sync-setup-intent')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ setup_intent_id: si.body.id })
      .expect(422);
  });

  it('admin overview reports sane marketplace metrics', async () => {
    const res = await request(server())
      .get('/v1/admin/metrics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(res.body.economics.gmv_cents)).toBeGreaterThan(0);
    expect(Number(res.body.economics.revenue_cents)).toBeGreaterThan(0);
    expect(Number(res.body.jobs.completed_jobs)).toBeGreaterThan(0);

    // Admin-only.
    await request(server())
      .get('/v1/admin/metrics/overview')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('admin can suspend a user (audited) and sessions die immediately', async () => {
    const target = await registerVerifiedUser(ctx, 'suspend-me@example.test', 'CUSTOMER');
    await request(server())
      .post(`/v1/admin/users/${target.userId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Test suspension for policy violation' })
      .expect(200);

    await request(server())
      .get('/v1/me')
      .set('Authorization', `Bearer ${target.token}`)
      .expect(403);

    const { rows } = await ctx.db.query(
      `SELECT 1 FROM audit_logs WHERE action = 'admin.user_suspended' AND entity_id = $1`,
      [target.userId],
    );
    expect(rows).toHaveLength(1);
  });
});
