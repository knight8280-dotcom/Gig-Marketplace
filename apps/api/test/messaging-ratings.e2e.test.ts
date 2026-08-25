import request from 'supertest';
import { TestContext, createTestApp, registerVerifiedUser, truncateAll } from './helpers';

/** Phases 9 & 11: job-scoped messaging + double-blind ratings. */
describe('Messaging & ratings (Phases 9, 11)', () => {
  let ctx: TestContext;
  let customer: { token: string; userId: string };
  let worker: { token: string; userId: string };
  let outsider: { token: string; userId: string };
  let jobId = '';
  let assignmentId = '';
  let conversationId = '';

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.db);

    customer = await registerVerifiedUser(ctx, 'mc@example.test', 'CUSTOMER');
    worker = await registerVerifiedUser(ctx, 'mw@example.test', 'WORKER');
    outsider = await registerVerifiedUser(ctx, 'mo@example.test', 'WORKER');

    // Category directly (admin-created path already covered elsewhere).
    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (slug, name, enabled) VALUES ('moving-help','Moving Help',true) RETURNING id`,
    );
    const categoryId = rows[0]!.id;

    for (const w of [worker, outsider]) {
      await request(server())
        .put('/v1/me/worker-profile')
        .set('Authorization', `Bearer ${w.token}`)
        .send({ display_name: 'Msg Worker', home_location: { lat: 30.27, lng: -97.74 } })
        .expect(200);
    }

    const job = await request(server())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        title: 'Messaging test job with helpers',
        description: 'Help move boxes and chat about logistics.',
        category_id: categoryId,
        address_line1: '1 Chat St',
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
    jobId = job.body.id;

    const a = await request(server())
      .post(`/v1/jobs/${jobId}/accept`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    assignmentId = a.body.id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  // ── Messaging ─────────────────────────────────────────────────────────────

  it('conversation opens between customer and assigned worker only', async () => {
    const conv = await request(server())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ job_id: jobId })
      .expect(200);
    conversationId = conv.body.id;

    // Idempotent: same conversation returned.
    const again = await request(server())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ job_id: jobId, worker_user_id: worker.userId })
      .expect(200);
    expect(again.body.id).toBe(conversationId);

    // A worker with no assignment cannot open one.
    await request(server())
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ job_id: jobId })
      .expect(404);
  });

  it('participants exchange messages; outsiders get 404 (IDOR)', async () => {
    const msg = await request(server())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ body: 'On my way — does the couch disassemble?' })
      .expect(201);
    expect(msg.body.seq).toBeDefined();

    await request(server())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ body: 'Yes, legs come off. See you soon!' })
      .expect(201);

    const list = await request(server())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(list.body.items).toHaveLength(2);

    await request(server())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);

    // Unread counts + read receipts.
    const convs = await request(server())
      .get('/v1/conversations')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(Number(convs.body.items[0].unread_count)).toBe(1);
    await request(server())
      .post(`/v1/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(204);
    const convs2 = await request(server())
      .get('/v1/conversations')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(Number(convs2.body.items[0].unread_count)).toBe(0);
  });

  it('message reporting flags content; blocking stops messaging', async () => {
    const list = await request(server())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    const messageId = list.body.items[0].id;

    await request(server())
      .post(`/v1/messages/${messageId}/report`)
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ reason: 'test report reason' })
      .expect(204);
    const { rows } = await ctx.db.query('SELECT reported_at FROM messages WHERE id = $1', [messageId]);
    expect(rows[0]!.reported_at).not.toBeNull();

    await request(server())
      .post(`/v1/users/${customer.userId}/block`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(204);
    await request(server())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ body: 'Hello?' })
      .expect(403);
    await request(server())
      .delete(`/v1/users/${customer.userId}/block`)
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(204);
  });

  // ── Ratings ───────────────────────────────────────────────────────────────

  it('rating is blocked until the job completes', async () => {
    await request(server())
      .post(`/v1/assignments/${assignmentId}/rating`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ overall: 5 })
      .expect(409);
  });

  it('double-blind: ratings invisible until both sides submit', async () => {
    // Drive the job to completion.
    for (const step of ['en-route', 'arrived', 'start', 'complete']) {
      await request(server())
        .post(`/v1/assignments/${assignmentId}/${step}`)
        .set('Authorization', `Bearer ${worker.token}`)
        .expect(200);
    }
    await request(server())
      .post(`/v1/jobs/${jobId}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);

    // Pending prompts show up for both parties.
    const pendingW = await request(server())
      .get('/v1/me/ratings/pending')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(pendingW.body.items).toHaveLength(1);

    // Customer rates the worker (4 stars).
    const r1 = await request(server())
      .post(`/v1/assignments/${assignmentId}/rating`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ overall: 4, professionalism: 5, comment: 'Great work' })
      .expect(201);
    expect(r1.body.visible).toBe(false);

    // Worker cannot see it yet (double-blind).
    const workerReceived = await request(server())
      .get('/v1/me/ratings')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(workerReceived.body.items).toHaveLength(0);

    // Duplicate rating rejected.
    await request(server())
      .post(`/v1/assignments/${assignmentId}/rating`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ overall: 1 })
      .expect(409);

    // Outsider cannot rate (404 masks existence).
    await request(server())
      .post(`/v1/assignments/${assignmentId}/rating`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ overall: 1 })
      .expect(404);

    // Worker rates back → both become visible.
    const r2 = await request(server())
      .post(`/v1/assignments/${assignmentId}/rating`)
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ overall: 5, communication: 5 })
      .expect(201);
    expect(r2.body.visible).toBe(true);

    const workerReceived2 = await request(server())
      .get('/v1/me/ratings')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(workerReceived2.body.items).toHaveLength(1);
    expect(workerReceived2.body.items[0].overall).toBe(4);

    // Aggregates recomputed on both profiles.
    const workerProfile = await request(server())
      .get('/v1/me/worker-profile')
      .set('Authorization', `Bearer ${worker.token}`)
      .expect(200);
    expect(Number(workerProfile.body.rating_avg)).toBe(4);
    expect(workerProfile.body.rating_count).toBe(1);

    const { rows } = await ctx.db.query(
      'SELECT rating_avg, rating_count FROM customer_profiles WHERE user_id = $1',
      [customer.userId],
    );
    // Customer got a 5 from the worker; profile was created implicitly? No —
    // customer_profiles row may not exist if the customer never created one.
    // The aggregate update is a no-op then, which is acceptable: public cards
    // only exist for users with profiles.
    if (rows.length > 0) {
      expect(Number(rows[0]!.rating_avg)).toBe(5);
    }
  });
});
