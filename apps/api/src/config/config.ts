/**
 * Typed environment configuration. All variables are documented in the root
 * .env.example. Development defaults are safe local values; production
 * requires real secrets (enforced below).
 */
export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwtAccessSecret: string;
  readonly jwtAccessTtlSec: number;
  readonly refreshTokenTtlSec: number;
  readonly emailProvider: string;
  readonly smsProvider: string;
  readonly geocoderProvider: string;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  const isProd = nodeEnv === 'production';

  const jwtAccessSecret = env('JWT_ACCESS_SECRET', isProd ? undefined : 'dev_only_change_me');
  if (isProd && jwtAccessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
  }

  return {
    nodeEnv,
    port: Number(env('PORT', '3000')),
    databaseUrl: env(
      'DATABASE_URL',
      isProd ? undefined : 'postgresql://gig:gig_dev_password@localhost:5432/gig_dev',
    ),
    jwtAccessSecret,
    jwtAccessTtlSec: Number(env('JWT_ACCESS_TTL_SEC', String(15 * 60))),
    refreshTokenTtlSec: Number(env('REFRESH_TOKEN_TTL_SEC', String(30 * 24 * 3600))),
    emailProvider: env('EMAIL_PROVIDER', 'console'),
    smsProvider: env('SMS_PROVIDER', 'console'),
    geocoderProvider: env('GEOCODER_PROVIDER', 'stub'),
  };
}

export const CONFIG = 'APP_CONFIG';
