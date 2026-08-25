import { Module } from '@nestjs/common';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';
import { JobStateMachine } from './job-state-machine';
import { JobChangesService } from './job-changes.service';
import { DiscoveryService } from './discovery.service';
import { CancellationPolicyService } from './cancellation-policy.service';
import { JobsScheduler } from './jobs.scheduler';
import { JobChangesController, JobsAdminController, JobsController } from './jobs.controller';
import { AssignmentsController } from './assignments.controller';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [JobsController, JobChangesController, JobsAdminController, AssignmentsController],
  providers: [
    JobsRepository,
    JobsService,
    JobStateMachine,
    JobChangesService,
    DiscoveryService,
    CancellationPolicyService,
    JobsScheduler,
  ],
  exports: [JobsRepository, JobsService, JobStateMachine],
})
export class JobsModule {}
