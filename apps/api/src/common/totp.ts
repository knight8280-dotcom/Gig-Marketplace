import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s steps — the standard authenticator-app
 * profile) implemented directly on node:crypto. Small, dependency-free, and
 * auditable; verified against RFC 4226/6238 test vectors in unit tests.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: bigint, digits = 6): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(counter);
  const hmac = createHmac('sha1', secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    (((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff)) %
    10 ** digits;
  return String(code).padStart(digits, '0');
}

export function generateTotp(base32Secret: string, atMs = Date.now(), stepSeconds = 30): string {
  return hotp(base32Decode(base32Secret), BigInt(Math.floor(atMs / 1000 / stepSeconds)));
}

/** Accepts the current step ±1 to tolerate clock drift. Constant-time compare. */
export function verifyTotp(base32Secret: string, token: string, atMs = Date.now(), stepSeconds = 30): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const secret = base32Decode(base32Secret);
  const step = BigInt(Math.floor(atMs / 1000 / stepSeconds));
  for (const delta of [-1n, 0n, 1n]) {
    const counter = step + delta;
    if (counter < 0n) continue;
    const expected = Buffer.from(hotp(secret, counter));
    const provided = Buffer.from(token);
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) return true;
  }
  return false;
}

export function totpUri(base32Secret: string, issuer: string, label: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}`;
}
