import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsAdminController } from './settings.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [SettingsAdminController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
