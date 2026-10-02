import { query, queryOne, withTransaction } from '../lib/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';

const MAX_KEY_LENGTH = 128;
const MAX_DATA_SIZE = 65536; // 64KB per key
const MAX_KEYS = 200;

export interface PlayerDataEntry {
  key: string;
  value: unknown;
  visibility: 'private' | 'public' | 'readonly';
  version: number;
  updatedAt: string;
}

export async function getPlayerData(
  playerId: string,
  keys?: string[],
  requesterId?: string
): Promise<PlayerDataEntry[]> {
  let sql = `SELECT data_key, data_value, visibility, version, updated_at FROM player_data WHERE player_id = $1`;
  const params: unknown[] = [playerId];

  if (keys?.length) {
    sql += ` AND data_key = ANY($2)`;
    params.push(keys);
  }

  const rows = await query<{
    data_key: string;
    data_value: unknown;
    visibility: string;
    version: number;
    updated_at: Date;
  }>(sql, params);

  const isOwner = requesterId === playerId;

  return rows
    .filter(r => isOwner || r.visibility === 'public')
    .map(r => ({
      key: r.data_key,
      value: r.data_value,
      visibility: r.visibility as PlayerDataEntry['visibility'],
      version: r.version,
      updatedAt: r.updated_at.toISOString(),
    }));
}

export async function updatePlayerData(
  playerId: string,
  updates: Record<string, { value: unknown; visibility?: 'private' | 'public' | 'readonly' }>,
  expectedVersions?: Record<string, number>
): Promise<{ updated: string[]; errors: Record<string, string> }> {
  const updated: string[] = [];
  const errors: Record<string, string> = {};

  await withTransaction(async (client) => {
    await client.query(`SELECT id FROM players WHERE id = $1 FOR UPDATE`, [playerId]);
    const existingKeys = await client.query<{ data_key: string }>(
      `SELECT data_key FROM player_data WHERE player_id = $1`,
      [playerId]
    );
    const knownKeys = new Set(existingKeys.rows.map(row => row.data_key));
    const newKeys = Object.keys(updates).filter(key => !knownKeys.has(key));
    if (knownKeys.size + newKeys.length > MAX_KEYS) {
      throw new ValidationError(`Maximum ${MAX_KEYS} data keys allowed`);
    }

    for (const [key, data] of Object.entries(updates)) {
      if (key.length > MAX_KEY_LENGTH) {
        errors[key] = 'Key too long';
        continue;
      }

      const valueStr = JSON.stringify(data.value);
      if (valueStr === undefined || Buffer.from(valueStr).byteLength > MAX_DATA_SIZE) {
        errors[key] = 'Data too large';
        continue;
      }

      const existing = await client.query(
        `SELECT version, visibility FROM player_data WHERE player_id = $1 AND data_key = $2 FOR UPDATE`,
        [playerId, key]
      );

      if (existing.rows[0]?.visibility === 'readonly') {
        errors[key] = 'Key is read-only';
        continue;
      }

      if (expectedVersions?.[key] !== undefined && existing.rows[0]?.version !== expectedVersions[key]) {
        errors[key] = 'Version conflict';
        continue;
      }

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO player_data (player_id, data_key, data_value, visibility) VALUES ($1, $2, $3, $4)`,
          [playerId, key, JSON.stringify(data.value), data.visibility ?? 'private']
        );
      } else {
        await client.query(
          `UPDATE player_data SET data_value = $1, visibility = COALESCE($2, visibility), version = version + 1
           WHERE player_id = $3 AND data_key = $4`,
          [JSON.stringify(data.value), data.visibility, playerId, key]
        );
      }
      updated.push(key);
    }
  });

  return { updated, errors };
}

export async function deletePlayerData(playerId: string, keys: string[]): Promise<string[]> {
  const deleted: string[] = [];

  for (const key of keys) {
    const existing = await queryOne<{ visibility: string }>(
      `SELECT visibility FROM player_data WHERE player_id = $1 AND data_key = $2`,
      [playerId, key]
    );
    if (existing?.visibility === 'readonly') continue;

    const result = await query(
      `DELETE FROM player_data WHERE player_id = $1 AND data_key = $2 AND visibility != 'readonly' RETURNING data_key`,
      [playerId, key]
    );
    if (result.length) deleted.push(key);
  }

  return deleted;
}

export async function getPlayerProfile(playerId: string): Promise<Record<string, unknown>> {
  const player = await queryOne(
    `SELECT public_id, display_name, avatar_url, bio, is_guest, created_at, last_login_at FROM players WHERE id = $1 AND deleted_at IS NULL`,
    [playerId]
  );
  if (!player) throw new NotFoundError('Player not found');
  return player;
}

export async function updatePlayerProfile(
  playerId: string,
  updates: { displayName?: string; avatarUrl?: string; bio?: string }
): Promise<Record<string, unknown>> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (updates.displayName) {
    sets.push(`display_name = $${i++}`);
    params.push(updates.displayName.slice(0, 64));
  }
  if (updates.avatarUrl !== undefined) {
    sets.push(`avatar_url = $${i++}`);
    params.push(updates.avatarUrl);
  }
  if (updates.bio !== undefined) {
    sets.push(`bio = $${i++}`);
    params.push(updates.bio?.slice(0, 500));
  }

  if (!sets.length) throw new ValidationError('No updates provided');

  params.push(playerId);
  await query(`UPDATE players SET ${sets.join(', ')} WHERE id = $${i}`, params);
  return getPlayerProfile(playerId);
}
