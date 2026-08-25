import { generateBase32Secret, generateTotp, totpUri, verifyTotp } from './totp';

/** RFC 6238 Appendix B test vectors (SHA-1, 8 digits truncated to compare via 6-digit impl re-derivation). */
describe('TOTP (RFC 6238)', () => {
  // RFC 6238 SHA-1 test secret: ASCII "12345678901234567890" = base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('matches RFC 6238 SHA-1 vectors (last 6 digits)', () => {
    // time (s) → 8-digit code from the RFC; our 6-digit output is its suffix.
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ];
    for (const [seconds, code8] of vectors) {
      expect(generateTotp(RFC_SECRET, seconds * 1000)).toBe(code8.slice(-6));
    }
  });

  it('verifies current codes and tolerates ±1 step drift', () => {
    const secret = generateBase32Secret();
    const now = Date.now();
    const code = generateTotp(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true); // one step later
    expect(verifyTotp(secret, code, now + 90_000)).toBe(false); // too old
    expect(verifyTotp(secret, '000000', now)).toBe(generateTotp(secret, now) === '000000');
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false);
  });

  it('builds standard otpauth URIs', () => {
    expect(totpUri('ABC234', 'Local Gig Marketplace', 'a@b.test')).toBe(
      'otpauth://totp/Local%20Gig%20Marketplace:a%40b.test?secret=ABC234&issuer=Local%20Gig%20Marketplace',
    );
  });
});
