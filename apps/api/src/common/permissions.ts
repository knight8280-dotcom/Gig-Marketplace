import type { UserRole } from '@gig/shared';

/**
 * Central role → permission mapping (SECURITY_MODEL.md). Controllers declare
 * required permissions via @RequirePermissions; ownership/participation checks
 * happen in services against the database. Adding a role = adding a row here.
 *
 * Permissions are added phase by phase; this list grows with the product.
 */
export type Permission =
  | 'customer_profile:write'
  | 'worker_profile:write'
  | 'job:create'
  | 'job:accept'
  | 'admin:access';

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  CUSTOMER: ['customer_profile:write', 'job:create'],
  WORKER: ['worker_profile:write', 'job:accept'],
  ADMIN: ['admin:access'],
  // Future roles start with no permissions until product-defined:
  SUPPORT_AGENT: [],
  MODERATOR: [],
  BUSINESS_CUSTOMER: [],
  BUSINESS_WORKER_MANAGER: [],
};

export function permissionsForRoles(roles: readonly UserRole[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  }
  return set;
}
