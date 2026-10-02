import { Router } from 'express';
import { z } from 'zod';
import * as playerDataService from '../services/player-data.service';
import * as statisticsService from '../services/statistics.service';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { getPlayerByPublicId } from '../services/auth.service';
import { NotFoundError } from '../lib/errors';

const router = Router();

router.get('/profile', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const profile = await playerDataService.getPlayerProfile(req.player!.id);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

router.get('/profile/:publicId', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const player = await getPlayerByPublicId(req.params.publicId);
    if (!player) throw new NotFoundError('Player not found');
    const profile = await playerDataService.getPlayerProfile(player.id);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const profile = await playerDataService.updatePlayerProfile(req.player!.id, req.body);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

router.get('/data', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const keys = req.query.keys ? (req.query.keys as string).split(',') : undefined;
    const data = await playerDataService.getPlayerData(req.player!.id, keys);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/data/:publicId', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const player = await getPlayerByPublicId(req.params.publicId);
    if (!player) throw new NotFoundError('Player not found');
    const keys = req.query.keys ? (req.query.keys as string).split(',') : undefined;
    const data = await playerDataService.getPlayerData(player.id, keys, req.player?.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const updateDataSchema = z.object({
  data: z.record(z.object({
    value: z.unknown(),
    visibility: z.enum(['private', 'public']).optional(),
  })).refine(data => Object.keys(data).length <= 200),
  expectedVersions: z.record(z.number()).optional(),
});

router.put('/data', requireAuth, validate(updateDataSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await playerDataService.updatePlayerData(req.player!.id, req.body.data, req.body.expectedVersions);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.delete('/data', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const keys = req.body.keys as string[];
    const deleted = await playerDataService.deletePlayerData(req.player!.id, keys);
    res.json({ success: true, data: { deleted } });
  } catch (err) {
    next(err);
  }
});

router.get('/statistics', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const statKeys = req.query.statKeys ? (req.query.statKeys as string).split(',') : undefined;
    const stats = await statisticsService.getPlayerStatistics(req.player!.id, statKeys);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

const updateStatsSchema = z.object({
  statistics: z.array(z.object({
    statKey: z.string(),
    value: z.number().optional(),
    increment: z.number().optional(),
  })),
});

router.put('/statistics', requireAuth, validate(updateStatsSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const stats = await statisticsService.updatePlayerStatistics(req.player!.id, req.body.statistics);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

export default router;
