import { Module, forwardRef } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UsersController } from './users.controller';
import { PublicProfileController } from './public-profile.controller';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { WorkersModule } from '../workers/workers.module';

@Module({
  imports: [forwardRef(() => AuthModule), CustomersModule, WorkersModule],
  controllers: [UsersController, PublicProfileController],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
