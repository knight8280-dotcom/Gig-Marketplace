import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole, UserStatus } from '@gig/shared';
import type { Permission } from './permissions';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks an endpoint as unauthenticated (register, login, webhooks, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Authenticated user attached to the request by JwtAuthGuard. */
export interface RequestUser {
  id: string;
  email: string;
  roles: UserRole[];
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
  return req.user;
});
