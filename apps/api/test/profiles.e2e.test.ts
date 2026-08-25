import request from 'supertest';
import { TestContext, createTestApp, truncateAll } from './helpers';

/** Phases 2–4: customer/worker onboarding, catalog, availability, settings. */
describe('Profiles & catalog (Phases 2–4)', () => {
  let ctx: TestContext;
  let customerToken = '';
  let workerToken = '';
  let otherCustomerToken = '';
  let adminToken = '';
  let categoryIds: string[] = [];
  let skillIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.db);

    const server = ctx.app.getHttpServer();
    const reg = async (email: string, role: string) =>
      (await request(server).post('/v1/auth/register').send({ email, password: 'password-123456', role }).expect(201))
        .body.tokens.access_token;

    customerToken = await reg('cust@example.test', 'CUSTOMER');
    otherCustomerToken = await reg('cust2@example.test', 'CUSTOMER');
    workerToken = await reg('work@example.test', 'WORKER');

    // Admin cannot self-register — create directly (as ops would) then log in.
    await request(server)
      .post('/v1/auth/register')
      .send({ email: 'admin@example.test', password: 'admin-password-1', role: 'CUSTOMER' })
      .expect(201);
    await ctx.db.query(`UPDATE users SET roles = '{ADMIN}' WHERE email = 'admin@example.test'`);
    adminToken = (
      await request(server).post('/v1/auth/login').send({ email: 'admin@example.test', password: 'admin-password-1' }).expect(200)
    ).body.tokens.access_token;

    // Admin seeds catalog entries used by the tests.
    for (const [slug, name] of [['moving-help', 'Moving Help'], ['yard-work', 'Yard Work']] as const) {
      const res = await request(server)
        .post('/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slug, name, enabled: true })
        .expect(201);
      categoryIds.push(res.body.id);
    }
    for (const [slug, name] of [['heavy-lifting', 'Heavy Lifting'], ['packing', 'Packing']] as const) {
      const res = await request(server)
        .post('/v1/admin/skills')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slug, name })
        .expect(201);
      skillIds.push(res.body.id);
    }
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  // ── Catalog ────────────────────────────────────────────────────────────────

  it('lists enabled categories publicly; admin endpoints require admin', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1/categories').expect(200);
    expect(res.body.items).toHaveLength(2);

    const forbidden = await request(ctx.app.getHttpServer())
      .get('/v1/admin/categories')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('disabled categories are hidden from the public list', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'roofing', name: 'Roofing', enabled: false })
      .expect(201);
    expect(created.body.enabled).toBe(false);

    const list = await request(ctx.app.getHttpServer()).get('/v1/categories').expect(200);
    expect(list.body.items.map((c: { slug: string }) => c.slug)).not.toContain('roofing');
  });

  // ── Customer onboarding ────────────────────────────────────────────────────

  it('customer creates profile and saved address; worker cannot', async () => {
    await request(ctx.app.getHttpServer())
      .put('/v1/me/customer-profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ display_name: 'Casey Customer' })
      .expect(200);

    // Worker lacks customer_profile:write.
    await request(ctx.app.getHttpServer())
      .put('/v1/me/customer-profile')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ display_name: 'Sneaky Worker' })
      .expect(403);

    const addr = await request(ctx.app.getHttpServer())
      .post('/v1/me/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        label: 'Home',
        address_line1: '100 Test St',
        city: 'Austin',
        region: 'TX',
        postal_code: '78701',
        location: { lat: 30.2672, lng: -97.7431 },
        access_notes: 'Gate code 1234',
      })
      .expect(201);
    expect(addr.body.lat).toBeCloseTo(30.2672, 4);
  });

  it('addresses are owner-scoped (IDOR)', async () => {
    const list = await request(ctx.app.getHttpServer())
      .get('/v1/me/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const addressId = list.body.items[0].id;

    // Another customer cannot see or delete it.
    const otherList = await request(ctx.app.getHttpServer())
      .get('/v1/me/addresses')
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(200);
    expect(otherList.body.items).toHaveLength(0);

    await request(ctx.app.getHttpServer())
      .delete(`/v1/me/addresses/${addressId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(404);

    // Owner can.
    await request(ctx.app.getHttpServer())
      .delete(`/v1/me/addresses/${addressId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
  });

  // ── Worker onboarding ──────────────────────────────────────────────────────

  it('worker builds a full profile; home location never leaks', async () => {
    const profile = await request(ctx.app.getHttpServer())
      .put('/v1/me/worker-profile')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        display_name: 'Wendy Worker',
        bio: 'Strong and reliable',
        transportation: ['CAR'],
        equipment: ['dolly'],
        service_radius_m: 20000,
        home_location: { lat: 30.25, lng: -97.75 },
        min_pay_cents: 2000,
      })
      .expect(200);

    expect(profile.body.home_location_set).toBe(true);
    expect(JSON.stringify(profile.body)).not.toContain('-97.75');
    expect(profile.body.home_location).toBeUndefined();

    await request(ctx.app.getHttpServer())
      .put('/v1/me/worker-profile/skills')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ skill_ids: skillIds })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .put('/v1/me/worker-profile/categories')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ category_ids: categoryIds })
      .expect(200);

    const get = await request(ctx.app.getHttpServer())
      .get('/v1/me/worker-profile')
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(200);
    expect(get.body.skill_ids.sort()).toEqual([...skillIds].sort());
    expect(get.body.category_ids.sort()).toEqual([...categoryIds].sort());
  });

  it('rejects selecting disabled categories', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      `SELECT id FROM categories WHERE slug = 'roofing'`,
    );
    const res = await request(ctx.app.getHttpServer())
      .put('/v1/me/worker-profile/categories')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ category_ids: [rows[0]!.id] })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('worker sets availability windows and toggle', async () => {
    const res = await request(ctx.app.getHttpServer())
      .put('/v1/me/availability')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        available_now: true,
        windows: [
          { weekday: 6, start_minute: 540, end_minute: 1020, timezone: 'America/Chicago' },
          { weekday: 0, start_minute: 600, end_minute: 960, timezone: 'America/Chicago' },
        ],
      })
      .expect(200);
    expect(res.body.available_now).toBe(true);
    expect(res.body.windows).toHaveLength(2);

    // Invalid window rejected.
    await request(ctx.app.getHttpServer())
      .put('/v1/me/availability')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ available_now: false, windows: [{ weekday: 9, start_minute: 0, end_minute: 60, timezone: 'America/Chicago' }] })
      .expect(422);
  });

  it('worker accepts agreements; onboarding endpoint reflects true state', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/me/agreements')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ agreement: 'TERMS_OF_SERVICE', version: '2026-08-01' })
      .expect(201);

    const ob = await request(ctx.app.getHttpServer())
      .get('/v1/me/onboarding')
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(200);
    expect(ob.body.worker.profile_created).toBe(true);
    expect(ob.body.worker.skills_selected).toBe(true);
    expect(ob.body.worker.terms_accepted).toBe(true);
    expect(ob.body.worker.safety_acknowledged).toBe(false);
    expect(ob.body.worker.payout_ready).toBe(false); // honest until payments phase
  });

  // ── Public card ────────────────────────────────────────────────────────────

  it('public card shows shortened name and no private data', async () => {
    const { rows } = await ctx.db.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'work@example.test'`,
    );
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/users/${rows[0]!.id}/public`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(res.body.display_name).toBe('Wendy W.');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('example.test');
    expect(body).not.toContain('-97.75');
  });

  // ── Platform settings ──────────────────────────────────────────────────────

  it('admin reads default settings and updates them (audited)', async () => {
    const before = await request(ctx.app.getHttpServer())
      .get('/v1/admin/settings/completion_auto_confirm_hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(before.body.value).toBe(72);

    await request(ctx.app.getHttpServer())
      .put('/v1/admin/settings/completion_auto_confirm_hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 48 })
      .expect(200);

    const after = await request(ctx.app.getHttpServer())
      .get('/v1/admin/settings/completion_auto_confirm_hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.value).toBe(48);

    const { rows } = await ctx.db.query(
      `SELECT * FROM audit_logs WHERE action = 'admin.setting_updated'`,
    );
    expect(rows.length).toBe(1);

    // Non-admin blocked.
    await request(ctx.app.getHttpServer())
      .put('/v1/admin/settings/completion_auto_confirm_hours')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ value: 1 })
      .expect(403);
  });
});
