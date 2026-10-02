import { query, queryOne, withTransaction } from '../lib/db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { generatePublicId, generateJoinCode } from '../lib/crypto';

export async function createLobby(
  ownerId: string,
  name: string,
  options?: { maxPlayers?: number; isPrivate?: boolean; metadata?: Record<string, unknown> }
): Promise<{ lobbyId: string; joinCode?: string }> {
  const lobbyId = generatePublicId();
  const joinCode = options?.isPrivate ? generateJoinCode() : null;
  const photonRoomName = `lobby_${lobbyId}`;

  const lobby = await queryOne(
    `INSERT INTO lobbies (lobby_id, name, owner_id, max_players, is_private, join_code, metadata, photon_room_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING lobby_id, join_code`,
    [lobbyId, name.slice(0, 64), ownerId, options?.maxPlayers ?? 8, options?.isPrivate ?? false, joinCode, JSON.stringify(options?.metadata ?? {}), photonRoomName]
  );

  await query(`INSERT INTO lobby_members (lobby_id, player_id) SELECT id, $2 FROM lobbies WHERE lobby_id = $1`, [lobbyId, ownerId]);

  return { lobbyId, joinCode: (lobby as { join_code: string | null }).join_code ?? undefined };
}

export async function joinLobby(playerId: string, lobbyIdOrCode: string): Promise<{ lobbyId: string; photonRoomName: string }> {
  let lobby = await queryOne<{ id: string; lobby_id: string; max_players: number; status: string; photon_room_name: string; is_private: boolean }>(
    `SELECT id, lobby_id, max_players, status, photon_room_name, is_private FROM lobbies WHERE lobby_id = $1 OR join_code = $1`,
    [lobbyIdOrCode]
  );
  if (!lobby) throw new NotFoundError('Lobby not found');
  if (lobby.status !== 'open') throw new ValidationError('Lobby is not open');

  const memberCount = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM lobby_members WHERE lobby_id = $1`, [lobby.id]);
  if (parseInt(memberCount?.count ?? '0', 10) >= lobby.max_players) {
    throw new ValidationError('Lobby is full');
  }

  await query(
    `INSERT INTO lobby_members (lobby_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [lobby.id, playerId]
  );

  return { lobbyId: lobby.lobby_id, photonRoomName: lobby.photon_room_name };
}

export async function leaveLobby(playerId: string, lobbyId: string): Promise<void> {
  const lobby = await queryOne<{ id: string; owner_id: string }>(`SELECT id, owner_id FROM lobbies WHERE lobby_id = $1`, [lobbyId]);
  if (!lobby) throw new NotFoundError('Lobby not found');

  await query(`DELETE FROM lobby_members WHERE lobby_id = $1 AND player_id = $2`, [lobby.id, playerId]);

  const remaining = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM lobby_members WHERE lobby_id = $1`, [lobby.id]);
  if (parseInt(remaining?.count ?? '0', 10) === 0) {
    await query(`UPDATE lobbies SET status = 'closed' WHERE id = $1`, [lobby.id]);
  } else if (lobby.owner_id === playerId) {
    const newOwner = await queryOne<{ player_id: string }>(
      `SELECT player_id FROM lobby_members WHERE lobby_id = $1 ORDER BY joined_at LIMIT 1`,
      [lobby.id]
    );
    if (newOwner) {
      await query(`UPDATE lobbies SET owner_id = $1 WHERE id = $2`, [newOwner.player_id, lobby.id]);
    }
  }
}

export async function getLobby(lobbyId: string): Promise<Record<string, unknown>> {
  const lobby = await queryOne(`SELECT * FROM lobbies WHERE lobby_id = $1`, [lobbyId]);
  if (!lobby) throw new NotFoundError('Lobby not found');

  const members = await query<{ public_id: string; display_name: string; is_ready: boolean }>(
    `SELECT p.public_id, p.display_name, lm.is_ready FROM lobby_members lm
     JOIN players p ON lm.player_id = p.id WHERE lm.lobby_id = $1`,
    [(lobby as { id: string }).id]
  );

  return { ...lobby, members };
}

export async function updateLobbyMetadata(ownerId: string, lobbyId: string, metadata: Record<string, unknown>): Promise<void> {
  const lobby = await queryOne<{ id: string; owner_id: string }>(`SELECT id, owner_id FROM lobbies WHERE lobby_id = $1`, [lobbyId]);
  if (!lobby) throw new NotFoundError('Lobby not found');
  if (lobby.owner_id !== ownerId) throw new ForbiddenError('Only owner can update lobby');

  await query(`UPDATE lobbies SET metadata = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(metadata), lobby.id]);
}

export async function inviteToLobby(inviterId: string, lobbyId: string, inviteePublicId: string): Promise<void> {
  const lobby = await queryOne<{ id: string }>(`SELECT id FROM lobbies WHERE lobby_id = $1`, [lobbyId]);
  if (!lobby) throw new NotFoundError('Lobby not found');

  const invitee = await queryOne<{ id: string }>(`SELECT id FROM players WHERE public_id = $1`, [inviteePublicId]);
  if (!invitee) throw new NotFoundError('Player not found');

  await query(
    `INSERT INTO lobby_invites (lobby_id, inviter_id, invitee_id) VALUES ($1, $2, $3)`,
    [lobby.id, inviterId, invitee.id]
  );
}

export async function listPublicLobbies(limit = 50): Promise<Array<Record<string, unknown>>> {
  return query(
    `SELECT l.lobby_id, l.name, l.max_players, l.metadata, l.created_at,
            (SELECT COUNT(*) FROM lobby_members lm WHERE lm.lobby_id = l.id) as player_count
     FROM lobbies l WHERE l.is_private = false AND l.status = 'open'
     ORDER BY l.created_at DESC LIMIT $1`,
    [limit]
  );
}
