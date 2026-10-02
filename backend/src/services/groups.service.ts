import { query, queryOne, withTransaction } from '../lib/db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { generatePublicId } from '../lib/crypto';

export async function createGroup(ownerId: string, name: string, description?: string, isPublic = true, maxMembers = 50): Promise<Record<string, unknown>> {
  const publicId = generatePublicId();
  const group = await queryOne(
    `INSERT INTO groups (public_id, name, description, owner_id, max_members, is_public)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [publicId, name.slice(0, 64), description, ownerId, maxMembers, isPublic]
  );

  await query(
    `INSERT INTO group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
    [(group as { id: string }).id, ownerId]
  );

  return group!;
}

export async function joinGroup(playerId: string, groupPublicId: string): Promise<void> {
  const group = await queryOne<{ id: string; is_public: boolean; max_members: number }>(
    `SELECT id, is_public, max_members FROM groups WHERE public_id = $1`,
    [groupPublicId]
  );
  if (!group) throw new NotFoundError('Group not found');
  if (!group.is_public) throw new ForbiddenError('Group is private');

  const memberCount = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM group_members WHERE group_id = $1`, [group.id]);
  if (parseInt(memberCount?.count ?? '0', 10) >= group.max_members) {
    throw new ValidationError('Group is full');
  }

  await query(
    `INSERT INTO group_members (group_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [group.id, playerId]
  );
}

export async function leaveGroup(playerId: string, groupPublicId: string): Promise<void> {
  const group = await queryOne<{ id: string; owner_id: string }>(`SELECT id, owner_id FROM groups WHERE public_id = $1`, [groupPublicId]);
  if (!group) throw new NotFoundError('Group not found');
  if (group.owner_id === playerId) throw new ValidationError('Owner cannot leave; transfer ownership first');

  await query(`DELETE FROM group_members WHERE group_id = $1 AND player_id = $2`, [group.id, playerId]);
}

export async function inviteToGroup(inviterId: string, groupPublicId: string, inviteePublicId: string): Promise<void> {
  const group = await queryOne<{ id: string }>(`SELECT id FROM groups WHERE public_id = $1`, [groupPublicId]);
  if (!group) throw new NotFoundError('Group not found');

  const member = await queryOne(`SELECT role FROM group_members WHERE group_id = $1 AND player_id = $2`, [group.id, inviterId]);
  if (!member || !['owner', 'admin'].includes((member as { role: string }).role)) {
    throw new ForbiddenError('Insufficient permissions');
  }

  const invitee = await queryOne<{ id: string }>(`SELECT id FROM players WHERE public_id = $1`, [inviteePublicId]);
  if (!invitee) throw new NotFoundError('Player not found');

  await query(
    `INSERT INTO group_invites (group_id, inviter_id, invitee_id) VALUES ($1, $2, $3)
     ON CONFLICT (group_id, invitee_id) DO UPDATE SET status = 'pending', created_at = NOW()`,
    [group.id, inviterId, invitee.id]
  );
}

export async function kickFromGroup(kickerId: string, groupPublicId: string, targetPublicId: string): Promise<void> {
  const group = await queryOne<{ id: string }>(`SELECT id FROM groups WHERE public_id = $1`, [groupPublicId]);
  if (!group) throw new NotFoundError('Group not found');

  const kicker = await queryOne<{ role: string }>(`SELECT role FROM group_members WHERE group_id = $1 AND player_id = $2`, [group.id, kickerId]);
  if (!kicker || !['owner', 'admin', 'moderator'].includes(kicker.role)) {
    throw new ForbiddenError('Insufficient permissions');
  }

  const target = await queryOne<{ id: string }>(`SELECT id FROM players WHERE public_id = $1`, [targetPublicId]);
  if (!target) throw new NotFoundError('Player not found');

  await query(`DELETE FROM group_members WHERE group_id = $1 AND player_id = $2 AND role != 'owner'`, [group.id, target.id]);
}

export async function getGroupMembers(groupPublicId: string): Promise<Array<{ publicId: string; displayName: string; role: string; joinedAt: string }>> {
  const group = await queryOne<{ id: string }>(`SELECT id FROM groups WHERE public_id = $1`, [groupPublicId]);
  if (!group) throw new NotFoundError('Group not found');

  const rows = await query<{ public_id: string; display_name: string; role: string; joined_at: Date }>(
    `SELECT p.public_id, p.display_name, gm.role, gm.joined_at
     FROM group_members gm JOIN players p ON gm.player_id = p.id
     WHERE gm.group_id = $1 ORDER BY gm.joined_at`,
    [group.id]
  );

  return rows.map(r => ({
    publicId: r.public_id,
    displayName: r.display_name,
    role: r.role,
    joinedAt: r.joined_at.toISOString(),
  }));
}

export async function getPlayerGroups(playerId: string): Promise<Array<Record<string, unknown>>> {
  return query(
    `SELECT g.public_id, g.name, g.description, gm.role FROM groups g
     JOIN group_members gm ON g.id = gm.group_id WHERE gm.player_id = $1`,
    [playerId]
  );
}
