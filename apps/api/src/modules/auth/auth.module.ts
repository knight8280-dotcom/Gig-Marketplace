import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import {
  ConsoleEmailSender,
  ConsoleSmsSender,
  EMAIL_SENDER,
  SMS_SENDER,
} from './adapters/messaging.adapters';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    // Provider selection by env var; only console adapters exist today —
    // real providers (SMTP/Twilio) are added behind the same interfaces.
    { provide: EMAIL_SENDER, useClass: ConsoleEmailSender },
    { provide: SMS_SENDER, useClass: ConsoleSmsSender },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
