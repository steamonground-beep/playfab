import { query, queryOne, withTransaction } from '../lib/db';
import { ConflictError, ForbiddenError, ValidationError } from '../lib/errors';
import { trackEvent } from './analytics.service';

export async function getPlayerStatistics(playerId: string, statKeys?: string[]): Promise<Array<{ statKey: string; value: number }>> {
  let sql = `SELECT ps.stat_key, ps.value FROM player_statistics ps
             JOIN statistic_definitions sd ON ps.stat_key = sd.stat_key
             WHERE ps.player_id = $1 AND sd.is_active = true`;
  const params: unknown[] = [playerId];

  if (statKeys?.length) {
    sql += ` AND ps.stat_key = ANY($2)`;
    params.push(statKeys);
  }

  const rows = await query<{ stat_key: string; value: string }>(sql, params);
  return rows.map(r => ({ statKey: r.stat_key, value: parseFloat(r.value) }));
}

export async function updatePlayerStatistics(
  playerId: string,
  updates: Array<{ statKey: string; value?: number; increment?: number }>,
  source = 'api',
  idempotencyKey?: string
): Promise<Array<{ statKey: string; value: number }>> {
  if (source !== 'server' && source !== 'admin') {
    throw new ForbiddenError('Statistics can only be changed by trusted server-side code');
  }
  if (source === 'server' && (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128)) {
    throw new ValidationError('A 16-128 character idempotency key is required for server statistic writes');
  }

  const results: Array<{ statKey: string; value: number }> = [];

  await withTransaction(async (client) => {
    if (source === 'server') {
      const claim = await client.query(
        `INSERT INTO server_idempotency_keys (actor_id, idempotency_key)
         VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [playerId, idempotencyKey]
      );
      if (!claim.rows.length) throw new ConflictError('Duplicate statistic request');
    }

    for (const update of updates) {
      const def = await client.query(
        `SELECT stat_key, aggregation FROM statistic_definitions WHERE stat_key = $1 AND is_active = true`,
        [update.statKey]
      );
      if (!def.rows.length) {
        throw new ValidationError(`Unknown statistic: ${update.statKey}`);
      }

      const existing = await client.query<{ value: string }>(
        `SELECT value FROM player_statistics WHERE player_id = $1 AND stat_key = $2`,
        [playerId, update.statKey]
      );

      let newValue: number;
      const aggregation = def.rows[0].aggregation;
      const oldValue = existing.rows[0] ? parseFloat(existing.rows[0].value) : 0;

      if (update.increment !== undefined) {
        newValue = oldValue + update.increment;
      } else if (update.value !== undefined) {
        if (aggregation === 'max') newValue = Math.max(oldValue, update.value);
        else if (aggregation === 'min') newValue = Math.min(oldValue || update.value, update.value);
        else if (aggregation === 'sum') newValue = oldValue + update.value;
        else newValue = update.value;
      } else {
        continue;
      }

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO player_statistics (player_id, stat_key, value) VALUES ($1, $2, $3)`,
          [playerId, update.statKey, newValue]
        );
      } else {
        await client.query(
          `UPDATE player_statistics SET value = $1, version = version + 1 WHERE player_id = $2 AND stat_key = $3`,
          [newValue, playerId, update.statKey]
        );
      }

      await client.query(
        `INSERT INTO player_statistic_history (player_id, stat_key, old_value, new_value, change_source) VALUES ($1, $2, $3, $4, $5)`,
        [playerId, update.statKey, oldValue, newValue, source]
      );

      results.push({ statKey: update.statKey, value: newValue });
    }
  });

  await trackEvent('statistics_updated', playerId, undefined, { updates: results });
  return results;
}

export async function resetPlayerStatistics(playerId: string, statKeys?: string[]): Promise<void> {
  if (statKeys?.length) {
    await query(`UPDATE player_statistics SET value = 0, version = version + 1 WHERE player_id = $1 AND stat_key = ANY($2)`, [playerId, statKeys]);
  } else {
    await query(`UPDATE player_statistics SET value = 0, version = version + 1 WHERE player_id = $1`, [playerId]);
  }
}
