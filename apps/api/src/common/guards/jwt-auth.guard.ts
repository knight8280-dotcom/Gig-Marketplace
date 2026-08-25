import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, RequestUser } from '../auth.decorators';
import { DomainError } from '../errors';
import { TokenService } from '../../modules/auth/token.service';
import { UsersRepository } from '../../modules/users/users.repository';

/**
 * Global authentication guard. Verifies the bearer token AND loads the user
 * fresh from the database so suspensions/deletions take effect immediately —
 * a valid JWT alone never grants access.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw DomainError.unauthenticated();

    const payload = await this.tokens.verifyAccessToken(header.slice('Bearer '.length));
    const user = await this.users.findById(payload.sub);
    if (!user) throw DomainError.unauthenticated();
    if (user.status !== 'ACTIVE') {
      throw new DomainError('FORBIDDEN', 'This account is not active', 403);
    }

    req.user = {
      id: user.id,
      email: user.email,
      roles: user.roles,
      status: user.status,
      emailVerified: user.email_verified_at !== null,
      phoneVerified: user.phone_verified_at !== null,
    };
    return true;
  }
}
