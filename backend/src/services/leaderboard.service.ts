import { query, queryOne, withTransaction } from '../lib/db';
import { NotFoundError } from '../lib/errors';

export async function getLeaderboard(
  leaderboardId: string,
  limit = 100,
  offset = 0,
  seasonId?: string
): Promise<{ entries: Array<{ rank: number; publicId: string; displayName: string; score: number }>; total: number }> {
  const def = await queryOne(`SELECT * FROM leaderboard_definitions WHERE leaderboard_id = $1 AND is_active = true`, [leaderboardId]);
  if (!def) throw new NotFoundError('Leaderboard not found');

  const season = seasonId ?? (def as { season_id: string | null }).season_id;

  const entries = await query<{
    rank: number;
    public_id: string;
    display_name: string;
    score: string;
  }>(
    `SELECT ROW_NUMBER() OVER (ORDER BY le.score ${(def as { sort_order: string }).sort_order === 'asc' ? 'ASC' : 'DESC'}) as rank,
            p.public_id, p.display_name, le.score
     FROM leaderboard_entries le
     JOIN players p ON le.player_id = p.id
     WHERE le.leaderboard_id = $1 AND ($2::varchar IS NULL OR le.season_id = $2)
     ORDER BY le.score ${(def as { sort_order: string }).sort_order === 'asc' ? 'ASC' : 'DESC'}
     LIMIT $3 OFFSET $4`,
    [leaderboardId, season, limit, offset]
  );

  const totalResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM leaderboard_entries WHERE leaderboard_id = $1 AND ($2::varchar IS NULL OR season_id = $2)`,
    [leaderboardId, season]
  );

  return {
    entries: entries.map(e => ({
      rank: e.rank,
      publicId: e.public_id,
      displayName: e.display_name,
      score: parseFloat(e.score),
    })),
    total: parseInt(totalResult?.count ?? '0', 10),
  };
}

export async function getPlayerLeaderboardPosition(
  playerId: string,
  leaderboardId: string,
  seasonId?: string
): Promise<{ rank: number | null; score: number | null }> {
  const def = await queryOne(`SELECT sort_order, season_id FROM leaderboard_definitions WHERE leaderboard_id = $1`, [leaderboardId]);
  if (!def) throw new NotFoundError('Leaderboard not found');

  const season = seasonId ?? (def as { season_id: string | null }).season_id;
  const sortOrder = (def as { sort_order: string }).sort_order;

  const entry = await queryOne<{ score: string }>(
    `SELECT score FROM leaderboard_entries WHERE leaderboard_id = $1 AND player_id = $2 AND ($3::varchar IS NULL OR season_id = $3)`,
    [leaderboardId, playerId, season]
  );

  if (!entry) return { rank: null, score: null };

  const rankResult = await queryOne<{ rank: string }>(
    `SELECT COUNT(*) + 1 as rank FROM leaderboard_entries
     WHERE leaderboard_id = $1 AND ($2::varchar IS NULL OR season_id = $2)
     AND score ${sortOrder === 'asc' ? '<' : '>'} $3`,
    [leaderboardId, season, entry.score]
  );

  return { rank: parseInt(rankResult?.rank ?? '1', 10), score: parseFloat(entry.score) };
}

export async function updateLeaderboardScore(
  playerId: string,
  leaderboardId: string,
  score: number,
  seasonId?: string
): Promise<void> {
  const def = await queryOne(`SELECT stat_key, season_id FROM leaderboard_definitions WHERE leaderboard_id = $1 AND is_active = true`, [leaderboardId]);
  if (!def) throw new NotFoundError('Leaderboard not found');

  const season = seasonId ?? (def as { season_id: string | null }).season_id;

  await query(
    `INSERT INTO leaderboard_entries (leaderboard_id, player_id, score, season_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (leaderboard_id, player_id, season_id)
     DO UPDATE SET score = GREATEST(leaderboard_entries.score, EXCLUDED.score), updated_at = NOW()`,
    [leaderboardId, playerId, score, season]
  );
}

export async function resetLeaderboard(leaderboardId: string, seasonId?: string): Promise<number> {
  const result = await query(
    `DELETE FROM leaderboard_entries WHERE leaderboard_id = $1 AND ($2::varchar IS NULL OR season_id = $2) RETURNING id`,
    [leaderboardId, seasonId]
  );
  return result.length;
}

export async function syncLeaderboardFromStats(leaderboardId: string): Promise<void> {
  const def = await queryOne<{ stat_key: string; season_id: string | null }>(
    `SELECT stat_key, season_id FROM leaderboard_definitions WHERE leaderboard_id = $1`,
    [leaderboardId]
  );
  if (!def) throw new NotFoundError('Leaderboard not found');

  await query(
    `INSERT INTO leaderboard_entries (leaderboard_id, player_id, score, season_id)
     SELECT $1, ps.player_id, ps.value, $2
     FROM player_statistics ps WHERE ps.stat_key = $3
     ON CONFLICT (leaderboard_id, player_id, season_id)
     DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()`,
    [leaderboardId, def.season_id, def.stat_key]
  );
}
