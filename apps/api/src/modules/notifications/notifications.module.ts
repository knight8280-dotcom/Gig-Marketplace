import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsListeners } from './notifications.listeners';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsListeners],
  exports: [NotificationsService],
})
export class NotificationsModule {}
