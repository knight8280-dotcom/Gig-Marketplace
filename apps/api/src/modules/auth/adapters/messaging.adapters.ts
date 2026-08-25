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
 * Twilio SMS (SMS_PROVIDER=twilio). Two supported auth modes:
 *  - Account SID (AC…) + auth token: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.
 *  - API key SID (SK…) + secret: TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET.
 *    The owning account SID is discovered via GET /Accounts.json and cached.
 * The From number comes from TWILIO_FROM_NUMBER, or — when unset — the first
 * incoming phone number on the account (discovered once and cached).
 * Plain REST calls — no SDK needed.
 */
@Injectable()
export class TwilioSmsSender implements SmsSender {
  private readonly logger = new Logger('TwilioSms');
  private accountSid: string | null = null;
  private fromNumber: string | null = null;

  private basicAuth(): string {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid?.startsWith('AC') && authToken) {
      return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
    }
    const keySid = process.env.TWILIO_API_KEY_SID;
    const keySecret = process.env.TWILIO_API_KEY_SECRET;
    if (keySid?.startsWith('SK') && keySecret) {
      return `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString('base64')}`;
    }
    throw new Error(
      'Twilio is not configured (need TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)',
    );
  }

  private async twilioGet<T>(path: string): Promise<T> {
    const res = await fetch(`https://api.twilio.com/2010-04-01${path}`, {
      headers: { authorization: this.basicAuth() },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Twilio GET ${path} failed (${res.status}): ${detail.slice(0, 200)}`);
      throw new Error('Twilio API request failed');
    }
    return (await res.json()) as T;
  }

  private async resolveAccountSid(): Promise<string> {
    if (this.accountSid) return this.accountSid;
    const configured = process.env.TWILIO_ACCOUNT_SID;
    if (configured?.startsWith('AC')) {
      this.accountSid = configured;
      return configured;
    }
    const data = await this.twilioGet<{ accounts: Array<{ sid: string }> }>('/Accounts.json?PageSize=1');
    const sid = data.accounts[0]?.sid;
    if (!sid) throw new Error('Twilio: could not discover an account SID for these credentials');
    this.accountSid = sid;
    return sid;
  }

  private async resolveFromNumber(accountSid: string): Promise<string> {
    if (this.fromNumber) return this.fromNumber;
    const configured = process.env.TWILIO_FROM_NUMBER;
    if (configured) {
      this.fromNumber = configured;
      return configured;
    }
    const data = await this.twilioGet<{ incoming_phone_numbers: Array<{ phone_number: string }> }>(
      `/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=1`,
    );
    const number = data.incoming_phone_numbers[0]?.phone_number;
    if (!number) {
      throw new Error(
        'Twilio: no From number available — set TWILIO_FROM_NUMBER or buy a phone number on the account',
      );
    }
    this.fromNumber = number;
    return number;
  }

  async send(toPhone: string, body: string): Promise<void> {
    const accountSid = await this.resolveAccountSid();
    const from = await this.resolveFromNumber(accountSid);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: this.basicAuth(),
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
