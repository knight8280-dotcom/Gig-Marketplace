import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

/**
 * Modular-monolith root. Product modules (auth, users, customers, workers,
 * skills, categories, availability, jobs, matching, messaging, notifications,
 * payments, payouts, ratings, disputes, reports, verification, admin,
 * analytics, files) are registered here as they are built — each lives under
 * src/modules/<name>/ with its responsibilities documented in
 * docs/architecture/SYSTEM_ARCHITECTURE.md §3.
 */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
