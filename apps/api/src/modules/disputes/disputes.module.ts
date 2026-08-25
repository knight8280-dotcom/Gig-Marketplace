import { Module } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { DisputesAdminController, DisputesController } from './disputes.controller';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [DisputesController, DisputesAdminController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
