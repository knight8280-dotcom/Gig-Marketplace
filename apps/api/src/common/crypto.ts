import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** URL-safe opaque token (refresh tokens, email/reset tokens). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 6-digit SMS verification code. */
export function generateNumericCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Tokens are stored only as SHA-256 hashes. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function constantTimeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
