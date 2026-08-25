import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsListeners } from './payments.listeners';
import { RealStripeGateway, STRIPE_GATEWAY } from './stripe.gateway';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsListeners,
    // Tests override this token with a deterministic fake (test double only —
    // production always uses the real gateway).
    { provide: STRIPE_GATEWAY, useClass: RealStripeGateway },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
