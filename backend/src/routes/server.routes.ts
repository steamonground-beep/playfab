import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireGameServer } from '../middleware/game-server.middleware';
import { validate } from '../middleware/validate.middleware';
import { getPlayerByPublicId } from '../services/auth.service';
import { updatePlayerStatistics } from '../services/statistics.service';
import { NotFoundError } from '../lib/errors';

const router = Router();
router.use(requireGameServer);

const updateStatsSchema = z.object({
  statistics: z.array(z.object({
    statKey: z.string().min(1).max(64),
    value: z.number().finite().optional(),
    increment: z.number().finite().optional(),
  }).refine((stat) => stat.value !== undefined || stat.increment !== undefined)),
}).refine((body) => body.statistics.length > 0 && body.statistics.length <= 100);

router.put('/players/:publicId/statistics', validate(updateStatsSchema), async (req, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = req.header('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A 16-128 character Idempotency-Key header is required' } });
      return;
    }
    const player = await getPlayerByPublicId(req.params.publicId);
    if (!player) throw new NotFoundError('Player not found');
    const statistics = await updatePlayerStatistics(player.id, req.body.statistics, 'server', idempotencyKey);
    res.json({ success: true, data: statistics });
  } catch (err) {
    next(err);
  }
});

export default router;
