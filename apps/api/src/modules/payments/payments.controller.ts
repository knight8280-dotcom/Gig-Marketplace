import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, RawBodyRequest, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { IsInt, IsString, IsUrl, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser, Public, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { DomainError } from '../../common/errors';
import { PaymentsService } from './payments.service';

class DefaultPaymentMethodDto {
  @IsString()
  @MaxLength(100)
  payment_method_id!: string;
}

class SyncSetupIntentDto {
  @IsString()
  @MaxLength(100)
  setup_intent_id!: string;
}

class OnboardingLinkDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  refresh_url!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  return_url!: string;
}

class TipDto {
  @IsUUID()
  assignment_id!: string;

  /** $1 – $500 in cents. */
  @IsInt()
  @Min(100)
  @Max(50000)
  amount_cents!: number;
}

const PAYMENT_LIMIT = { default: { limit: 30, ttl: 60 * 60 * 1000 } };

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // ── Customer payment methods ────────────────────────────────────────────────

  @RequirePermissions('customer_profile:write')
  @Throttle(PAYMENT_LIMIT)
  @HttpCode(200)
  @Post('me/payment-methods/setup-intent')
  setupIntent(@CurrentUser() user: RequestUser) {
    return this.payments.createSetupIntent(user);
  }

  @RequirePermissions('customer_profile:write')
  @HttpCode(200)
  @Post('me/payment-methods/default')
  async setDefault(@CurrentUser() user: RequestUser, @Body() dto: DefaultPaymentMethodDto) {
    await this.payments.setDefaultPaymentMethod(user, dto.payment_method_id);
    return this.payments.getPaymentProfile(user.id);
  }

  @RequirePermissions('customer_profile:write')
  @HttpCode(200)
  @Post('me/payment-methods/sync-setup-intent')
  async syncSetupIntent(@CurrentUser() user: RequestUser, @Body() dto: SyncSetupIntentDto) {
    await this.payments.syncFromSetupIntent(user, dto.setup_intent_id);
    return this.payments.getPaymentProfile(user.id);
  }

  @Get('me/payment-profile')
  profile(@CurrentUser() user: RequestUser) {
    return this.payments.getPaymentProfile(user.id);
  }

  @Get('me/payments')
  async listPayments(@CurrentUser() user: RequestUser, @Query('job_id') jobId?: string) {
    return { items: await this.payments.listPayments(user.id, jobId) };
  }

  @RequirePermissions('job:create')
  @Throttle(PAYMENT_LIMIT)
  @HttpCode(200)
  @Post('jobs/:id/retry-payment')
  async retryPayment(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.payments.retryCharge(user, id);
    return { status: 'SUCCEEDED' };
  }

  @RequirePermissions('job:create')
  @Throttle(PAYMENT_LIMIT)
  @HttpCode(200)
  @Post('jobs/:id/tip')
  tip(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TipDto) {
    return this.payments.tipWorker(user, id, dto.assignment_id, dto.amount_cents);
  }

  // ── Worker payouts ──────────────────────────────────────────────────────────

  @RequirePermissions('worker_profile:write')
  @Throttle(PAYMENT_LIMIT)
  @HttpCode(200)
  @Post('me/payout-account/onboarding-link')
  onboardingLink(@CurrentUser() user: RequestUser, @Body() dto: OnboardingLinkDto) {
    return this.payments.createOnboardingLink(user, dto.refresh_url, dto.return_url);
  }

  @Get('me/payout-account')
  async payoutAccount(@CurrentUser() user: RequestUser) {
    const account = await this.payments.getPayoutAccount(user.id);
    if (!account) return { exists: false };
    return { exists: true, ...account };
  }

  @RequirePermissions('worker_profile:write')
  @HttpCode(200)
  @Post('me/payout-account/refresh')
  async refreshAccount(@CurrentUser() user: RequestUser) {
    const refreshed = await this.payments.refreshPayoutAccountStatus(user.id);
    if (!refreshed) throw DomainError.notFound('No payout account yet');
    return refreshed;
  }

  @Get('me/payouts')
  async listPayouts(@CurrentUser() user: RequestUser) {
    return { items: await this.payments.listPayouts(user.id) };
  }

  @Get('me/earnings')
  earnings(@CurrentUser() user: RequestUser) {
    return this.payments.earningsSummary(user.id);
  }

  // ── Stripe webhook (public route, signature-verified) ───────────────────────

  @Public()
  @HttpCode(200)
  @Post('webhooks/stripe')
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!signature || !req.rawBody) {
      throw DomainError.validation('Missing webhook signature');
    }
    return this.payments.processWebhook(req.rawBody, signature);
  }
}
