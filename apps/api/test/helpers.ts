import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { EMAIL_SENDER, SMS_SENDER } from '../src/modules/auth/adapters/messaging.adapters';

export interface CapturedMessage {
  to: string;
  subject?: string;
  body: string;
}

export interface TestContext {
  app: INestApplication;
  db: DatabaseService;
  sentEmails: CapturedMessage[];
  sentSms: CapturedMessage[];
}

/** Boots the real AppModule with capturing test doubles for outbound email/SMS. */
export async function createTestApp(): Promise<TestContext> {
  const sentEmails: CapturedMessage[] = [];
  const sentSms: CapturedMessage[] = [];

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EMAIL_SENDER)
    .useValue({
      send: async (to: string, subject: string, body: string) => {
        sentEmails.push({ to, subject, body });
      },
    })
    .overrideProvider(SMS_SENDER)
    .useValue({
      send: async (to: string, body: string) => {
        sentSms.push({ to, body });
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', { exclude: ['healthz', 'readyz'] });
  await app.init();
  return { app, db: app.get(DatabaseService), sentEmails, sentSms };
}

/** Extract the opaque token from a dev-adapter message body ("...: <token>"). */
export function tokenFromMessage(body: string): string {
  const match = body.match(/: (\S+)$/);
  if (!match) throw new Error(`No token found in message: ${body}`);
  return match[1]!;
}

let phoneCounter = 1000;

/** Register a user and complete email + phone verification via captured messages. */
export async function registerVerifiedUser(
  ctx: TestContext,
  email: string,
  role: 'CUSTOMER' | 'WORKER',
): Promise<{ token: string; userId: string; email: string }> {
  const request = (await import('supertest')).default;
  const server = ctx.app.getHttpServer();

  const reg = await request(server)
    .post('/v1/auth/register')
    .send({ email, password: 'password-123456', role })
    .expect(201);
  const token = reg.body.tokens.access_token as string;
  const userId = reg.body.user.id as string;

  const emailToken = tokenFromMessage(ctx.sentEmails[ctx.sentEmails.length - 1]!.body);
  await request(server).post('/v1/auth/verify-email').send({ token: emailToken }).expect(200);

  phoneCounter += 1;
  const phone = `+1555000${phoneCounter}`;
  await request(server)
    .post('/v1/auth/phone/request')
    .set('Authorization', `Bearer ${token}`)
    .send({ phone })
    .expect(204);
  const code = ctx.sentSms[ctx.sentSms.length - 1]!.body.match(/(\d{6})/)![1]!;
  await request(server)
    .post('/v1/auth/phone/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({ phone, code })
    .expect(200);

  return { token, userId, email };
}

/** Truncate all data tables between test suites (schema/migrations preserved). */
export async function truncateAll(db: DatabaseService): Promise<void> {
  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/** Read the latest dev-adapter one-time token for a user straight from the DB.
 *  Tests must not rely on parsing console output. Returns the raw token only
 *  when the test created it via a captured sender; here we return the row id
 *  for flows that need DB-level assertions. */
export async function latestOneTimeTokenRow(
  db: DatabaseService,
  userId: string,
  type: string,
): Promise<{ id: string; token_hash: string; consumed_at: Date | null } | null> {
  const { rows } = await db.query<{ id: string; token_hash: string; consumed_at: Date | null }>(
    `SELECT id, token_hash, consumed_at FROM one_time_tokens
     WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, type],
  );
  return rows[0] ?? null;
}
