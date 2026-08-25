import { Injectable } from '@nestjs/common';
import type { UserRole, UserStatus } from '@gig/shared';
import { DatabaseService } from '../../database/database.service';

export interface UserRow {
  id: string;
  email: string;
  email_verified_at: Date | null;
  phone: string | null;
  phone_verified_at: Date | null;
  password_hash: string;
  roles: UserRole[];
  status: UserStatus;
  suspended_reason: string | null;
  totp_secret: string | null;
  totp_enabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ?? null;
  }

  async create(email: string, passwordHash: string, roles: UserRole[]): Promise<UserRow> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO users (email, password_hash, roles) VALUES ($1, $2, $3::user_role[]) RETURNING *`,
      [email, passwordHash, roles],
    );
    return rows[0]!;
  }

  async addRole(userId: string, role: UserRole): Promise<UserRow> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users SET roles = array_append(roles, $2::user_role), updated_at = now()
       WHERE id = $1 AND NOT ($2 = ANY(roles)) RETURNING *`,
      [userId, role],
    );
    if (rows[0]) return rows[0];
    return (await this.findById(userId))!;
  }

  async setEmailVerified(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1 AND email_verified_at IS NULL',
      [userId],
    );
  }

  async setPhoneVerified(userId: string, phone: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET phone = $2, phone_verified_at = now(), updated_at = now() WHERE id = $1',
      [userId, phone],
    );
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
      userId,
      passwordHash,
    ]);
  }

  async setStatus(userId: string, status: UserStatus, reason?: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET status = $2, suspended_reason = $3, updated_at = now() WHERE id = $1',
      [userId, status, reason ?? null],
    );
  }
}
