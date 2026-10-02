import { query, queryOne, withTransaction } from '../lib/db';
import { ConflictError, NotFoundError, ForbiddenError } from '../lib/errors';

export async function sendFriendRequest(fromPlayerId: string, toPublicId: string): Promise<void> {
  const toPlayer = await queryOne<{ id: string }>(`SELECT id FROM players WHERE public_id = $1 AND deleted_at IS NULL`, [toPublicId]);
  if (!toPlayer) throw new NotFoundError('Player not found');
  if (toPlayer.id === fromPlayerId) throw new ConflictError('Cannot friend yourself');

  const blocked = await queryOne(
    `SELECT id FROM player_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [fromPlayerId, toPlayer.id]
  );
  if (blocked) throw new ForbiddenError('Cannot send friend request');

  const existing = await queryOne(
    `SELECT id FROM friendships WHERE (player_a_id = $1 AND player_b_id = $2) OR (player_a_id = $2 AND player_b_id = $1)`,
    [fromPlayerId, toPlayer.id]
  );
  if (existing) throw new ConflictError('Already friends');

  await query(
    `INSERT INTO friend_requests (from_player_id, to_player_id) VALUES ($1, $2)
     ON CONFLICT (from_player_id, to_player_id) DO UPDATE SET status = 'pending', updated_at = NOW()`,
    [fromPlayerId, toPlayer.id]
  );
}

export async function respondFriendRequest(playerId: string, fromPublicId: string, accept: boolean): Promise<void> {
  const fromPlayer = await queryOne<{ id: string }>(`SELECT id FROM players WHERE public_id = $1`, [fromPublicId]);
  if (!fromPlayer) throw new NotFoundError('Player not found');

  const request = await queryOne<{ id: string }>(
    `SELECT id FROM friend_requests WHERE from_player_id = $1 AND to_player_id = $2 AND status = 'pending'`,
    [fromPlayer.id, playerId]
  );
  if (!request) throw new NotFoundError('Friend request not found');

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE friend_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      [accept ? 'accepted' : 'rejected', request.id]
    );

    if (accept) {
      const [a, b] = fromPlayer.id < playerId ? [fromPlayer.id, playerId] : [playerId, fromPlayer.id];
      await client.query(
        `INSERT INTO friendships (player_a_id, player_b_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [a, b]
      );
    }
  });
}

export async function getFriends(playerId: string): Promise<Array<{ publicId: string; displayName: string; status: string; lastSeenAt?: string }>> {
  const rows = await query<{
    public_id: string;
    display_name: string;
    status: string;
    last_seen_at: Date | null;
  }>(
    `SELECT p.public_id, p.display_name, COALESCE(pp.status, 'offline') as status, pp.last_seen_at
     FROM friendships f
     JOIN players p ON (CASE WHEN f.player_a_id = $1 THEN f.player_b_id ELSE f.player_a_id END) = p.id
     LEFT JOIN player_presence pp ON p.id = pp.player_id
     WHERE f.player_a_id = $1 OR f.player_b_id = $1`,
    [playerId]
  );

  return rows.map(r => ({
    publicId: r.public_id,
    displayName: r.display_name,
    status: r.status,
    lastSeenAt: r.last_seen_at?.toISOString(),
  }));
}

export async function removeFriend(playerId: string, friendPublicId: string): Promise<void> {
  const friend = await queryOne<{ id: string }>(`SELECT id FROM players WHERE public_id = $1`, [friendPublicId]);
  if (!friend) throw new NotFoundError('Player not found');

  const [a, b] = playerId < friend.id ? [playerId, friend.id] : [friend.id, playerId];
  await query(`DELETE FROM friendships WHERE player_a_id = $1 AND player_b_id = $2`, [a, b]);
}

export async function blockPlayer(blockerId: string, blockedPublicId: string): Promise<void> {
  const blocked = await queryOne<{ id: string }>(`SELECT id FROM players WHERE public_id = $1`, [blockedPublicId]);
  if (!blocked) throw new NotFoundError('Player not found');

  await query(
    `INSERT INTO player_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [blockerId, blocked.id]
  );

  const [a, b] = blockerId < blocked.id ? [blockerId, blocked.id] : [blocked.id, blockerId];
  await query(`DELETE FROM friendships WHERE player_a_id = $1 AND player_b_id = $2`, [a, b]);
}

export async function unblockPlayer(blockerId: string, blockedPublicId: string): Promise<void> {
  const blocked = await queryOne<{ id: string }>(`SELECT id FROM players WHERE public_id = $1`, [blockedPublicId]);
  if (!blocked) throw new NotFoundError('Player not found');
  await query(`DELETE FROM player_blocks WHERE blocker_id = $1 AND blocked_id = $2`, [blockerId, blocked.id]);
}

export async function searchPlayers(queryStr: string, limit = 20): Promise<Array<{ publicId: string; displayName: string }>> {
  if (queryStr.length < 2) return [];
  const rows = await query<{ public_id: string; display_name: string }>(
    `SELECT public_id, display_name FROM players
     WHERE deleted_at IS NULL AND (display_name ILIKE $1 OR public_id ILIKE $1)
     LIMIT $2`,
    [`%${queryStr}%`, limit]
  );
  return rows.map(r => ({ publicId: r.public_id, displayName: r.display_name }));
}

export async function updatePresence(playerId: string, status: 'online' | 'away' | 'busy' | 'offline'): Promise<void> {
  await query(
    `INSERT INTO player_presence (player_id, status, last_seen_at) VALUES ($1, $2, NOW())
     ON CONFLICT (player_id) DO UPDATE SET status = $2, last_seen_at = NOW()`,
    [playerId, status]
  );
}
