import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import pino from 'pino';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL ?? '').includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
});

const INTERVAL_MS = 60_000;

async function cleanupExpiredSessions(): Promise<number> {
  const result = await pool.query(
    `UPDATE player_sessions SET revoked_at = NOW() WHERE expires_at < NOW() AND revoked_at IS NULL RETURNING id`
  );
  return result.rowCount ?? 0;
}

async function cleanupExpiredItems(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM player_inventory WHERE expires_at IS NOT NULL AND expires_at < NOW() RETURNING id`
  );
  return result.rowCount ?? 0;
}

async function cleanupExpiredTickets(): Promise<number> {
  const result = await pool.query(
    `UPDATE matchmaking_tickets SET status = 'expired' WHERE status = 'searching' AND expires_at < NOW() RETURNING id`
  );
  return result.rowCount ?? 0;
}

async function cleanupExpiredNonces(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM request_nonces WHERE expires_at < NOW() RETURNING id`
  );
  return result.rowCount ?? 0;
}

async function cleanupExpiredServerIdempotencyKeys(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM server_idempotency_keys WHERE expires_at < NOW() RETURNING idempotency_key`
  );
  return result.rowCount ?? 0;
}

async function cleanupExpiredPhotonTokens(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM photon_auth_tokens WHERE expires_at < NOW() - INTERVAL '1 day' RETURNING id`
  );
  return result.rowCount ?? 0;
}

async function processLeaderboardResets(): Promise<void> {
  const leaderboards = await pool.query(
    `SELECT leaderboard_id, stat_key, season_id FROM leaderboard_definitions WHERE reset_schedule IS NOT NULL AND is_active = true`
  );

  for (const lb of leaderboards.rows) {
    if (lb.reset_schedule === 'daily') {
      await pool.query(
        `DELETE FROM leaderboard_entries WHERE leaderboard_id = $1 AND updated_at < NOW() - INTERVAL '1 day'`,
        [lb.leaderboard_id]
      );
    }
  }
}

async function runJobs(): Promise<void> {
  try {
    const [sessions, items, tickets, nonces, photonTokens, idempotencyKeys] = await Promise.all([
      cleanupExpiredSessions(),
      cleanupExpiredItems(),
      cleanupExpiredTickets(),
      cleanupExpiredNonces(),
      cleanupExpiredPhotonTokens(),
      cleanupExpiredServerIdempotencyKeys(),
    ]);

    await processLeaderboardResets();

    if (sessions + items + tickets + nonces + photonTokens + idempotencyKeys > 0) {
      logger.info({ sessions, items, tickets, nonces, photonTokens, idempotencyKeys }, 'Cleanup jobs completed');
    }
  } catch (err) {
    logger.error({ err }, 'Worker job failed');
  }
}

logger.info('Rayvo background worker started');
runJobs();
setInterval(runJobs, INTERVAL_MS);

process.on('SIGTERM', async () => {
  logger.info('Worker shutting down');
  await pool.end();
  process.exit(0);
});
