import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { IsDefined } from 'class-validator';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { SETTING_DEFAULTS, SettingsService } from './settings.service';
import { DomainError } from '../../common/errors';

class PutSettingDto {
  @IsDefined()
  value!: unknown;
}

@RequirePermissions('admin:access')
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly auth: AuthService,
  ) {}

  @Get(':key')
  async get(@Param('key') key: string) {
    if (!(key in SETTING_DEFAULTS)) throw DomainError.notFound('Unknown setting');
    return { key, value: await this.settings.get(key) };
  }

  @Put(':key')
  async put(
    @CurrentUser() admin: RequestUser,
    @Param('key') key: string,
    @Body() dto: PutSettingDto,
  ) {
    if (!(key in SETTING_DEFAULTS)) throw DomainError.notFound('Unknown setting');
    const previous = await this.settings.get(key);
    await this.settings.set(key, dto.value, admin.id);
    await this.auth.audit(admin.id, 'admin.setting_updated', 'platform_settings', key);
    return { key, previous, value: dto.value };
  }
}
