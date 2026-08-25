import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { CurrentUser, RequestUser } from '../../common/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { UsersRepository } from './users.repository';
import { DomainError } from '../../common/errors';

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
  ) {}

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
