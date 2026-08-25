/**
 * Stable machine-readable API error codes (see docs/api/API_SPECIFICATION.md).
 * Clients branch on `error.code`, never on human-readable messages.
 * Codes are added per phase; removing/renaming a shipped code is a breaking change.
 */
export const ERROR_CODES = [
  // generic
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'INTERNAL',
  // auth
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'REFRESH_TOKEN_REVOKED',
  'EMAIL_NOT_VERIFIED',
  'PHONE_NOT_VERIFIED',
  'TOTP_REQUIRED',
  'TOTP_INVALID',
  // marketplace
  'JOB_ALREADY_FILLED',
  'JOB_NOT_OPEN',
  'REQUIREMENTS_NOT_MET',
  'ALREADY_ASSIGNED',
  'INVALID_STATE_TRANSITION',
  'RESTRICTED_JOB_PENDING_REVIEW',
  'CANCELLATION_NOT_ACKNOWLEDGED',
  // payments
  'PAYMENT_METHOD_REQUIRED',
  'PAYOUT_ACCOUNT_INCOMPLETE',
  'PAYMENT_FAILED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
