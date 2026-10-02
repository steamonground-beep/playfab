import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, verifyAdminToken } from '../lib/jwt';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';
import { getPlayerById } from '../services/auth.service';
import { isPlayerBanned } from '../services/moderation.service';
import { queryOne } from '../lib/db';

export interface AuthenticatedRequest extends Request {
  player?: { id: string; publicId: string };
  admin?: { id: string; username: string; role: string };
  body: any;
  query: any;
  params: any;
}

export async function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    const activeSession = await queryOne<{ id: string }>(
      `SELECT id FROM player_sessions
       WHERE player_id = $1 AND access_token_jti = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
      [payload.sub, payload.jti]
    );
    if (!activeSession) throw new UnauthorizedError('Session expired or revoked');

    const player = await getPlayerById(payload.sub);
    if (!player) throw new UnauthorizedError('Player not found');

    const banStatus = await isPlayerBanned(player.id);
    if (banStatus.banned) {
      throw new ForbiddenError(`Account banned: ${banStatus.reason ?? 'No reason provided'}`);
    }

    req.player = { id: player.id, publicId: player.public_id };
    next();
  } catch (err) {
    next(err instanceof UnauthorizedError || err instanceof ForbiddenError ? err : new UnauthorizedError('Invalid token'));
  }
}

export async function requireAdmin(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authorization');
    }

    const token = authHeader.slice(7);
    const payload = verifyAdminToken(token);
    const admin = await queryOne<{ id: string; username: string; role: string; is_active: boolean }>(
      `SELECT id, username, role, is_active FROM admin_users WHERE id = $1`,
      [payload.sub]
    );
    if (!admin || !admin.is_active || admin.role !== payload.role) {
      throw new UnauthorizedError('Admin account is inactive or permissions changed');
    }
    req.admin = { id: admin.id, username: admin.username, role: admin.role };
    next();
  } catch {
    next(new UnauthorizedError('Invalid admin token'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  };
}

export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    const activeSession = await queryOne<{ id: string }>(
      `SELECT id FROM player_sessions
       WHERE player_id = $1 AND access_token_jti = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
      [payload.sub, payload.jti]
    );
    const player = activeSession ? await getPlayerById(payload.sub) : null;
    if (player) {
      const banStatus = await isPlayerBanned(player.id);
      if (!banStatus.banned) req.player = { id: player.id, publicId: player.public_id };
    }
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}
