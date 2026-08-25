import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { DomainError } from '../../common/errors';
import { WorkersRepository } from './workers.repository';
import {
  AcceptAgreementDto,
  SetAvailabilityDto,
  SetCategoriesDto,
  SetSkillsDto,
  UpsertWorkerProfileDto,
} from './dto';

@Controller('me')
export class WorkersController {
  constructor(private readonly workers: WorkersRepository) {}

  @Get('worker-profile')
  async getProfile(@CurrentUser() user: RequestUser) {
    const profile = await this.workers.findProfile(user.id);
    if (!profile) throw DomainError.notFound('No worker profile yet');
    const [skillIds, categoryIds, hasHome] = await Promise.all([
      this.workers.getSkillIds(user.id),
      this.workers.getCategoryIds(user.id),
      this.workers.hasHomeLocation(user.id),
    ]);
    // home_location itself is never returned — only whether it is set.
    return { ...profile, skill_ids: skillIds, category_ids: categoryIds, home_location_set: hasHome };
  }

  @RequirePermissions('worker_profile:write')
  @Put('worker-profile')
  async upsertProfile(@CurrentUser() user: RequestUser, @Body() dto: UpsertWorkerProfileDto) {
    const profile = await this.workers.upsertProfile(user.id, dto);
    return { ...profile, home_location_set: await this.workers.hasHomeLocation(user.id) };
  }

  @RequirePermissions('worker_profile:write')
  @Put('worker-profile/skills')
  async setSkills(@CurrentUser() user: RequestUser, @Body() dto: SetSkillsDto) {
    await this.ensureProfile(user.id);
    await this.workers.setSkills(user.id, dto.skill_ids);
    return { skill_ids: dto.skill_ids };
  }

  @RequirePermissions('worker_profile:write')
  @Put('worker-profile/categories')
  async setCategories(@CurrentUser() user: RequestUser, @Body() dto: SetCategoriesDto) {
    await this.ensureProfile(user.id);
    await this.workers.setCategories(user.id, dto.category_ids);
    return { category_ids: dto.category_ids };
  }

  @Get('availability')
  async getAvailability(@CurrentUser() user: RequestUser) {
    const availability = await this.workers.getAvailability(user.id);
    if (!availability) throw DomainError.notFound('Create a worker profile first');
    return availability;
  }

  @RequirePermissions('worker_profile:write')
  @Put('availability')
  async setAvailability(@CurrentUser() user: RequestUser, @Body() dto: SetAvailabilityDto) {
    await this.workers.setAvailability(
      user.id,
      dto.available_now,
      dto.available_until ?? null,
      dto.windows,
    );
    return this.workers.getAvailability(user.id);
  }

  @HttpCode(201)
  @Post('agreements')
  async acceptAgreement(@CurrentUser() user: RequestUser, @Body() dto: AcceptAgreementDto) {
    await this.workers.acceptAgreement(user.id, dto.agreement, dto.version);
    return { items: await this.workers.getAgreements(user.id) };
  }

  @Get('agreements')
  async getAgreements(@CurrentUser() user: RequestUser) {
    return { items: await this.workers.getAgreements(user.id) };
  }

  private async ensureProfile(userId: string): Promise<void> {
    const profile = await this.workers.findProfile(userId);
    if (!profile) throw DomainError.notFound('Create a worker profile first');
  }
}
