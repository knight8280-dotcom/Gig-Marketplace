import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@gig/shared';
import { AppConfig, CONFIG } from '../../config/config';
import { DomainError } from '../../common/errors';

export interface AccessTokenPayload {
  sub: string;
  roles: UserRole[];
}

/** Short-lived JWT access tokens (HS256). Refresh tokens are opaque and DB-backed. */
@Injectable()
export class TokenService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  async signAccessToken(userId: string, roles: UserRole[]): Promise<string> {
    return jwt.sign({ roles }, this.config.jwtAccessSecret, {
      algorithm: 'HS256',
      subject: userId,
      expiresIn: this.config.jwtAccessTtlSec,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = jwt.verify(token, this.config.jwtAccessSecret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
      if (typeof payload.sub !== 'string') throw new Error('missing sub');
      return { sub: payload.sub, roles: (payload.roles as UserRole[]) ?? [] };
    } catch {
      throw new DomainError('TOKEN_EXPIRED', 'Invalid or expired access token', 401);
    }
  }
}
