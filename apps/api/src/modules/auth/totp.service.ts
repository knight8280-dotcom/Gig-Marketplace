import { Injectable } from '@nestjs/common';
import { generateBase32Secret, generateTotp, totpUri, verifyTotp } from '../../common/totp';
import { DatabaseService } from '../../database/database.service';
import { DomainError } from '../../common/errors';

/**
 * TOTP two-factor authentication (RFC 6238, implemented in common/totp.ts and
 * verified against RFC test vectors). Mandatory at sign-in once enrolled; the
 * admin dashboard requires enrollment (SECURITY_MODEL).
 */
@Injectable()
export class TotpService {
  constructor(private readonly db: DatabaseService) {}

  /** Step 1: generate a secret for the authenticator app. Not enabled yet. */
  async setup(userId: string, email: string): Promise<{ secret: string; otpauth_url: string }> {
    const { rows } = await this.db.query<{ totp_enabled_at: Date | null }>(
      'SELECT totp_enabled_at FROM users WHERE id = $1',
      [userId],
    );
    if (rows[0]?.totp_enabled_at) throw DomainError.conflict('Two-factor auth is already enabled');
    const secret = generateBase32Secret();
    await this.db.query('UPDATE users SET totp_secret = $2, updated_at = now() WHERE id = $1', [
      userId,
      secret,
    ]);
    return {
      secret,
      otpauth_url: totpUri(secret, 'Local Gig Marketplace', email),
    };
  }

  /** Step 2: prove possession with a valid code to switch enforcement on. */
  async enable(userId: string, code: string): Promise<void> {
    const { rows } = await this.db.query<{ totp_secret: string | null; totp_enabled_at: Date | null }>(
      'SELECT totp_secret, totp_enabled_at FROM users WHERE id = $1',
      [userId],
    );
    const user = rows[0];
    if (!user?.totp_secret) throw DomainError.conflict('Run 2FA setup first');
    if (user.totp_enabled_at) throw DomainError.conflict('Two-factor auth is already enabled');
    if (!verifyTotp(user.totp_secret, code)) {
      throw new DomainError('TOTP_INVALID', 'Invalid authenticator code', 401);
    }
    await this.db.query('UPDATE users SET totp_enabled_at = now(), updated_at = now() WHERE id = $1', [
      userId,
    ]);
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_table, entity_id)
       VALUES ($1::uuid, 'USER', 'auth.totp_enabled', 'users', ($1::uuid)::text)`,
      [userId],
    );
  }

  /** Sign-in enforcement: throws when a code is required/invalid. */
  async verifyAtLogin(
    user: { totp_secret: string | null; totp_enabled_at: Date | null },
    code?: string,
  ): Promise<void> {
    if (!user.totp_enabled_at || !user.totp_secret) return;
    if (!code) {
      throw new DomainError('TOTP_REQUIRED', 'Enter your authenticator code', 401);
    }
    if (!verifyTotp(user.totp_secret, code)) {
      throw new DomainError('TOTP_INVALID', 'Invalid authenticator code', 401);
    }
  }

  /** Test/support helper mirroring the login code generator. */
  static generateCode(secret: string): string {
    return generateTotp(secret);
  }
}
