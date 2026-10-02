import { Router } from 'express';
import * as photonService from '../services/photon.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/realtime/auth', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const authData = await photonService.getPhotonRealtimeAuthenticationData(req.player!.id, req.player!.publicId);
    res.json({ success: true, data: authData });
  } catch (err) {
    next(err);
  }
});

router.get('/voice/auth', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const authData = await photonService.getPhotonVoiceAuthenticationData(req.player!.id, req.player!.publicId);
    res.json({ success: true, data: authData });
  } catch (err) {
    next(err);
  }
});

router.post('/validate', async (req, res, next) => {
  try {
    const { userId, authToken, serviceType } = req.body;
    const valid = await photonService.validatePhotonAuth(userId, authToken, serviceType);
    res.json({ success: true, data: { valid } });
  } catch (err) {
    next(err);
  }
});

export default router;
