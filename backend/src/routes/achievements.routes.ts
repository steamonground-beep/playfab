import { Router } from 'express';
import * as achievementsService from '../services/achievements.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const achievements = await achievementsService.getAchievements(req.player!.id);
    res.json({ success: true, data: achievements });
  } catch (err) {
    next(err);
  }
});

export default router;
