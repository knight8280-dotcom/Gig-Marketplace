import { Injectable, Logger } from '@nestjs/common';

/**
 * Provider adapters for outbound email/SMS. The `console` implementations are
 * DEVELOPMENT-ONLY delivery stubs (clearly labeled per the no-fake-functionality
 * rule): they log instead of sending. Real providers (SMTP/Resend, Twilio) are
 * selected via EMAIL_PROVIDER / SMS_PROVIDER and wired behind these interfaces.
 */
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface SmsSender {
  send(toPhone: string, body: string): Promise<void>;
}

export const EMAIL_SENDER = 'EMAIL_SENDER';
export const SMS_SENDER = 'SMS_SENDER';

@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger('DevEmail');
  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`[DEV EMAIL — not actually sent] to=${to} subject="${subject}" body="${body}"`);
  }
}

@Injectable()
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('DevSms');
  async send(toPhone: string, body: string): Promise<void> {
    this.logger.log(`[DEV SMS — not actually sent] to=${toPhone} body="${body}"`);
  }
}
