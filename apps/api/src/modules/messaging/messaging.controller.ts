import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, RequestUser } from '../../common/auth.decorators';
import { MessagingService } from './messaging.service';

class OpenConversationDto {
  @IsUUID()
  job_id!: string;

  /** Required when the customer opens the conversation. */
  @IsOptional()
  @IsUUID()
  worker_user_id?: string;
}

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

class ReportMessageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

const MESSAGE_LIMIT = { default: { limit: 30, ttl: 60 * 1000 } };

@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('conversations')
  async list(@CurrentUser() user: RequestUser) {
    return { items: await this.messaging.listMine(user) };
  }

  @HttpCode(200)
  @Post('conversations')
  open(@CurrentUser() user: RequestUser, @Body() dto: OpenConversationDto) {
    return this.messaging.ensureConversation(user, dto.job_id, dto.worker_user_id);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messaging.listMessages(
      user,
      id,
      Math.min(Number(limit ?? 50), 100),
      cursor ? Number(cursor) : null,
    );
  }

  @Throttle(MESSAGE_LIMIT)
  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(user, id, dto.body);
  }

  @HttpCode(204)
  @Post('conversations/:id/read')
  async read(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.messaging.markRead(user, id);
  }

  @HttpCode(204)
  @Post('messages/:id/report')
  async report(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportMessageDto,
  ) {
    await this.messaging.reportMessage(user, id, dto.reason);
  }

  @HttpCode(204)
  @Post('users/:id/block')
  async block(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.messaging.blockUser(user, id);
  }

  @HttpCode(204)
  @Delete('users/:id/block')
  async unblock(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.messaging.unblockUser(user, id);
  }
}
