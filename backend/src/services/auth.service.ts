import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../lib/db';
import { generatePublicId, hashPassword, hashToken, verifyPassword, generateSecureToken } from '../lib/crypto';
import { signAccessToken, signRefreshToken, getRefreshExpiryDate } from '../lib/jwt';
import { AppError, ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../lib/errors';
import { logAudit } from './audit.service';
import { trackEvent } from './analytics.service';
import { v4 as uuidv4 } from 'uuid';

export interface PlayerRow {
  id: string;
  public_id: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  custom_id_secret_hash?: string | null;
  is_guest: boolean;
  custom_id: string | null;
  is_active: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  ban_expires_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  last_login_at: Date | null;
  recovery_email?: string | null;
  recovery_email_verified?: boolean;
  recovery_token_hash?: string | null;
  recovery_token_expires_at?: Date | null;
}

export interface AuthResult {
  player: {
    publicId: string;
    displayName: string;
    isGuest: boolean;
    customId?: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

async function checkBanStatus(player: PlayerRow): Promise<void> {
  if (!player.is_banned) return;
  if (player.ban_expires_at && new Date(player.ban_expires_at) < new Date()) {
    await query(`UPDATE players SET is_banned = false, ban_reason = NULL, ban_expires_at = NULL WHERE id = $1`, [player.id]);
    return;
  }
  throw new AppError(403, 'ACCOUNT_BANNED', player.ban_reason ?? 'Account is banned');
}

async function checkLockout(player: PlayerRow): Promise<void> {
  if (player.locked_until && new Date(player.locked_until) > new Date()) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Account temporarily locked due to failed login attempts');
  }
}

async function createSession(
  client: PoolClient,
  playerId: string,
  refreshToken: string,
  jti: string,
  ipAddress?: string,
  userAgent?: string,
  requestedSessionId?: string
): Promise<string> {
  const sessionId = requestedSessionId ?? uuidv4();
  const refreshHash = hashToken(refreshToken);
  const expiresAt = getRefreshExpiryDate();

  await client.query(
    `INSERT INTO player_sessions (id, player_id, refresh_token_hash, access_token_jti, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, playerId, refreshHash, jti, ipAddress, userAgent, expiresAt]
  );
  return sessionId;
}

async function grantInitialCurrency(client: PoolClient, playerId: string): Promise<void> {
  const currencies = await client.query(`SELECT currency_code, initial_balance FROM currency_definitions WHERE is_active = true`);
  for (const c of currencies.rows) {
    const inserted = await client.query<{ balance: string }>(
      `INSERT INTO player_currency (player_id, currency_code, balance) VALUES ($1, $2, $3)
       ON CONFLICT (player_id, currency_code) DO NOTHING RETURNING balance`,
      [playerId, c.currency_code, c.initial_balance]
    );
    if (inserted.rows.length && Number(c.initial_balance) !== 0) {
      await client.query(
        `INSERT INTO currency_transactions (player_id, currency_code, amount, balance_after, transaction_type, metadata)
         VALUES ($1, $2, $3, $4, 'initial_grant', '{}'::jsonb)`,
        [playerId, c.currency_code, c.initial_balance, inserted.rows[0].balance]
      );
    }
  }
}

export async function loginRayvoCustomIDNoPCVR(
  customId: string,
  customSecret: string,
  displayName?: string,
  createAccount = true,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResult> {
  if (!customId || customId.length < 3 || customId.length > 128) {
    throw new ValidationError('Custom ID must be between 3 and 128 characters');
  }

  if (!/^[a-zA-Z0-9_\-.]+$/.test(customId)) {
    throw new ValidationError('Custom ID contains invalid characters');
  }

  if (customSecret.length < 32 || customSecret.length > 256) {
    throw new ValidationError('Custom ID credential must be between 32 and 256 characters');
  }

  return withTransaction(async (client) => {
    let player = await client.query<PlayerRow>(
      `SELECT * FROM players WHERE custom_id = $1 AND deleted_at IS NULL AND is_active = true`,
      [customId]
    ).then(r => r.rows[0]);

    if (!player) {
      if (!createAccount) {
        throw new NotFoundError('Player not found');
      }

      const publicId = generatePublicId();
      const name = displayName?.slice(0, 64) ?? `Player_${publicId}`;
      const customIdSecretHash = await hashPassword(customSecret);

      const result = await client.query<PlayerRow>(
        `INSERT INTO players (public_id, display_name, custom_id, custom_id_secret_hash, is_guest)
         VALUES ($1, $2, $3, $4, false) RETURNING *`,
        [publicId, name, customId, customIdSecretHash]
      );
      player = result.rows[0];
      await grantInitialCurrency(client, player.id);
      await logAudit('system', null, 'player.created', 'player', player.public_id, { customId }, ipAddress);
    } else {
      await checkLockout(player);
      if (!player.custom_id_secret_hash || !(await verifyPassword(customSecret, player.custom_id_secret_hash))) {
        await query(
          `UPDATE players SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE WHEN failed_login_attempts + 1 >= $1
             THEN NOW() + ($2 * INTERVAL '1 minute') ELSE locked_until END
           WHERE id = $3`,
          [MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES, player.id]
        );
        throw new UnauthorizedError('Invalid credentials');
      }
    }

    await checkBanStatus(player);
    await checkLockout(player);

    const { token: accessToken, jti } = signAccessToken(player.id, player.public_id);
    const sessionId = uuidv4();
    const refreshToken = signRefreshToken(player.id, sessionId);
    await createSession(client, player.id, refreshToken, jti, ipAddress, userAgent);

    await client.query(
      `UPDATE players SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [player.id]
    );

    await trackEvent('login', player.id, sessionId, { method: 'LoginRayvoCustomIDNoPCVR' }, ipAddress);
    await logAudit('player', player.id, 'auth.login', 'player', player.public_id, { method: 'LoginRayvoCustomIDNoPCVR' }, ipAddress);

    return {
      player: {
        publicId: player.public_id,
        displayName: player.display_name,
        isGuest: player.is_guest,
        customId: player.custom_id ?? undefined,
      },
      accessToken,
      refreshToken,
      expiresIn: '15m',
    };
  });
}

