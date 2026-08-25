import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Renders every error as the standard envelope and guarantees no stack traces
 * or internals ever reach clients.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'error' in (body as object)) {
        res.status(status).json(body);
        return;
      }
      // Normalize Nest built-in exceptions (404, 429, ...) to the envelope.
      const code =
        status === 401 ? 'UNAUTHENTICATED'
        : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
        : status === 429 ? 'RATE_LIMITED'
        : status === 422 || status === 400 ? 'VALIDATION_FAILED'
        : 'INTERNAL';
      const message =
        typeof body === 'object' && body !== null && 'message' in (body as Record<string, unknown>)
          ? String((body as Record<string, unknown>).message)
          : exception.message;
      res.status(status).json({ error: { code, message } });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  }
}
