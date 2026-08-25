import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@gig/shared';

/**
 * Domain error carrying a stable machine-readable code from the shared
 * catalog. The global filter renders the standard envelope
 * { error: { code, message, details } } — see API_SPECIFICATION.md.
 */
export class DomainError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, ...(details ? { details } : {}) } }, status);
  }

  static unauthenticated(message = 'Authentication required'): DomainError {
    return new DomainError('UNAUTHENTICATED', message, 401);
  }
  static forbidden(message = 'You do not have access to this resource'): DomainError {
    return new DomainError('FORBIDDEN', message, 403);
  }
  static notFound(message = 'Not found'): DomainError {
    // Also used to mask resources the caller must not know exist (anti-IDOR).
    return new DomainError('NOT_FOUND', message, 404);
  }
  static conflict(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('CONFLICT', message, 409, details);
  }
  static validation(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError('VALIDATION_FAILED', message, 422, details);
  }
}
