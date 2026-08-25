import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Phase 0 skeleton entrypoint: boots the modular-monolith shell with health
 * endpoints only. Product modules are added phase by phase — see
 * docs/development/ROADMAP.md.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1', { exclude: ['healthz', 'readyz'] });

  const port = Number(process.env.PORT ?? 3000);
  // Bind 0.0.0.0 so containerized/PaaS environments can route traffic.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', msg: 'api_started', port }));
}

void bootstrap();