export async function registerGuest(
  displayName?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResult> {
  return withTransaction(async (client) => {
    const publicId = generatePublicId();
    const name = displayName?.slice(0, 64) ?? `Guest_${publicId}`;

    const result = await client.query<PlayerRow>(
      `INSERT INTO players (public_id, display_name, is_guest) VALUES ($1, $2, true) RETURNING *`,
      [publicId, name]
    );
    const player = result.rows[0];
    await grantInitialCurrency(client, player.id);

    const { token: accessToken, jti } = signAccessToken(player.id, player.public_id);
    const sessionId = uuidv4();
    const refreshToken = signRefreshToken(player.id, sessionId);
    await createSession(client, player.id, refreshToken, jti, ipAddress, userAgent);

    await trackEvent('login', player.id, sessionId, { method: 'guest' }, ipAddress);

    return {
      player: {
        publicId: player.public_id,
        displayName: player.display_name,
        isGuest: true,
      },
      accessToken,
      refreshToken,
      expiresIn: '15m',
    };
  });
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResult> {
  if (password.length < 8) throw new ValidationError('Password must be at least 8 characters');

  const existing = await queryOne(`SELECT id FROM players WHERE email = $1`, [email.toLowerCase()]);
  if (existing) throw new ConflictError('Email already registered');

  return withTransaction(async (client) => {
    const publicId = generatePublicId();
    const passwordHash = await hashPassword(password);

    const result = await client.query<PlayerRow>(
      `INSERT INTO players (public_id, display_name, email, password_hash, is_guest)
       VALUES ($1, $2, $3, $4, false) RETURNING *`,
      [publicId, displayName.slice(0, 64), email.toLowerCase(), passwordHash]
    );
    const player = result.rows[0];
    await grantInitialCurrency(client, player.id);

    const { token: accessToken, jti } = signAccessToken(player.id, player.public_id);
    const sessionId = uuidv4();
    const refreshToken = signRefreshToken(player.id, sessionId);
    await createSession(client, player.id, refreshToken, jti, ipAddress, userAgent);

    await trackEvent('login', player.id, sessionId, { method: 'email_register' }, ipAddress);

    return {
      player: {
        publicId: player.public_id,
        displayName: player.display_name,
        isGuest: false,
      },
      accessToken,
      refreshToken,
      expiresIn: '15m',
    };
  });
}

export async function loginWithEmail(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResult> {
  const player = await queryOne<PlayerRow>(
    `SELECT * FROM players WHERE email = $1 AND deleted_at IS NULL AND is_active = true`,
    [email.toLowerCase()]
  );
  if (!player || !player.password_hash) throw new UnauthorizedError('Invalid credentials');

  await checkBanStatus(player);
  await checkLockout(player);

  const valid = await verifyPassword(password, player.password_hash);
  if (!valid) {
    const attempts = player.failed_login_attempts + 1;
    const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : null;
    await query(
      `UPDATE players SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
      [attempts, lockedUntil, player.id]
    );
    throw new UnauthorizedError('Invalid credentials');
  }

  const { token: accessToken, jti } = signAccessToken(player.id, player.public_id);
  const sessionId = uuidv4();
  const refreshToken = signRefreshToken(player.id, sessionId);

  await withTransaction(async (client) => {
    await createSession(client, player.id, refreshToken, jti, ipAddress, userAgent);
    await client.query(`UPDATE players SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1`, [player.id]);
  });
  await trackEvent('login', player.id, sessionId, { method: 'email' }, ipAddress);

  return {
    player: {
      publicId: player.public_id,
      displayName: player.display_name,
      isGuest: player.is_guest,
    },
    accessToken,
    refreshToken,
    expiresIn: '15m',
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: { sub: string; sessionId: string };
  try {
    payload = (await import('../lib/jwt')).verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const refreshHash = hashToken(refreshToken);

  return withTransaction(async (client) => {
    const sessionResult = await client.query<{
      id: string;
      player_id: string;
      revoked_at: Date | null;
      expires_at: Date;
    }>(
      `SELECT id, player_id, revoked_at, expires_at FROM player_sessions
       WHERE id = $1 AND player_id = $2 AND refresh_token_hash = $3
         AND revoked_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [payload.sessionId, payload.sub, refreshHash]
    );
    const session = sessionResult.rows[0];
    if (!session) throw new UnauthorizedError('Session expired or revoked');

    const playerResult = await client.query<PlayerRow>(
      `SELECT * FROM players WHERE id = $1 AND deleted_at IS NULL AND is_active = true`,
      [session.player_id]
    );
    const player = playerResult.rows[0];
    if (!player) throw new UnauthorizedError('Player not found');
    await checkBanStatus(player);

    const { token: accessToken, jti } = signAccessToken(player.id, player.public_id);
    const nextSessionId = uuidv4();
    const nextRefreshToken = signRefreshToken(player.id, nextSessionId);
    await client.query(`UPDATE player_sessions SET revoked_at = NOW() WHERE id = $1`, [session.id]);
    await createSession(client, player.id, nextRefreshToken, jti, undefined, undefined, nextSessionId);

    return { accessToken, refreshToken: nextRefreshToken };
  });
}

export async function logout(playerId: string, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    const refreshHash = hashToken(refreshToken);
    await query(`UPDATE player_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1 AND player_id = $2`, [refreshHash, playerId]);
  } else {
    await query(`UPDATE player_sessions SET revoked_at = NOW() WHERE player_id = $1 AND revoked_at IS NULL`, [playerId]);
  }
  await trackEvent('logout', playerId);
  await logAudit('player', playerId, 'auth.logout');
}

export async function getPlayerById(playerId: string): Promise<PlayerRow | null> {
  return queryOne<PlayerRow>(`SELECT * FROM players WHERE id = $1 AND deleted_at IS NULL AND is_active = true`, [playerId]);
}

export async function getPlayerByPublicId(publicId: string): Promise<PlayerRow | null> {
  return queryOne<PlayerRow>(`SELECT * FROM players WHERE public_id = $1 AND deleted_at IS NULL`, [publicId]);
}

export async function deleteAccount(playerId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`UPDATE players SET deleted_at = NOW(), is_active = false, email = NULL, custom_id = NULL WHERE id = $1`, [playerId]);
    await client.query(`UPDATE player_sessions SET revoked_at = NOW() WHERE player_id = $1`, [playerId]);
  });
  await logAudit('player', playerId, 'account.deleted');
}

