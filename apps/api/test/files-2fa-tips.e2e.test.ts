import request from 'supertest';
import { generateTotp } from '../src/common/totp';
import { TestContext, createTestApp, registerVerifiedUser, settleEvents, truncateAll } from './helpers';

/** Tiny valid 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Files, 2FA, tips', () => {
  let ctx: TestContext;
  let customer: { token: string; userId: string };
  let worker: { token: string; userId: string };
  let stranger: { token: string; userId: string };
  let categoryId = '';
  let jobId = '';
  let assignmentId = '';

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.db);

    customer = await registerVerifiedUser(ctx, 'fc@example.test', 'CUSTOMER');
    worker = await registerVerifiedUser(ctx, 'fw@example.test', 'WORKER');
    stranger = await registerVerifiedUser(ctx, 'fs@example.test', 'CUSTOMER');

    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (slug, name, enabled) VALUES ('moving-help','Moving Help',true) RETURNING id`,
    );
    categoryId = rows[0]!.id;
    await ctx.db.query(
      `INSERT INTO platform_fees (name, percent_bps, fixed_cents, currency) VALUES ('default', 1500, 0, 'USD')`,
    );

    await request(server())
      .put('/v1/me/worker-profile')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ display_name: 'File Worker', home_location: { lat: 30.27, lng: -97.74 } })
      .expect(200);

    // Customer payment method + worker payout account (for tips).
    await request(server())
      .post('/v1/me/payment-methods/setup-intent')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const { rows: pc } = await ctx.db.query<{ stripe_customer_id: string }>(
      'SELECT stripe_customer_id FROM payment_customers WHERE user_id = $1',
      [customer.userId],
    );
    const pm = ctx.stripe.attachPaymentMethod(pc[0]!.stripe_customer_id);
    await request(server())
      .post('/v1/me/payment-methods/default')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ payment_method_id: pm })
      .expect(200);
    await request(server())
      .post('/v1/me/payout-account/onboarding-link')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ refresh_url: 'https://app.example/r', return_url: 'https://app.example/x' })
      .expect(200);
    const { rows: pa } = await ctx.db.query<{ stripe_account_id: string }>(
      'SELECT stripe_account_id FROM payout_accounts WHERE worker_user_id = $1',
      [worker.userId],
    );
    ctx.stripe.completeOnboarding(pa[0]!.stripe_account_id);
    await request(server())
      .post('/v1/me/payout-account/refresh')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  // ── Files ──────────────────────────────────────────────────────────────────

  it('uploads a photo, rejects spoofed and non-image content', async () => {
    const ok = await request(server())
      .post('/v1/files?kind=JOB_PHOTO')
      .set('Authorization', `Bearer ${customer.token}`)
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);
    expect(ok.body.content_type).toBe('image/png');

    // Text bytes with an image extension/claim → rejected by magic bytes.
    const spoofed = await request(server())
      .post('/v1/files?kind=JOB_PHOTO')
      .set('Authorization', `Bearer ${customer.token}`)
      .attach('file', Buffer.from('#!/bin/sh\nrm -rf /'), { filename: 'evil.png', contentType: 'image/png' })
      .expect(422);
    expect(spoofed.body.error.message).toContain('JPEG, PNG, or WebP');

    await request(server())
      .post('/v1/files?kind=NOT_A_KIND')
      .set('Authorization', `Bearer ${customer.token}`)
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' })
      .expect(422);
  });

  it('attaches photos to own jobs only; visibility follows the job', async () => {
    const upload = await request(server())
      .post('/v1/files?kind=JOB_PHOTO')
      .set('Authorization', `Bearer ${customer.token}`)
      .attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);
    const fileId = upload.body.id;

    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        title: 'Photo job for files testing',
        description: 'Move things; photos attached for size estimation.',
        category_id: categoryId,
        address_line1: '1 Photo St',
        city: 'Austin',
        region: 'TX',
        postal_code: '78701',
        location: { lat: 30.2672, lng: -97.7431 },
        timezone: 'UTC',
        urgency: 'ASAP',
        estimated_duration_minutes: 60,
        workers_needed: 1,
        pay_type: 'FLAT',
        pay_cents: 6000,
      })
      .expect(201);
    jobId = job.body.id;

    await request(server())
      .post(`/v1/jobs/${jobId}/photos`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ file_id: fileId })
      .expect(201);

    // A stranger cannot attach the customer's file to their own job (ownership).
    await request(server())
      .post(`/v1/jobs/${jobId}/photos`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ file_id: fileId })
      .expect(404);

    // Photo id appears in the job view; content is served to authenticated viewers.
    const view = await request(server())
      .get(`/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(view.body.photo_file_ids).toEqual([fileId]);

    const content = await request(server())
      .get(`/v1/files/${fileId}/content`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(content.headers['content-type']).toBe('image/png');
    expect(content.body.length).toBe(PNG.length);

    // Unauthenticated access denied.
    await request(server()).get(`/v1/files/${fileId}/content`).expect(401);
  });

  // ── TOTP 2FA ───────────────────────────────────────────────────────────────

  it('TOTP enrollment enforces the second factor at sign-in', async () => {
    const setup = await request(server())
      .post('/v1/auth/2fa/setup')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const secret = setup.body.secret as string;
    expect(setup.body.otpauth_url).toContain('otpauth://');

    // Wrong code cannot enable.
    await request(server())
      .post('/v1/auth/2fa/enable')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ code: '000000' })
      .expect(401);

    await request(server())
      .post('/v1/auth/2fa/enable')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ code: generateTotp(secret) })
      .expect(200);

    // Password alone no longer signs in.
    const missing = await request(server())
      .post('/v1/auth/login')
      .send({ email: 'fc@example.test', password: 'password-123456' })
      .expect(401);
    expect(missing.body.error.code).toBe('TOTP_REQUIRED');

    const bad = await request(server())
      .post('/v1/auth/login')
      .send({ email: 'fc@example.test', password: 'password-123456', totp_code: '123456' })
      .expect(401);
    expect(['TOTP_INVALID', 'TOTP_REQUIRED']).toContain(bad.body.error.code);

    const good = await request(server())
      .post('/v1/auth/login')
      .send({
        email: 'fc@example.test',
        password: 'password-123456',
        totp_code: generateTotp(secret),
      })
      .expect(200);
    customer.token = good.body.tokens.access_token;
  });

  // ── Tips ───────────────────────────────────────────────────────────────────

  it('customer tips the worker after completion; full amount, no fee, once only', async () => {
    const a = await request(server())
      .post(`/v1/jobs/${jobId}/accept`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    assignmentId = a.body.id;
    for (const step of ['en-route', 'arrived', 'start', 'complete']) {
      await request(server())
        .post(`/v1/assignments/${assignmentId}/${step}`)
        .set('Authorization', `Bearer ${worker.token}`)
        .expect(200);
    }

    // Tips are blocked before completion confirmation? Job is COMPLETION_PENDING
    // → not yet in a tippable state.
    await request(server())
      .post(`/v1/jobs/${jobId}/tip`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ assignment_id: assignmentId, amount_cents: 1000 })
      .expect(409);

    await request(server())
      .post(`/v1/jobs/${jobId}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    await settleEvents(300);

    const transfersBefore = ctx.stripe.transfers.length;
    await request(server())
      .post(`/v1/jobs/${jobId}/tip`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ assignment_id: assignmentId, amount_cents: 1000 })
      .expect(200);

    // Full $10 reaches the worker (no platform fee on tips).
    expect(ctx.stripe.transfers.length).toBe(transfersBefore + 1);
    expect(ctx.stripe.transfers[ctx.stripe.transfers.length - 1]!.amount).toBe(1000);

    const payouts = await request(server())
      .get('/v1/me/payouts')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    const tip = payouts.body.items.find((p: { kind: string }) => p.kind === 'TIP');
    expect(tip.status).toBe('IN_TRANSIT');
    expect(Number(tip.amount_cents)).toBe(1000);
    expect(Number(tip.platform_fee_cents)).toBe(0);

    // Second tip on the same assignment is rejected (one-per-assignment MVP).
    await request(server())
      .post(`/v1/jobs/${jobId}/tip`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ assignment_id: assignmentId, amount_cents: 500 })
      .expect(409);

    // A stranger cannot tip someone else's job.
    await request(server())
      .post(`/v1/jobs/${jobId}/tip`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ assignment_id: assignmentId, amount_cents: 500 })
      .expect(404);
  });
});
