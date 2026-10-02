import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? (process.env.NODE_ENV === 'production' ? undefined : fallback);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  if (process.env.NODE_ENV === 'production' && value.length < 32) {
    throw new Error(`${key} must contain at least 32 characters in production`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  trustProxyHops: Math.max(0, parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10) || 0),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  adminDashboardUrl: process.env.ADMIN_DASHBOARD_URL ?? 'http://localhost:5173',

  database: {
    url: requireEnv('DATABASE_URL', 'postgresql://rayvo:rayvo_dev_password@localhost:5432/rayvo'),
    ssl: process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL ?? '').includes('supabase'),
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-production-min-32-chars'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production-min-32-chars'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  session: {
    secret: requireEnv('SESSION_SECRET', 'dev-session-secret-change-in-production-min-32-chars'),
  },

  apiKeySalt: requireEnv('API_KEY_SALT', 'dev-api-key-salt-change-in-production-min-32-chars'),
  gameServerSecret: process.env.GAME_SERVER_API_KEY ?? '',
  photonAuthSecret: requireEnv('PHOTON_AUTH_SECRET', 'dev-photon-auth-secret-change-in-production-min-32-characters'),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000').split(','),
  },

  photon: {
    realtimeAppId: process.env.PHOTON_REALTIME_APP_ID ?? '',
    voiceAppId: process.env.PHOTON_VOICE_APP_ID ?? '',
    region: process.env.PHOTON_REGION ?? 'us',
    appVersion: process.env.PHOTON_APP_VERSION ?? '1.0',
  },

  logLevel: process.env.LOG_LEVEL ?? 'info',
  isProduction: process.env.NODE_ENV === 'production',
};
