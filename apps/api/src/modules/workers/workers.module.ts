import { Module } from '@nestjs/common';
import { WorkersController } from './workers.controller';
import { WorkersRepository } from './workers.repository';

@Module({
  controllers: [WorkersController],
  providers: [WorkersRepository],
  exports: [WorkersRepository],
})
export class WorkersModule {}
