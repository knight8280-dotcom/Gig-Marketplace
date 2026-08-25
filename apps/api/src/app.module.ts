import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ValidationPipe } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { WorkersModule } from './modules/workers/workers.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SettingsModule } from './modules/settings/settings.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MatchingModule } from './modules/matching/matching.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { GlobalExceptionFilter } from './common/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { DomainError } from './common/errors';

/**
 * Modular-monolith root. Modules are registered phase by phase
 * (docs/development/ROADMAP.md); responsibilities in
 * docs/architecture/SYSTEM_ARCHITECTURE.md §3.
 */
@Module({
  imports: [
    DatabaseModule,
    // Default read-class limit; strict per-route overrides on auth endpoints.
    // In-memory storage for MVP single instance; swap to Redis storage when
    // scaling horizontally (SYSTEM_ARCHITECTURE §12).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 5 * 60 * 1000, limit: 600 }]),
    AuthModule,
    UsersModule,
    CustomersModule,
    WorkersModule,
    CatalogModule,
    SettingsModule,
    JobsModule,
    MatchingModule,
    MessagingModule,
    RatingsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors) =>
          DomainError.validation('Request validation failed', {
            fields: Object.fromEntries(
              errors.map((e) => [e.property, Object.values(e.constraints ?? {})]),
            ),
          }),
      }),
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
