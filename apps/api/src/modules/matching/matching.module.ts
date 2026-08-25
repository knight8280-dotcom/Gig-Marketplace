import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { MatchingListeners } from './matching.listeners';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [MatchingService, MatchingListeners],
  exports: [MatchingService],
})
export class MatchingModule {}
