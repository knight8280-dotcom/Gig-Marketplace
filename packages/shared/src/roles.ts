/**
 * User roles. The authorization model is permission-based (role → permission set,
 * resolved server-side), so adding a role here must not require rewriting access
 * control — see docs/security/SECURITY_MODEL.md.
 */
export const USER_ROLES = [
  'CUSTOMER',
  'WORKER',
  'ADMIN',
  // Reserved for future use — defined now so clients and DB enums stay stable:
  'SUPPORT_AGENT',
  'MODERATOR',
  'BUSINESS_CUSTOMER',
  'BUSINESS_WORKER_MANAGER',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'DELETION_REQUESTED',
  'DELETED',
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
