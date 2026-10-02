import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

export interface AccessTokenPayload {
  sub: string;
  publicId: string;
  jti: string;
  type: 'access';
}

export interface AdminTokenPayload {
  sub: string;
  username: string;
  role: string;
  jti: string;
  type: 'admin';
}

export function signAccessToken(playerId: string, publicId: string): { token: string; jti: string } {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: playerId, publicId, jti, type: 'access' } satisfies AccessTokenPayload,
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'] }
  );
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
  if (payload.type !== 'access') throw new Error('Invalid token type');
  return payload;
}

export function signRefreshToken(playerId: string, sessionId: string): string {
  return jwt.sign(
    { sub: playerId, sessionId, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] }
  );
}

export function verifyRefreshToken(token: string): { sub: string; sessionId: string } {
  const payload = jwt.verify(token, config.jwt.refreshSecret) as { sub: string; sessionId: string; type: string };
  if (payload.type !== 'refresh') throw new Error('Invalid token type');
  return { sub: payload.sub, sessionId: payload.sessionId };
}

export function signAdminToken(adminId: string, username: string, role: string): string {
  return jwt.sign(
    { sub: adminId, username, role, jti: uuidv4(), type: 'admin' } satisfies AdminTokenPayload,
    config.jwt.accessSecret,
    { expiresIn: '8h' }
  );
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as AdminTokenPayload;
  if (payload.type !== 'admin') throw new Error('Invalid token type');
  return payload;
}

export function getRefreshExpiryDate(): Date {
  const match = config.jwt.refreshExpiresIn.match(/^(\d+)([dhms])$/);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  const multipliers: Record<string, number> = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return new Date(Date.now() + n * (multipliers[unit] ?? 86400000));
}
