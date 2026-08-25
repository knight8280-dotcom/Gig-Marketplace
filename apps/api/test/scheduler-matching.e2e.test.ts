import request from 'supertest';
import { TestContext, createTestApp, registerVerifiedUser, settleEvents, truncateAll } from './helpers';
import { JobsScheduler } from '../src/modules/jobs/jobs.scheduler';

/** Matching fan-out notifications + scheduled auto-confirm. */
describe('Matching fan-out & scheduler', () => {
  let ctx: TestContext;
  let customer: { token: string; userId: string };
  let worker: { token: string; userId: string };
  let categoryId = '';

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.db);

    customer = await registerVerifiedUser(ctx, 'schedc@example.test', 'CUSTOMER');
    worker = await registerVerifiedUser(ctx, 'schedw@example.test', 'WORKER');

    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (slug, name, enabled) VALUES ('moving-help','Moving Help',true) RETURNING id`,
    );
    categoryId = rows[0]!.id;

    await request(server())
      .put('/v1/me/worker-profile')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ display_name: 'Sched Worker', home_location: { lat: 30.27, lng: -97.74 } })
      .expect(200);
    await request(server())
      .put('/v1/me/worker-profile/categories')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ category_ids: [categoryId] })
      .expect(200);
    await request(server())
      .put('/v1/me/availability')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ available_now: true, windows: [] })
      .expect(200);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('posting a job notifies matching nearby available workers', async () => {
    await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        title: 'Fan-out notification test job',
        description: 'Notify nearby workers about this job.',
        category_id: categoryId,
        address_line1: '9 Fanout Rd',
        city: 'Austin',
        region: 'TX',
        postal_code: '78701',
        location: { lat: 30.2672, lng: -97.7431 },
        timezone: 'America/Chicago',
        urgency: 'ASAP',
        estimated_duration_minutes: 60,
        workers_needed: 1,
        pay_type: 'FLAT',
        pay_cents: 6000,
      })
      .expect(201);
    await settleEvents(300);

    const notifs = await request(server())
      .get('/v1/notifications')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    const nearby = notifs.body.items.find((n: { type: string }) => n.type === 'NEW_NEARBY_JOB');
    expect(nearby).toBeDefined();
    expect(nearby.body).toContain('$60');
  });

  it('auto-confirms completion after the configured window', async () => {
    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        title: 'Auto-confirm scheduler test job',
        description: 'Customer will forget to confirm this one.',
        category_id: categoryId,
        address_line1: '9 Timer Rd',
        city: 'Austin',
        region: 'TX',
        postal_code: '78701',
        location: { lat: 30.2672, lng: -97.7431 },
        timezone: 'America/Chicago',
        urgency: 'ASAP',
        estimated_duration_minutes: 60,
        workers_needed: 1,
        pay_type: 'FLAT',
        pay_cents: 5000,
      })
      .expect(201);

    const a = await request(server())
      .post(`/v1/jobs/${job.body.id}/accept`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    for (const step of ['en-route', 'arrived', 'start', 'complete']) {
      await request(server())
        .post(`/v1/assignments/${a.body.id}/${step}`)
        .set('Authorization', `Bearer ${worker.token}`)
        .expect(200);
    }

    const scheduler = ctx.app.get(JobsScheduler);

    // Within the window: nothing happens.
    await scheduler.autoConfirmCompletions();
    let view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(view.body.state).toBe('COMPLETION_PENDING');

    // Simulate 73 hours passing (default window 72h).
    await ctx.db.query(
      `UPDATE job_events SET created_at = created_at - interval '73 hours'
       WHERE job_id = $1 AND event_type = 'job.completion_pending'`,
      [job.body.id],
    );
    await scheduler.autoConfirmCompletions();
    await settleEvents(200);

    view = await request(server())
      .get(`/v1/jobs/${job.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    // No successful payment exists (no card in this suite) → payouts stay
    // blocked and the job remains COMPLETED, never fake-paid.
    expect(view.body.state).toBe('COMPLETED');

    const timeline = await request(server())
      .get(`/v1/jobs/${job.body.id}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const types = timeline.body.items.map((e: { event_type: string }) => e.event_type);
    expect(types).toContain('job.completion_auto_confirmed');
    expect(types).toContain('payout.blocked_no_successful_payment');
  });
});
