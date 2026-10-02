import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { rateLimitCheck } from '../lib/redis';
import { RateLimitError } from '../lib/errors';
import { Request, Response, NextFunction, RequestHandler } from 'express';

export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
}) as unknown as RequestHandler;

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts' } },
}) as unknown as RequestHandler;

export function replayProtection() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const nonce = req.headers['x-request-nonce'] as string;
    const timestamp = req.headers['x-request-timestamp'] as string;

    if (!nonce || !timestamp) {
      next();
      return;
    }

    const ts = parseInt(timestamp, 10);
    const now = Date.now();
    if (isNaN(ts) || Math.abs(now - ts) > 5 * 60 * 1000) {
      next(new RateLimitError('Request timestamp expired'));
      return;
    }

    const key = `nonce:${nonce}`;
    const allowed = await rateLimitCheck(key, 1, 300);
    if (!allowed) {
      next(new RateLimitError('Replay detected'));
      return;
    }

    next();
  };
}
