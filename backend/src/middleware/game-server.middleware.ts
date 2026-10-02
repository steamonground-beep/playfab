import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { UnauthorizedError } from '../lib/errors';

export function requireGameServer(req: Request, _res: Response, next: NextFunction): void {
  const supplied = req.header('x-game-server-key') ?? '';
  const expected = config.gameServerSecret;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (expected.length < 32 || suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    next(new UnauthorizedError('Invalid game server credential'));
    return;
  }
  next();
}
