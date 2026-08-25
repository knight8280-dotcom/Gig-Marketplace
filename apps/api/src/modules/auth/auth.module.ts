import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import {
  ConsoleEmailSender,
  ConsoleSmsSender,
  EMAIL_SENDER,
  SMS_SENDER,
  SmtpEmailSender,
  TwilioSmsSender,
} from './adapters/messaging.adapters';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    TotpService,
    // Provider selection by env: console (dev default), twilio, smtp.
    {
      provide: EMAIL_SENDER,
      useClass: (process.env.EMAIL_PROVIDER ?? 'console') === 'smtp' ? SmtpEmailSender : ConsoleEmailSender,
    },
    {
      provide: SMS_SENDER,
      useClass: (process.env.SMS_PROVIDER ?? 'console') === 'twilio' ? TwilioSmsSender : ConsoleSmsSender,
    },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
