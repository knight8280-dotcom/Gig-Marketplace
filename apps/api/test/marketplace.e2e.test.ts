import request from 'supertest';
import { TestContext, createTestApp, registerVerifiedUser, truncateAll } from './helpers';
import { MatchingService } from '../src/modules/matching/matching.service';

/** Phases 5–8: job creation, discovery, matching, acceptance, lifecycle. */
describe('Marketplace core (Phases 5–8)', () => {
  let ctx: TestContext;
  let customer: { token: string; userId: string };
  let worker1: { token: string; userId: string };
  let worker2: { token: string; userId: string };
  let worker3: { token: string; userId: string };
  let adminToken = '';
  let movingCategoryId = '';
  let identityCategoryId = '';

  const JOB_SITE = { lat: 30.2672, lng: -97.7431 }; // Austin
  const server = () => ctx.app.getHttpServer();

  const jobPayload = (overrides: Record<string, unknown> = {}) => ({
    title: 'Unload a 26-foot moving truck',
    description: 'Two people to unload boxes and some furniture. About two hours.',
    category_id: movingCategoryId,
    address_line1: '500 Test Ave',
    city: 'Austin',
    region: 'TX',
    postal_code: '78701',
    location: JOB_SITE,
    timezone: 'America/Chicago',
    urgency: 'SCHEDULED',
    scheduled_start_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    estimated_duration_minutes: 120,
    workers_needed: 2,
    pay_type: 'FLAT',
    pay_cents: 10000,
    access_instructions: 'Gate code 9876',
    ...overrides,
  });

  const setupWorker = async (w: { token: string }, lat: number, lng: number) => {
    await request(server())
      .put('/v1/me/worker-profile')
      .set('Authorization', `Bearer ${w.token}`)
      .send({
        display_name: 'Test Worker',
        home_location: { lat, lng },
        service_radius_m: 30000,
        transportation: ['CAR'],
      })
      .expect(200);
    await request(server())
      .put('/v1/me/worker-profile/categories')
      .set('Authorization', `Bearer ${w.token}`)
      .send({ category_ids: [movingCategoryId] })
      .expect(200);
    await request(server())
      .put('/v1/me/availability')
      .set('Authorization', `Bearer ${w.token}`)
      .send({ available_now: true, windows: [] })
      .expect(200);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.db);

    customer = await registerVerifiedUser(ctx, 'boss@example.test', 'CUSTOMER');
    worker1 = await registerVerifiedUser(ctx, 'w1@example.test', 'WORKER');
    worker2 = await registerVerifiedUser(ctx, 'w2@example.test', 'WORKER');
    worker3 = await registerVerifiedUser(ctx, 'w3@example.test', 'WORKER');

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

    const cat = await request(server())
      .post('/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'moving-help', name: 'Moving Help', enabled: true })
      .expect(201);
    movingCategoryId = cat.body.id;

    const idCat = await request(server())
      .post('/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'in-home-cleaning', name: 'In-Home Cleaning', enabled: true, requires_identity_verification: true })
      .expect(201);
    identityCategoryId = idCat.body.id;

    await ctx.db.query(
      `INSERT INTO restricted_terms (pattern, kind, reason) VALUES
       ('\\mfirearm\\M', 'BLOCK', 'Weapons-related work is prohibited'),
       ('\\melectrical\\M', 'REVIEW', 'Possible licensed-trade work')`,
    );

    await setupWorker(worker1, 30.27, -97.74); // ~1 km from job
    await setupWorker(worker2, 30.30, -97.70); // ~5 km
    await setupWorker(worker3, 30.25, -97.75); // ~2 km
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  // ── Creation & screening ───────────────────────────────────────────────────

  it('creates and posts a job; state flows DRAFT-less to MATCHING', async () => {
    const res = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload())
      .expect(201);
    expect(res.body.state).toBe('MATCHING');
    expect(res.body.pay_cents).toBe(10000);

    const timeline = await request(server())
      .get(`/v1/jobs/${res.body.id}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(timeline.body.items.map((e: { event_type: string }) => e.event_type)).toEqual([
      'job.created',
      'job.matching_started',
    ]);
  });

  it('blocks prohibited jobs and routes risky ones to review', async () => {
    const blocked = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ description: 'Help me move my firearm collection to storage' }))
      .expect(422);
    expect(blocked.body.error.code).toBe('RESTRICTED_JOB_PENDING_REVIEW');

    const review = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ description: 'Remove old electrical wiring from the garage wall' }))
      .expect(201);
    expect(review.body.state).toBe('PENDING_REVIEW');

    // Not discoverable while pending review.
    const disc = await request(server())
      .get('/v1/discovery/jobs')
      .set('Authorization', `Bearer ${worker1.token}`)
      .query({ lat: JOB_SITE.lat, lng: JOB_SITE.lng })
      .expect(200);
    expect(disc.body.items.map((j: { id: string }) => j.id)).not.toContain(review.body.id);

    // Admin approves → discoverable.
    await request(server())
      .post(`/v1/admin/jobs/${review.body.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approve: true })
      .expect(200);
    const disc2 = await request(server())
      .get('/v1/discovery/jobs')
      .set('Authorization', `Bearer ${worker1.token}`)
      .query({ lat: JOB_SITE.lat, lng: JOB_SITE.lng })
      .expect(200);
    expect(disc2.body.items.map((j: { id: string }) => j.id)).toContain(review.body.id);
  });

  it('rejects jobs with past start times and disabled categories', async () => {
    await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ scheduled_start_at: new Date(Date.now() - 3600e3).toISOString() }))
      .expect(422);

    const disabled = await request(server())
      .post('/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'disabled-cat', name: 'Disabled', enabled: false })
      .expect(201);
    await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ category_id: disabled.body.id }))
      .expect(422);
  });

  it('drafts are not discoverable until posted', async () => {
    const draft = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ save_as_draft: true, title: 'Draft job for later posting' }))
      .expect(201);
    expect(draft.body.state).toBe('DRAFT');

    const disc = await request(server())
      .get('/v1/discovery/jobs')
      .set('Authorization', `Bearer ${worker1.token}`)
      .query({ lat: JOB_SITE.lat, lng: JOB_SITE.lng })
      .expect(200);
    expect(disc.body.items.map((j: { id: string }) => j.id)).not.toContain(draft.body.id);

    const posted = await request(server())
      .post(`/v1/jobs/${draft.body.id}/post`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(201);
    expect(posted.body.state).toBe('MATCHING');
  });

  // ── Discovery & location privacy ───────────────────────────────────────────

  it('discovery exposes only approximate locations, never addresses', async () => {
    const disc = await request(server())
      .get('/v1/discovery/jobs')
      .set('Authorization', `Bearer ${worker1.token}`)
      .query({ lat: JOB_SITE.lat, lng: JOB_SITE.lng })
      .expect(200);
    expect(disc.body.items.length).toBeGreaterThan(0);
    const card = disc.body.items[0];
    expect(card.approx_location).toBeDefined();
    expect(card.distance_m).toBeGreaterThanOrEqual(0);
    const raw = JSON.stringify(disc.body);
    expect(raw).not.toContain('500 Test Ave');
    expect(raw).not.toContain('access_instructions');
    expect(raw).not.toContain('Gate code');

    // The approximate point is offset from the exact point (privacy) but nearby (~≤500 m).
    expect(card.approx_location.lat).not.toBe(JOB_SITE.lat);
    const meters =
      Math.hypot(
        (card.approx_location.lat - JOB_SITE.lat) * 111_320,
        (card.approx_location.lng - JOB_SITE.lng) * 94_000,
      );
    expect(meters).toBeLessThan(600);
  });

  it('radius filtering works', async () => {
    const far = await request(server())
      .get('/v1/discovery/jobs')
      .set('Authorization', `Bearer ${worker1.token}`)
      .query({ lat: 29.7604, lng: -95.3698, radius_m: 10000 }) // Houston, ~235 km away
      .expect(200);
    expect(far.body.items).toHaveLength(0);
  });

  // ── Matching engine ────────────────────────────────────────────────────────

  it('matching returns eligible workers ordered by distance; excludes ineligible', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ title: 'Matching probe job for candidates' }))
      .expect(201);

    // worker2 goes unavailable; worker3 sets a min pay above this job.
    await request(server())
      .put('/v1/me/availability')
      .set('Authorization', `Bearer ${worker2.token}`)
      .send({ available_now: false, windows: [] })
      .expect(200);
    await request(server())
      .put('/v1/me/worker-profile')
      .set('Authorization', `Bearer ${worker3.token}`)
      .send({ display_name: 'Test Worker', min_pay_cents: 99999 })
      .expect(200);

    const matching = ctx.app.get(MatchingService);
    const candidates = await matching.findCandidatesForJob(job.body.id);
    expect(candidates.map((c) => c.worker_user_id)).toEqual([worker1.userId]);

    // Restore for later tests.
    await request(server())
      .put('/v1/me/availability')
      .set('Authorization', `Bearer ${worker2.token}`)
      .send({ available_now: true, windows: [] })
      .expect(200);
    await ctx.db.query('UPDATE worker_profiles SET min_pay_cents = NULL WHERE user_id = $1', [worker3.userId]);
    const restored = await matching.findCandidatesForJob(job.body.id);
    expect(restored.map((c) => c.worker_user_id)).toEqual([
      worker1.userId, // ~1 km
      worker3.userId, // ~2 km
      worker2.userId, // ~5 km
    ]);
  });

  it('category verification requirements block acceptance and matching', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ category_id: identityCategoryId, title: 'Deep clean two bedrooms please' }))
      .expect(201);

    // worker1 selected only moving-help; add cleaning category for this test.
    await request(server())
      .put('/v1/me/worker-profile/categories')
      .set('Authorization', `Bearer ${worker1.token}`)
      .send({ category_ids: [movingCategoryId, identityCategoryId] })
      .expect(200);

    const res = await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(403);
    expect(res.body.error.code).toBe('REQUIREMENTS_NOT_MET');
    expect(res.body.error.details.missing).toContain('IDENTITY');

    const matching = ctx.app.get(MatchingService);
    expect(await matching.findCandidatesForJob(job.body.id)).toHaveLength(0);

    // A real PASSED identity verification unlocks it.
    await ctx.db.query(
      `INSERT INTO verification_records (user_id, type, status, provider, verified_at)
       VALUES ($1, 'IDENTITY', 'PASSED', 'test_provider', now())`,
      [worker1.userId],
    );
    expect((await matching.findCandidatesForJob(job.body.id)).map((c) => c.worker_user_id)).toEqual([
      worker1.userId,
    ]);
  });

  // ── Acceptance & concurrency ───────────────────────────────────────────────

  it('multi-worker acceptance: partial fill, full fill, then closed to others', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ title: 'Two-person truck unload downtown' }))
      .expect(201);

    // Customer cannot accept their own job.
    await request(server())
      .post('/v1/me/roles')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ role: 'WORKER' })
      .expect(201);
    const customerAsWorker = (
      await request(server())
        .post('/v1/auth/login')
        .send({ email: 'boss@example.test', password: 'password-123456' })
        .expect(200)
    ).body.tokens.access_token;
    await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${customerAsWorker}`)
      .expect(403);

    const a1 = await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    expect(a1.body.state).toBe('ACCEPTED');

    let view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('PARTIALLY_FILLED');
    expect(view.body.workers_filled).toBe(1);

    // Idempotent retry returns the same assignment.
    const retry = await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    expect(retry.body.id).toBe(a1.body.id);

    await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker2.token}`)
      .expect(200);

    view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('FILLED');

    const rejected = await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker3.token}`)
      .expect(409);
    expect(rejected.body.error.code).toBe('JOB_ALREADY_FILLED');
  });

  it('concurrent acceptance of the last slot: exactly one winner', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ workers_needed: 1, title: 'One-person concurrency race job' }))
      .expect(201);

    const [r1, r2] = await Promise.all([
      request(server()).post(`/v1/jobs/${job.body.id}/accept`).set('Authorization', `Bearer ${worker1.token}`),
      request(server()).post(`/v1/jobs/${job.body.id}/accept`).set('Authorization', `Bearer ${worker2.token}`),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const { rows } = await ctx.db.query(
      `SELECT workers_filled, workers_needed FROM jobs WHERE id = $1`,
      [job.body.id],
    );
    expect(rows[0]).toEqual({ workers_filled: 1, workers_needed: 1 });
  });

  // ── Execution lifecycle ────────────────────────────────────────────────────

  it('full lifecycle: en-route → arrived → start → complete → confirm', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ workers_needed: 1, title: 'Single worker lifecycle test job', pay_type: 'HOURLY', pay_cents: 2500 }))
      .expect(201);
    const a = await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);

    // Accepted worker now sees the exact address + access instructions.
    const workerView = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    expect(workerView.body.address_line1).toBe('500 Test Ave');
    expect(workerView.body.access_instructions).toBe('Gate code 9876');

    // Illegal shortcut: cannot start before arriving.
    const shortcut = await request(server())
      .post(`/v1/assignments/${a.body.id}/start`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(409);
    expect(shortcut.body.error.code).toBe('INVALID_STATE_TRANSITION');

    // Another worker cannot drive someone else's assignment (IDOR).
    await request(server())
      .post(`/v1/assignments/${a.body.id}/en-route`)
      .set('Authorization', `Bearer ${worker2.token}`)
      .expect(404);

    await request(server())
      .post(`/v1/assignments/${a.body.id}/en-route`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    await request(server())
      .post(`/v1/assignments/${a.body.id}/arrived`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .send({ location: { lat: 30.2671, lng: -97.743 } })
      .expect(200);
    const started = await request(server())
      .post(`/v1/assignments/${a.body.id}/start`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    expect(started.body.state).toBe('STARTED');

    let view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('IN_PROGRESS');

    const completed = await request(server())
      .post(`/v1/assignments/${a.body.id}/complete`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    // HOURLY 2500¢/h × 120 min = 5000¢.
    expect(Number(completed.body.earnings_cents)).toBe(5000);

    view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('COMPLETION_PENDING');

    // Only the owner can confirm.
    await request(server())
      .post(`/v1/jobs/${job.body.id}/confirm-completion`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(403);

    const confirmed = await request(server())
      .post(`/v1/jobs/${job.body.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(confirmed.body.state).toBe('COMPLETED');

    const timeline = await request(server())
      .get(`/v1/jobs/${job.body.id}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const types = timeline.body.items.map((e: { event_type: string }) => e.event_type);
    expect(types).toEqual([
      'job.created',
      'job.matching_started',
      'job.worker_accepted',
      'job.filled',
      'assignment.en_route',
      'assignment.arrived',
      'assignment.started',
      'job.started',
      'assignment.completed',
      'job.completion_pending',
      'job.completion_confirmed',
    ]);
  });

  it('worker cancellation reopens the slot and blocks re-accepting', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ workers_needed: 1, title: 'Cancellation slot reopen test' }))
      .expect(201);
    const a = await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);

    await request(server())
      .post(`/v1/assignments/${a.body.id}/cancel`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .send({ reason: 'CHANGED_PLANS' })
      .expect(204);

    const view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('MATCHING');
    expect(view.body.workers_filled).toBe(0);

    // The canceller cannot re-accept; another worker can.
    await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(409);
    await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker2.token}`)
      .expect(200);
  });

  it('customer cancellation cancels active assignments', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ workers_needed: 1, title: 'Customer cancel flow test job' }))
      .expect(201);
    await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker3.token}`)
      .expect(200);

    // Must acknowledge consequences.
    await request(server())
      .post(`/v1/jobs/${job.body.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Plans changed', acknowledged_consequences: false })
      .expect(422);

    const cancelled = await request(server())
      .post(`/v1/jobs/${job.body.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Plans changed', acknowledged_consequences: true })
      .expect(200);
    expect(cancelled.body.state).toBe('CANCELLED');

    const { rows } = await ctx.db.query(
      `SELECT state FROM job_workers WHERE job_id = $1`,
      [job.body.id],
    );
    expect(rows[0]!.state).toBe('CANCELLED_BY_CUSTOMER');

    // A stranger cannot cancel someone else's job (404 masks existence).
    const other = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ title: 'Ownership check job for cancel' }))
      .expect(201);
    const { token: strangerToken } = await registerVerifiedUser(ctx, 'stranger@example.test', 'CUSTOMER');
    await request(server())
      .post(`/v1/jobs/${other.body.id}/cancel`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ reason: 'hijack', acknowledged_consequences: true })
      .expect(404);
  });

  // ── Scope changes ──────────────────────────────────────────────────────────

  it('scope changes require worker approval and preserve the original', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send(jobPayload({ workers_needed: 1, title: 'Scope change protection test' }))
      .expect(201);
    await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);

    const proposal = await request(server())
      .post(`/v1/jobs/${job.body.id}/changes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ pay_cents: 12000, estimated_duration_minutes: 180 })
      .expect(201);
    expect(proposal.body.status).toBe('PROPOSED');

    // Job unchanged until approval.
    let view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.pay_cents).toBe(10000);

    // A worker not on the job cannot decide (404 masks existence).
    await request(server())
      .post(`/v1/job-changes/${proposal.body.id}/approve`)
      .set('Authorization', `Bearer ${worker2.token}`)
      .expect(404);

    const decided = await request(server())
      .post(`/v1/job-changes/${proposal.body.id}/approve`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    expect(decided.body.status).toBe('APPROVED');

    view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.pay_cents).toBe(12000);
    expect(view.body.estimated_duration_minutes).toBe(180);

    // The full diff is preserved in the change history.
    const changes = await request(server())
      .get(`/v1/jobs/${job.body.id}/changes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(changes.body.items[0].changes.pay_cents).toEqual({ old: 10000, new: 12000 });

    // Declined proposals do not modify the job.
    const p2 = await request(server())
      .post(`/v1/jobs/${job.body.id}/changes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ pay_cents: 8000 })
      .expect(201);
    await request(server())
      .post(`/v1/job-changes/${p2.body.id}/decline`)
      .set('Authorization', `Bearer ${worker1.token}`)
      .expect(200);
    view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.pay_cents).toBe(12000);
  });

  // ── Post again ─────────────────────────────────────────────────────────────

  it('duplicate creates a fresh draft referencing the source job', async () => {
    const jobs = await request(server())
      .get('/v1/jobs/mine?state=COMPLETED')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const sourceId = jobs.body.items[0].id;

    const dup = await request(server())
      .post(`/v1/jobs/${sourceId}/duplicate`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(201);
    expect(dup.body.state).toBe('DRAFT');
    expect(dup.body.scheduled_start_at).toBeNull();
  });
});
