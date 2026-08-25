/**
 * Money is ALWAYS integer minor units (e.g. cents) with an explicit ISO 4217
 * currency. Floating-point arithmetic on money is forbidden project-wide.
 * See docs/business/PAYMENT_MODEL.md.
 */
export interface Money {
  /** Integer minor units, e.g. 7550 = $75.50 */
  readonly amountCents: number;
  /** ISO 4217, e.g. "USD" */
  readonly currency: string;
}

export function assertValidMoney(m: Money): void {
  if (!Number.isSafeInteger(m.amountCents)) {
    throw new TypeError(`Money amount must be a safe integer of minor units, got ${m.amountCents}`);
  }
  if (!/^[A-Z]{3}$/.test(m.currency)) {
    throw new TypeError(`Money currency must be an ISO 4217 code, got "${m.currency}"`);
  }
}
