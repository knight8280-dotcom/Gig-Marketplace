import request from 'supertest';
import { TestContext, createTestApp, tokenFromMessage, truncateAll } from './helpers';

describe('Auth (Phase 1)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.db);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const email = 'customer1@example.test';
  const password = 'correct-horse-battery';
  let accessToken = '';
  let refreshToken = '';

  it('registers a customer and returns tokens', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password, role: 'CUSTOMER' })
      .expect(201);

    expect(res.body.user.email).toBe(email);
    expect(res.body.user.roles).toEqual(['CUSTOMER']);
    expect(res.body.tokens.access_token).toBeTruthy();
    expect(res.body.tokens.refresh_token).toBeTruthy();
    accessToken = res.body.tokens.access_token;
    refreshToken = res.body.tokens.refresh_token;
    expect(ctx.sentEmails).toHaveLength(1);
  });

  it('rejects duplicate registration with CONFLICT', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password, role: 'WORKER' })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects weak passwords with validation error envelope', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'weak@example.test', password: 'short', role: 'CUSTOMER' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.password).toBeDefined();
  });

  it('GET /v1/me requires authentication', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /v1/me returns the allow-listed account DTO (no password hash)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(email);
    expect(res.body.email_verified).toBe(false);
    expect(res.body.password_hash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('argon2');
  });

  it('verifies email via the emailed token and records verification', async () => {
    const token = tokenFromMessage(ctx.sentEmails[0]!.body);
    await request(ctx.app.getHttpServer()).post('/v1/auth/verify-email').send({ token }).expect(200);

    const me = await request(ctx.app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.email_verified).toBe(true);

    const { rows } = await ctx.db.query(
      `SELECT * FROM verification_records WHERE type = 'EMAIL' AND status = 'PASSED'`,
    );
    expect(rows).toHaveLength(1);

    // Token is single-use.
    const reuse = await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token })
      .expect(422);
    expect(reuse.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('verifies phone via SMS code', async () => {
    const phone = '+15550001111';
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/phone/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone })
      .expect(204);

    const code = ctx.sentSms[0]!.body.match(/(\d{6})/)![1]!;

    // Wrong code fails and counts an attempt.
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/phone/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone, code: code === '000000' ? '000001' : '000000' })
      .expect(422);

    await request(ctx.app.getHttpServer())
      .post('/v1/auth/phone/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone, code })
      .expect(200);

    const me = await request(ctx.app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.phone_verified).toBe(true);
    expect(me.body.phone).toBe(phone);
  });

  it('logs in with correct credentials and rejects wrong password identically to unknown user', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const wrongPw = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'wrong-password-123' })
      .expect(401);
    const unknown = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'ghost@example.test', password: 'whatever-12345' })
      .expect(401);
    expect(wrongPw.body).toEqual(unknown.body); // no account enumeration
  });

  it('rotates refresh tokens and detects reuse (family revocation)', async () => {
    const r1 = await request(ctx.app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(200);
    const rotated = r1.body.refresh_token;
    expect(rotated).not.toBe(refreshToken);

    // Reusing the OLD token must revoke the whole family.
    const reuse = await request(ctx.app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REVOKED');

    // The rotated token is now dead too.
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: rotated })
      .expect(401);
  });

  it('password forgot always returns 200 and reset revokes sessions', async () => {
    // Unknown email: identical response.
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/password/forgot')
      .send({ email: 'ghost@example.test' })
      .expect(200);

    const before = ctx.sentEmails.length;
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/password/forgot')
      .send({ email })
      .expect(200);
    expect(ctx.sentEmails.length).toBe(before + 1);

    const resetToken = tokenFromMessage(ctx.sentEmails[ctx.sentEmails.length - 1]!.body);
    const newPassword = 'brand-new-password-42';
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/password/reset')
      .send({ token: resetToken, new_password: newPassword })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(401);
  });

  it('supports dual roles via POST /v1/me/roles', async () => {
    const login = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'brand-new-password-42' })
      .expect(200);
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/me/roles')
      .set('Authorization', `Bearer ${login.body.tokens.access_token}`)
      .send({ role: 'WORKER' })
      .expect(201);
    expect(res.body.roles.sort()).toEqual(['CUSTOMER', 'WORKER']);

    // ADMIN is never self-assignable.
    await request(ctx.app.getHttpServer())
      .post('/v1/me/roles')
      .set('Authorization', `Bearer ${login.body.tokens.access_token}`)
      .send({ role: 'ADMIN' })
      .expect(422);
  });

  it('account deletion request deactivates sessions; login reactivates', async () => {
    const reg = await request(ctx.app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'deleteme@example.test', password: 'password-to-delete', role: 'WORKER' })
      .expect(201);
    const token = reg.body.tokens.access_token;

    await request(ctx.app.getHttpServer())
      .delete('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(202);

    // Account no longer ACTIVE → guard blocks even a still-valid JWT.
    await request(ctx.app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    // Login within grace period reactivates.
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'deleteme@example.test', password: 'password-to-delete' })
      .expect(200);
  });
});
