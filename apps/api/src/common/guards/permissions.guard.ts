import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, RequestUser } from '../auth.decorators';
import { DomainError } from '../errors';
import { Permission, permissionsForRoles } from '../permissions';

/** Global permission guard — enforces @RequirePermissions declarations. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!req.user) throw DomainError.unauthenticated();

    const granted = permissionsForRoles(req.user.roles);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      throw new DomainError('FORBIDDEN', 'Missing required permission', 403, { missing });
    }
    return true;
  }
}
