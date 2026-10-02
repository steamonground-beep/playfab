import { Router } from 'express';
import * as leaderboardService from '../services/leaderboard.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/:leaderboardId', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string ?? '100', 10);
    const offset = parseInt(req.query.offset as string ?? '0', 10);
    const seasonId = req.query.seasonId as string | undefined;
    const result = await leaderboardService.getLeaderboard(req.params.leaderboardId, limit, offset, seasonId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:leaderboardId/position', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const seasonId = req.query.seasonId as string | undefined;
    const position = await leaderboardService.getPlayerLeaderboardPosition(req.player!.id, req.params.leaderboardId, seasonId);
    res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
});

export default router;
