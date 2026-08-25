import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser, RequestUser } from '../../common/auth.decorators';
import { NotificationsService } from './notifications.service';

class MarkReadDto {
  /** Omit to mark everything read. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(100)
  ids?: string[];
}

class PreferenceDto {
  @IsIn(['PUSH', 'EMAIL', 'SMS'])
  channel!: 'PUSH' | 'EMAIL' | 'SMS';

  @IsIn(['TRANSACTIONAL', 'JOB_ALERTS', 'MARKETING'])
  category!: 'TRANSACTIONAL' | 'JOB_ALERTS' | 'MARKETING';

  @IsBoolean()
  enabled!: boolean;
}

class DeviceTokenDto {
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @IsString()
  @MaxLength(300)
  token!: string;
}

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(
    @CurrentUser() user: RequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(user, Math.min(Number(limit ?? 30), 100), cursor ?? null);
  }

  @HttpCode(204)
  @Post('notifications/read')
  async read(@CurrentUser() user: RequestUser, @Body() dto: MarkReadDto) {
    await this.notifications.markRead(user, dto.ids ?? null);
  }

  @Get('me/notification-preferences')
  async preferences(@CurrentUser() user: RequestUser) {
    return { items: await this.notifications.getPreferences(user) };
  }

  @Put('me/notification-preferences')
  async setPreference(@CurrentUser() user: RequestUser, @Body() dto: PreferenceDto) {
    await this.notifications.setPreference(user, dto.channel, dto.category, dto.enabled);
    return { items: await this.notifications.getPreferences(user) };
  }

  @HttpCode(204)
  @Post('me/device-tokens')
  async deviceToken(@CurrentUser() user: RequestUser, @Body() dto: DeviceTokenDto) {
    await this.notifications.registerDeviceToken(user, dto.platform, dto.token);
  }
}
