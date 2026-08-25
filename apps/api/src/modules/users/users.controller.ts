import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { CurrentUser, RequestUser } from '../../common/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { UsersRepository } from './users.repository';
import { DomainError } from '../../common/errors';
import { CustomersRepository } from '../customers/customers.repository';
import { WorkersRepository } from '../workers/workers.repository';

class AddRoleDto {
  /** A user may hold both marketplace roles; ADMIN is never self-assignable. */
  @IsIn(['CUSTOMER', 'WORKER'])
  role!: 'CUSTOMER' | 'WORKER';
}

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersRepository,
    private readonly auth: AuthService,
    private readonly customers: CustomersRepository,
    private readonly workers: WorkersRepository,
  ) {}

  /**
   * Progressive-onboarding status: which steps are done and what still blocks
   * key actions. Clients render checklists from this — the server enforces the
   * same requirements at action time (accept/post), never trusting the client.
   */
  @Get('onboarding')
  async onboarding(@CurrentUser() user: RequestUser) {
    const [customerProfile, workerProfile, agreements] = await Promise.all([
      this.customers.findProfile(user.id),
      this.workers.findProfile(user.id),
      this.workers.getAgreements(user.id),
    ]);
    const [skillIds, categoryIds, availability, hasHome] = workerProfile
      ? await Promise.all([
          this.workers.getSkillIds(user.id),
          this.workers.getCategoryIds(user.id),
          this.workers.getAvailability(user.id),
          this.workers.hasHomeLocation(user.id),
        ])
      : [[], [], null, false];

    return {
      email_verified: user.emailVerified,
      phone_verified: user.phoneVerified,
      customer: user.roles.includes('CUSTOMER')
        ? { profile_created: customerProfile !== null }
        : null,
      worker: user.roles.includes('WORKER')
        ? {
            profile_created: workerProfile !== null,
            home_location_set: hasHome,
            skills_selected: skillIds.length > 0,
            categories_selected: categoryIds.length > 0,
            availability_configured: (availability?.windows.length ?? 0) > 0 || (availability?.available_now ?? false),
            terms_accepted: agreements.some((a) => a.agreement === 'TERMS_OF_SERVICE'),
            safety_acknowledged: agreements.some((a) => a.agreement === 'WORKER_SAFETY'),
            // Real payout status arrives with the payments phase — until then
            // this is honestly false, never faked.
            payout_ready: false,
          }
        : null,
    };
  }

  @Get()
  async me(@CurrentUser() user: RequestUser) {
    const row = await this.users.findById(user.id);
    if (!row) throw DomainError.notFound();
    // Allow-listed DTO — never the raw row (no password_hash etc.).
    return {
      id: row.id,
      email: row.email,
      email_verified: row.email_verified_at !== null,
      phone: row.phone,
      phone_verified: row.phone_verified_at !== null,
      roles: row.roles,
      status: row.status,
      created_at: row.created_at,
    };
  }

  @Post('roles')
  async addRole(@CurrentUser() user: RequestUser, @Body() dto: AddRoleDto) {
    const row = await this.auth.addRole(user.id, dto.role);
    await this.auth.audit(user.id, 'user.role_added', 'users', user.id);
    return { roles: row.roles };
  }

  @HttpCode(202)
  @Delete()
  async requestDeletion(@CurrentUser() user: RequestUser) {
    await this.users.setStatus(user.id, 'DELETION_REQUESTED');
    await this.auth.revokeAllSessions(user.id);
    await this.auth.audit(user.id, 'user.deletion_requested', 'users', user.id);
    return {
      status: 'DELETION_REQUESTED',
      note: 'Sign in again within the grace period to cancel deletion.',
    };
  }
}
