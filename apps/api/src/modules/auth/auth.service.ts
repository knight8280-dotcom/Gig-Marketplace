import { Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@gig/shared';
import { AppConfig, CONFIG } from '../../config/config';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';
import { generateNumericCode, generateOpaqueToken, sha256Hex } from '../../common/crypto';
import { UsersRepository, UserRow } from '../users/users.repository';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { EMAIL_SENDER, EmailSender, SMS_SENDER, SmsSender } from './adapters/messaging.adapters';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const EMAIL_TOKEN_TTL_MS = 24 * 3600 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const PHONE_CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly users: UsersRepository,
    private readonly tokens: TokenService,
    private readonly totp: TotpService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  // ── Registration / login ────────────────────────────────────────────────

  async register(email: string, password: string, role: 'CUSTOMER' | 'WORKER'): Promise<{ user: UserRow; tokens: TokenPair }> {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    let user: UserRow;
    try {
      user = await this.users.create(email, passwordHash, [role]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw DomainError.conflict('An account with this email already exists');
      }
      throw err;
    }
    await this.sendEmailVerification(user);
    await this.audit(user.id, 'user.registered', 'users', user.id);
    return { user, tokens: await this.issueTokenPair(user) };
  }

  async login(email: string, password: string, totpCode?: string): Promise<{ user: UserRow; tokens: TokenPair }> {
    const user = await this.users.findByEmail(email);
    // Verify against a dummy hash when the user is unknown so response timing
    // does not reveal account existence.
    const hash = user?.password_hash ?? (await argon2.hash('invalid-password-placeholder'));
    const valid = await argon2.verify(hash, password).catch(() => false);
    if (!user || !valid) {
      throw new DomainError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    // Second factor is checked only after the password succeeded (no oracle).
    await this.totp.verifyAtLogin(user, totpCode);
    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      throw new DomainError('FORBIDDEN', 'This account is not active', 403);
    }
    if (user.status === 'DELETION_REQUESTED') {
      // Logging in during the grace period reactivates the account.
      await this.users.setStatus(user.id, 'ACTIVE');
      await this.audit(user.id, 'user.deletion_cancelled', 'users', user.id);
    }
    return { user, tokens: await this.issueTokenPair(user) };
  }

  // ── Refresh-token rotation with reuse detection ─────────────────────────

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = sha256Hex(refreshToken);
    return this.db.withTransaction(async (client) => {
      const { rows } = await client.query<{
        id: string;
        user_id: string;
        family_id: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>('SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
      const row = rows[0];
      if (!row) throw DomainError.unauthenticated('Unknown refresh token');

      if (row.revoked_at !== null) {
        // Reuse of a rotated token ⇒ possible theft ⇒ revoke the whole family.
        // Must run OUTSIDE this transaction: the throw below rolls it back,
        // and the revocation has to survive.
        await this.db.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
          [row.family_id],
        );
        await this.audit(row.user_id, 'auth.refresh_reuse_detected', 'refresh_tokens', row.id);
        throw new DomainError('REFRESH_TOKEN_REVOKED', 'Session revoked — please sign in again', 401);
      }
      if (row.expires_at.getTime() < Date.now()) {
        throw new DomainError('TOKEN_EXPIRED', 'Refresh token expired', 401);
      }

      const user = await this.users.findById(row.user_id);
      if (!user || user.status !== 'ACTIVE') throw DomainError.unauthenticated();

      await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
      const newToken = generateOpaqueToken();
      await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
        [user.id, sha256Hex(newToken), row.family_id, this.config.refreshTokenTtlSec],
      );
      return {
        access_token: await this.tokens.signAccessToken(user.id, user.roles),
        refresh_token: newToken,
        expires_in: this.config.jwtAccessTtlSec,
      };
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
      sha256Hex(refreshToken),
    ]);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
      userId,
    ]);
  }

  // ── Email verification ───────────────────────────────────────────────────

  async sendEmailVerification(user: UserRow): Promise<void> {
    const token = generateOpaqueToken();
    await this.db.query(
      `INSERT INTO one_time_tokens (user_id, type, token_hash, expires_at)
       VALUES ($1, 'EMAIL_VERIFY', $2, now() + make_interval(secs => $3))`,
      [user.id, sha256Hex(token), EMAIL_TOKEN_TTL_MS / 1000],
    );
    await this.email.send(user.email, 'Verify your email', `Your verification token: ${token}`);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consumeOneTimeToken('EMAIL_VERIFY', token);
    await this.users.setEmailVerified(userId);
    await this.recordVerification(userId, 'EMAIL');
  }

  // ── Phone verification ───────────────────────────────────────────────────

  async requestPhoneCode(userId: string, phone: string): Promise<void> {
    const { rows } = await this.db.query<{ id: string }>(
      'SELECT id FROM users WHERE phone = $1 AND id <> $2',
      [phone, userId],
    );
    if (rows.length > 0) throw DomainError.conflict('This phone number is already in use');

    const code = generateNumericCode();
    await this.db.query(
      `INSERT INTO one_time_tokens (user_id, type, token_hash, expires_at)
       VALUES ($1, 'PHONE_CODE', $2, now() + make_interval(secs => $3))`,
      // The pending phone number rides along in the hash input so the code
      // only confirms the number it was sent to.
      [userId, sha256Hex(`${phone}:${code}`), PHONE_CODE_TTL_MS / 1000],
    );
    await this.db.query(`UPDATE one_time_tokens SET consumed_at = now()
       WHERE user_id = $1 AND type = 'PHONE_CODE' AND consumed_at IS NULL
       AND id <> (SELECT id FROM one_time_tokens WHERE user_id = $1 AND type = 'PHONE_CODE' ORDER BY created_at DESC LIMIT 1)`, [userId]);
    await this.sms.send(phone, `Your verification code is ${code}`);
  }

  async confirmPhone(userId: string, phone: string, code: string): Promise<void> {
    const { rows } = await this.db.query<{ id: string; token_hash: string; attempts: number; expires_at: Date }>(
      `SELECT id, token_hash, attempts, expires_at FROM one_time_tokens
       WHERE user_id = $1 AND type = 'PHONE_CODE' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row || row.expires_at.getTime() < Date.now()) {
      throw DomainError.validation('No active verification code — request a new one');
    }
    if (row.attempts >= PHONE_CODE_MAX_ATTEMPTS) {
      throw DomainError.validation('Too many attempts — request a new code');
    }
    await this.db.query('UPDATE one_time_tokens SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    if (row.token_hash !== sha256Hex(`${phone}:${code}`)) {
      throw DomainError.validation('Incorrect code');
    }
    await this.db.query('UPDATE one_time_tokens SET consumed_at = now() WHERE id = $1', [row.id]);
    try {
      await this.users.setPhoneVerified(userId, phone);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw DomainError.conflict('This phone number is already in use');
      }
      throw err;
    }
    await this.recordVerification(userId, 'PHONE');
  }

  // ── Password reset ───────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return; // Always succeed — no account enumeration.
    const token = generateOpaqueToken();
    await this.db.query(
      `INSERT INTO one_time_tokens (user_id, type, token_hash, expires_at)
       VALUES ($1, 'PASSWORD_RESET', $2, now() + make_interval(secs => $3))`,
      [user.id, sha256Hex(token), RESET_TOKEN_TTL_MS / 1000],
    );
    await this.email.send(user.email, 'Reset your password', `Your password reset token: ${token}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.consumeOneTimeToken('PASSWORD_RESET', token);
    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.users.setPasswordHash(userId, hash);
    await this.revokeAllSessions(userId);
    await this.audit(userId, 'auth.password_reset', 'users', userId);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async issueTokenPair(user: UserRow): Promise<TokenPair> {
    const refreshToken = generateOpaqueToken();
    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [user.id, sha256Hex(refreshToken), randomUUID(), this.config.refreshTokenTtlSec],
    );
    return {
      access_token: await this.tokens.signAccessToken(user.id, user.roles),
      refresh_token: refreshToken,
      expires_in: this.config.jwtAccessTtlSec,
    };
  }

  private async consumeOneTimeToken(type: 'EMAIL_VERIFY' | 'PASSWORD_RESET', token: string): Promise<string> {
    const { rows } = await this.db.query<{ user_id: string }>(
      `UPDATE one_time_tokens SET consumed_at = now()
       WHERE token_hash = $1 AND type = $2 AND consumed_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [sha256Hex(token), type],
    );
    const row = rows[0];
    if (!row) throw DomainError.validation('Invalid or expired token');
    return row.user_id;
  }

  private async recordVerification(userId: string, type: 'EMAIL' | 'PHONE'): Promise<void> {
    await this.db.query(
      `INSERT INTO verification_records (user_id, type, status, provider, verified_at)
       VALUES ($1, $2, 'PASSED', 'internal', now())
       ON CONFLICT DO NOTHING`,
      [userId, type],
    );
  }

  async audit(actorUserId: string | null, action: string, entityTable?: string, entityId?: string): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_table, entity_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorUserId, actorUserId ? 'USER' : 'SYSTEM', action, entityTable ?? null, entityId ?? null],
    );
  }

  addRole(userId: string, role: Extract<UserRole, 'CUSTOMER' | 'WORKER'>): Promise<UserRow> {
    return this.users.addRole(userId, role);
  }
}
