import { Router } from 'express';
import { trackEvent } from '../services/analytics.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.post('/event', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await trackEvent(req.body.eventType, req.player!.id, undefined, req.body.properties, req.ip);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
