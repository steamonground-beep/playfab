import { query, queryOne } from '../lib/db';
import { NotFoundError } from '../lib/errors';
import { logAudit } from './audit.service';

export async function banPlayer(
  playerId: string,
  reason: string,
  durationMinutes?: number,
  adminId?: string,
  adminNotes?: string
): Promise<void> {
  const expiresAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000) : null;

  await query(
    `UPDATE players SET is_banned = true, ban_reason = $1, ban_expires_at = $2 WHERE id = $3`,
    [reason, expiresAt, playerId]
  );

  await query(
    `INSERT INTO moderation_actions (player_id, action_type, reason, duration_minutes, expires_at, admin_id, admin_notes)
     VALUES ($1, 'ban', $2, $3, $4, $5, $6)`,
    [playerId, reason, durationMinutes, expiresAt, adminId, adminNotes]
  );

  await query(`UPDATE player_sessions SET revoked_at = NOW() WHERE player_id = $1 AND revoked_at IS NULL`, [playerId]);
  await logAudit('admin', adminId ?? null, 'moderation.ban', 'player', playerId, { reason, durationMinutes });
}

export async function unbanPlayer(playerId: string, adminId?: string, reason?: string): Promise<void> {
  await query(`UPDATE players SET is_banned = false, ban_reason = NULL, ban_expires_at = NULL WHERE id = $1`, [playerId]);
  await query(
    `INSERT INTO moderation_actions (player_id, action_type, reason, admin_id) VALUES ($1, 'unban', $2, $3)`,
    [playerId, reason ?? 'Unbanned', adminId]
  );
  await logAudit('admin', adminId ?? null, 'moderation.unban', 'player', playerId);
}

export async function warnPlayer(playerId: string, reason: string, adminId?: string): Promise<void> {
  await query(
    `INSERT INTO moderation_actions (player_id, action_type, reason, admin_id) VALUES ($1, 'warn', $2, $3)`,
    [playerId, reason, adminId]
  );
  await logAudit('admin', adminId ?? null, 'moderation.warn', 'player', playerId, { reason });
}

export async function getModerationHistory(playerId: string): Promise<Array<Record<string, unknown>>> {
  return query(
    `SELECT action_type, reason, duration_minutes, expires_at, appeal_status, admin_notes, created_at
     FROM moderation_actions WHERE player_id = $1 ORDER BY created_at DESC`,
    [playerId]
  );
}

export async function isPlayerBanned(playerId: string): Promise<{ banned: boolean; reason?: string; expiresAt?: string }> {
  const player = await queryOne<{ is_banned: boolean; ban_reason: string | null; ban_expires_at: Date | null }>(
    `SELECT is_banned, ban_reason, ban_expires_at FROM players WHERE id = $1`,
    [playerId]
  );
  if (!player) throw new NotFoundError('Player not found');

  if (player.is_banned && player.ban_expires_at && new Date(player.ban_expires_at) < new Date()) {
    await unbanPlayer(playerId);
    return { banned: false };
  }

  return {
    banned: player.is_banned,
    reason: player.ban_reason ?? undefined,
    expiresAt: player.ban_expires_at?.toISOString(),
  };
}

export async function updateAppealStatus(actionId: string, status: 'pending' | 'approved' | 'denied', adminId?: string): Promise<void> {
  await query(`UPDATE moderation_actions SET appeal_status = $1 WHERE id = $2`, [status, actionId]);
  await logAudit('admin', adminId ?? null, 'moderation.appeal_update', 'moderation_action', actionId, { status });
}
