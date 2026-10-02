import { query, queryOne } from '../lib/db';
import { hashPassword, verifyPassword, hashToken, generateSecureToken } from '../lib/crypto';
import { signAdminToken } from '../lib/jwt';
import { UnauthorizedError, NotFoundError, ValidationError } from '../lib/errors';
import { authenticator } from 'otplib';
import { logAudit } from './audit.service';

export async function adminLogin(
  username: string,
  password: string,
  totpCode?: string,
  ipAddress?: string
): Promise<{ token: string; requires2FA?: boolean }> {
  const admin = await queryOne<{
    id: string;
    username: string;
    password_hash: string;
    role: string;
    totp_enabled: boolean;
    totp_secret: string | null;
    is_active: boolean;
  }>(`SELECT * FROM admin_users WHERE username = $1`, [username]);

  if (!admin || !admin.is_active) throw new UnauthorizedError('Invalid credentials');

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  if (admin.totp_enabled) {
    if (!totpCode) return { token: '', requires2FA: true };
    if (!admin.totp_secret || !authenticator.verify({ token: totpCode, secret: admin.totp_secret })) {
      throw new UnauthorizedError('Invalid 2FA code');
    }
  }

  const token = signAdminToken(admin.id, admin.username, admin.role);
  await query(`UPDATE admin_users SET last_login_at = NOW() WHERE id = $1`, [admin.id]);
  await logAudit('admin', admin.id, 'admin.login', 'admin', admin.id, {}, ipAddress);

  return { token };
}

export async function searchPlayers(search: string, limit = 50, offset = 0): Promise<Array<Record<string, unknown>>> {
  return query(
    `SELECT public_id, display_name, email, is_guest, custom_id, is_banned, created_at, last_login_at
     FROM players WHERE deleted_at IS NULL
     AND (display_name ILIKE $1 OR public_id ILIKE $1 OR email ILIKE $1 OR custom_id ILIKE $1)
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [`%${search}%`, limit, offset]
  );
}

export async function getPlayerDetails(publicId: string): Promise<Record<string, unknown>> {
  const player = await queryOne(
    `SELECT id, public_id, display_name, email, is_guest, custom_id, is_banned, ban_reason, created_at, last_login_at
     FROM players WHERE public_id = $1 AND deleted_at IS NULL`,
    [publicId]
  );
  if (!player) throw new NotFoundError('Player not found');

  const playerId = (player as { id: string }).id;
  const [inventory, currency, stats, achievements, sessions, moderation] = await Promise.all([
    query(`SELECT item_id, quantity, instance_id FROM player_inventory WHERE player_id = $1`, [playerId]),
    query(`SELECT currency_code, balance FROM player_currency WHERE player_id = $1`, [playerId]),
    query(`SELECT stat_key, value FROM player_statistics WHERE player_id = $1`, [playerId]),
    query(`SELECT achievement_id, progress, unlocked_at FROM player_achievements WHERE player_id = $1`, [playerId]),
    query(`SELECT created_at, expires_at, revoked_at, ip_address FROM player_sessions WHERE player_id = $1 ORDER BY created_at DESC LIMIT 10`, [playerId]),
    query(`SELECT action_type, reason, created_at FROM moderation_actions WHERE player_id = $1 ORDER BY created_at DESC`, [playerId]),
  ]);

  const { id, ...safePlayer } = player as Record<string, unknown>;
  return { ...safePlayer, inventory, currency, statistics: stats, achievements, sessions, moderation };
}

export async function createApiKey(name: string, permissions: string[], adminId: string, expiresAt?: Date): Promise<{ key: string; prefix: string }> {
  const rawKey = `rv_${generateSecureToken(24)}`;
  const keyHash = hashToken(rawKey);
  const prefix = rawKey.slice(0, 12);

  await query(
    `INSERT INTO api_keys (key_hash, key_prefix, name, permissions, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [keyHash, prefix, name, JSON.stringify(permissions), adminId, expiresAt]
  );

  await logAudit('admin', adminId, 'api_key.created', 'api_key', prefix, { name });
  return { key: rawKey, prefix };
}

export async function getAuditLogs(limit = 100, offset = 0): Promise<Array<Record<string, unknown>>> {
  return query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
}

export async function setupAdmin2FA(adminId: string): Promise<{ secret: string; qrUri: string }> {
  const secret = authenticator.generateSecret();
  const admin = await queryOne<{ username: string }>(`SELECT username FROM admin_users WHERE id = $1`, [adminId]);
  if (!admin) throw new NotFoundError('Admin not found');

  await query(`UPDATE admin_users SET totp_secret = $1 WHERE id = $2`, [secret, adminId]);

  const qrUri = authenticator.keyuri(admin.username, 'RayvoAdmin', secret);
  return { secret, qrUri };
}

export async function enableAdmin2FA(adminId: string, totpCode: string): Promise<void> {
  const admin = await queryOne<{ totp_secret: string }>(`SELECT totp_secret FROM admin_users WHERE id = $1`, [adminId]);
  if (!admin?.totp_secret) throw new ValidationError('2FA not set up');

  if (!authenticator.verify({ token: totpCode, secret: admin.totp_secret })) {
    throw new UnauthorizedError('Invalid 2FA code');
  }

  await query(`UPDATE admin_users SET totp_enabled = true WHERE id = $1`, [adminId]);
}
