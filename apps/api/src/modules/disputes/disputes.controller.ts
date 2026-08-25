import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsInt, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { DisputesService } from './disputes.service';

const DISPUTE_CATEGORIES = [
  'NOT_COMPLETED', 'INCOMPLETE_WORK', 'SCOPE_CHANGED', 'PAYMENT', 'PROPERTY_DAMAGE',
  'WORKER_BEHAVIOR', 'CUSTOMER_BEHAVIOR', 'CANCELLATION', 'NO_SHOW', 'SAFETY', 'FRAUD',
] as const;

class OpenDisputeDto {
  @IsUUID()
  job_id!: string;

  @IsOptional()
  @IsUUID()
  assignment_id?: string;

  @IsIn(DISPUTE_CATEGORIES)
  category!: (typeof DISPUTE_CATEGORIES)[number];

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;
}

class EvidenceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  note!: string;
}

class ResolveDto {
  @IsIn(['RELEASE', 'REFUND_FULL', 'REFUND_PARTIAL', 'OTHER'])
  resolution!: 'RELEASE' | 'REFUND_FULL' | 'REFUND_PARTIAL' | 'OTHER';

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount_cents?: number;
}

@Controller()
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post('disputes')
  open(@CurrentUser() user: RequestUser, @Body() dto: OpenDisputeDto) {
    return this.disputes.open(user, dto);
  }

  @Get('disputes/mine')
  async mine(@CurrentUser() user: RequestUser) {
    return { items: await this.disputes.listMine(user) };
  }

  @Get('disputes/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.getForUser(user, id);
  }

  @Post('disputes/:id/evidence')
  addEvidence(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvidenceDto,
  ) {
    return this.disputes.addEvidence(user, id, dto.note);
  }
}

@RequirePermissions('admin:access')
@Controller('admin/disputes')
export class DisputesAdminController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  async list(@Query('status') status?: string) {
    return { items: await this.disputes.adminList(status) };
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.adminDetail(id);
  }

  @HttpCode(200)
  @Post(':id/resolve')
  resolve(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDto,
  ) {
    return this.disputes.resolve(admin, id, dto.resolution, dto.reason, dto.amount_cents);
  }
}
