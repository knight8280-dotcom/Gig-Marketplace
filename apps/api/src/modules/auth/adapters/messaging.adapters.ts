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

/**
 * Twilio SMS (SMS_PROVIDER=twilio). Requires TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER. Plain REST call — no SDK needed.
 */
@Injectable()
export class TwilioSmsSender implements SmsSender {
  private readonly logger = new Logger('TwilioSms');

  async send(toPhone: string, body: string): Promise<void> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw new Error('Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)');
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toPhone, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Twilio send failed (${res.status}): ${detail.slice(0, 200)}`);
      throw new Error('SMS delivery failed');
    }
  }
}

/** SMTP email (EMAIL_PROVIDER=smtp). Requires SMTP_URL and EMAIL_FROM. */
@Injectable()
export class SmtpEmailSender implements EmailSender {
  private readonly logger = new Logger('SmtpEmail');
  private transporter: import('nodemailer').Transporter | null = null;

  private async getTransporter(): Promise<import('nodemailer').Transporter> {
    if (!this.transporter) {
      const url = process.env.SMTP_URL;
      if (!url) throw new Error('SMTP is not configured (SMTP_URL)');
      const nodemailer = await import('nodemailer');
      this.transporter = nodemailer.createTransport(url);
    }
    return this.transporter;
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? 'no-reply@localhost',
      to,
      subject,
      text: body,
    });
    this.logger.log(`Email sent to ${to}: ${subject}`);
  }
}
