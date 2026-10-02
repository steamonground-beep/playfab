import { query, queryOne, withTransaction } from '../lib/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import { generateTicketId, generatePublicId } from '../lib/crypto';
import { trackEvent } from './analytics.service';

export async function createMatchmakingTicket(
  playerId: string,
  queueName: string,
  options?: { skillRating?: number; region?: string; partyMembers?: string[] }
): Promise<{ ticketId: string; status: string; queueName: string }> {
  const queue = await queryOne<{ min_players: number; max_players: number; game_mode: string; region: string }>(
    `SELECT min_players, max_players, game_mode, region FROM matchmaking_queues WHERE queue_name = $1 AND is_active = true`,
    [queueName]
  );
  if (!queue) throw new NotFoundError('Queue not found');

  const ticketId = generateTicketId();
  await withTransaction(async (client) => {
    await client.query(`SELECT id FROM players WHERE id = $1 FOR UPDATE`, [playerId]);
    const existing = await client.query(
      `SELECT ticket_id FROM matchmaking_tickets WHERE player_id = $1 AND status = 'searching'`,
      [playerId]
    );
    if (existing.rows.length) throw new ValidationError('Already in matchmaking queue');

    // Skill and party membership must come from trusted server-side state.
    // Until party/rating validation exists, accept solo tickets at the queue region.
    await client.query(
      `INSERT INTO matchmaking_tickets (ticket_id, queue_name, player_id, party_members, skill_rating, region)
       VALUES ($1, $2, $3, '[]'::jsonb, 1000, $4)`,
      [ticketId, queueName, playerId, queue.region]
    );
  });

  await trackEvent('matchmaking_ticket_created', playerId, undefined, { ticketId, queueName });
  await tryFormMatch(queueName);

  return { ticketId, status: 'searching', queueName };
}

async function tryFormMatch(queueName: string): Promise<void> {
  const queue = await queryOne<{ min_players: number; max_players: number; game_mode: string; region: string }>(
    `SELECT min_players, max_players, game_mode, region FROM matchmaking_queues WHERE queue_name = $1`,
    [queueName]
  );
  if (!queue) return;

  let formedTickets: Array<{ id: string; ticket_id: string; player_id: string }> = [];
  let formedMatchId = '';
  await withTransaction(async (client) => {
    const ticketResult = await client.query<{ id: string; ticket_id: string; player_id: string }>(
      `SELECT id, ticket_id, player_id FROM matchmaking_tickets
       WHERE queue_name = $1 AND status = 'searching' AND expires_at > NOW()
       ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [queueName, queue.max_players]
    );
    if (ticketResult.rows.length < queue.min_players) return;

    const tickets = ticketResult.rows;
    const matchId = generatePublicId();
    const playerIds = tickets.map((t: { player_id: string }) => t.player_id);
    const photonRoomName = `match_${matchId}`;
    await client.query(
      `INSERT INTO matches (match_id, queue_name, game_mode, region, player_ids, photon_room_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ready')`,
      [matchId, queueName, queue.game_mode, queue.region, JSON.stringify(playerIds), photonRoomName]
    );

    const match = await client.query(`SELECT id FROM matches WHERE match_id = $1`, [matchId]);

    for (const ticket of tickets) {
      await client.query(
        `UPDATE matchmaking_tickets SET status = 'matched', match_id = $1 WHERE id = $2`,
        [match.rows[0].id, ticket.id]
      );
    }
    formedTickets = tickets;
    formedMatchId = matchId;
  });

  for (const ticket of formedTickets) {
    await trackEvent('match_formed', ticket.player_id, undefined, { matchId: formedMatchId, queueName });
  }
}

export async function cancelMatchmakingTicket(playerId: string, ticketId: string): Promise<void> {
  const result = await query(
    `UPDATE matchmaking_tickets SET status = 'cancelled'
     WHERE ticket_id = $1 AND player_id = $2 AND status = 'searching' RETURNING id`,
    [ticketId, playerId]
  );
  if (!result.length) throw new NotFoundError('Ticket not found or already matched');
  await trackEvent('matchmaking_cancelled', playerId, undefined, { ticketId });
}

export async function getMatchmakingTicket(playerId: string, ticketId: string): Promise<Record<string, unknown>> {
  const ticket = await queryOne(
    `SELECT mt.*, m.match_id as matched_match_id, m.photon_room_name, m.status as match_status
     FROM matchmaking_tickets mt
     LEFT JOIN matches m ON mt.match_id = m.id
     WHERE mt.ticket_id = $1 AND mt.player_id = $2`,
    [ticketId, playerId]
  );
  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function getActiveQueues(): Promise<Array<Record<string, unknown>>> {
  return query(`SELECT queue_name, game_mode, min_players, max_players, region FROM matchmaking_queues WHERE is_active = true`);
}

export async function getActiveMatches(): Promise<Array<Record<string, unknown>>> {
  return query(`SELECT * FROM matches WHERE status IN ('forming', 'ready', 'in_progress') ORDER BY created_at DESC LIMIT 100`);
}