export async function exportAccountData(playerId: string): Promise<Record<string, unknown>> {
  const player = await getPlayerById(playerId);
  if (!player) throw new NotFoundError('Player not found');

  const [data, stats, inventory, currency, achievements] = await Promise.all([
    query(`SELECT data_key, data_value, visibility FROM player_data WHERE player_id = $1`, [playerId]),
    query(`SELECT stat_key, value FROM player_statistics WHERE player_id = $1`, [playerId]),
    query(`SELECT item_id, quantity, metadata FROM player_inventory WHERE player_id = $1`, [playerId]),
    query(`SELECT currency_code, balance FROM player_currency WHERE player_id = $1`, [playerId]),
    query(`SELECT achievement_id, progress, unlocked_at FROM player_achievements WHERE player_id = $1`, [playerId]),
  ]);

  return {
    profile: {
      publicId: player.public_id,
      displayName: player.display_name,
      isGuest: player.is_guest,
      createdAt: player.created_at,
    },
    playerData: data,
    statistics: stats,
    inventory,
    currency,
    achievements,
    exportedAt: new Date().toISOString(),
  };
}

export async function requestAccountRecovery(email: string): Promise<{ message: string }> {
  const player = await queryOne<{ id: string }>(`SELECT id FROM players WHERE email = $1 AND deleted_at IS NULL`, [email.toLowerCase()]);
  if (!player) return { message: 'If the email exists, a recovery link will be sent' };

  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  await query(
    `INSERT INTO account_recovery_tokens (player_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [player.id, tokenHash]
  );

  // In production, send email. For self-hosted, return token in dev mode only.
  return { message: 'If the email exists, a recovery link will be sent' };
}

export async function requestCustomIdRecovery(customId: string, email: string): Promise<{ message: string; token?: string; developmentOnly?: boolean }> {
  const player = await queryOne<PlayerRow>(
    `SELECT * FROM players WHERE custom_id = $1 AND deleted_at IS NULL AND is_active = true`,
    [customId]
  );
  
  if (!player) return { message: 'If the custom ID exists, a recovery email will be sent' };
  if (player.custom_id_secret_hash) {
    return { message: 'This account already has a secret set. Use the normal login flow.' };
  }

  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query(
    `UPDATE players 
     SET recovery_email = $2, recovery_token_hash = $3, recovery_token_expires_at = $4
     WHERE id = $1`,
    [player.id, email.toLowerCase(), tokenHash, expiresAt]
  );

  // In production, send email with token. For self-hosted development, return token.
  if (process.env.NODE_ENV === 'development') {
    return { message: 'Recovery initiated', token, developmentOnly: true };
  }
  
  return { message: 'If the custom ID exists, a recovery email will be sent' };
}

export async function completeCustomIdRecovery(
  customId: string,
  token: string,
  newSecret: string,
  ipAddress?: string
): Promise<AuthResult> {
  if (newSecret.length < 32 || newSecret.length > 256) {
    throw new ValidationError('Custom ID credential must be between 32 and 256 characters');
  }

  const player = await queryOne<PlayerRow>(
    `SELECT * FROM players 
     WHERE custom_id = $1 AND deleted_at IS NULL AND is_active = true`,
    [customId]
  );

  if (!player) throw new NotFoundError('Player not found');
  if (player.custom_id_secret_hash) {
    throw new ValidationError('This account already has a secret set. Use the normal login flow.');
  }

  const tokenHash = hashToken(token);
  if (!player.recovery_token_hash || player.recovery_token_hash !== tokenHash) {
    throw new UnauthorizedError('Invalid or expired recovery token');
  }

  if (!player.recovery_token_expires_at || new Date(player.recovery_token_expires_at) < new Date()) {
    throw new UnauthorizedError('Recovery token has expired');
  }

  return withTransaction(async (client) => {
    const customIdSecretHash = await hashPassword(newSecret);
    
    await client.query(
      `UPDATE players 
       SET custom_id_secret_hash = $2, 
           recovery_email = NULL, 
           recovery_token_hash = NULL, 
           recovery_token_expires_at = NULL,
           recovery_email_verified = true
       WHERE id = $1`,
      [player.id, customIdSecretHash]
    );

    const { token: accessToken, jti } = signAccessToken(player.id, player.public_id);
    const sessionId = uuidv4();
    const refreshToken = signRefreshToken(player.id, sessionId);
    await createSession(client, player.id, refreshToken, jti, ipAddress, undefined);

    await client.query(
      `UPDATE players SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [player.id]
    );

    await trackEvent('login', player.id, sessionId, { method: 'custom_id_recovery' }, ipAddress);
    await logAudit('player', player.id, 'auth.recovery_completed', 'player', player.public_id, { customId }, ipAddress);

    return {
      player: {
        publicId: player.public_id,
        displayName: player.display_name,
        isGuest: player.is_guest,
        customId: player.custom_id ?? undefined,
      },
      accessToken,
      refreshToken,
      expiresIn: '15m',
    };
  });
}
