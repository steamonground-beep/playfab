import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { validate } from '../middleware/validate.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

const customIdSchema = z.object({
  customId: z.string().min(3).max(128),
  customSecret: z.string().min(32).max(256),
  displayName: z.string().max(64).optional(),
  createAccount: z.boolean().optional().default(true),
});

const emailRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(64),
});

const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const customIdRecoveryRequestSchema = z.object({
  customId: z.string().min(3).max(128),
  email: z.string().email(),
});

const customIdRecoveryCompleteSchema = z.object({
  customId: z.string().min(3).max(128),
  token: z.string().min(1),
  newSecret: z.string().min(32).max(256),
});

router.post('/LoginRayvoCustomIDNoPCVR', authRateLimiter, validate(customIdSchema), async (req, res, next) => {
  try {
    const { customId, customSecret, displayName, createAccount } = req.body;
    const result = await authService.loginRayvoCustomIDNoPCVR(
      customId,
      customSecret,
      displayName,
      createAccount,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/guest', authRateLimiter, async (req, res, next) => {
  try {
    const result = await authService.registerGuest(req.body.displayName, req.ip, req.headers['user-agent']);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/register', authRateLimiter, validate(emailRegisterSchema), async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;
    const result = await authService.registerWithEmail(email, password, displayName, req.ip, req.headers['user-agent']);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authRateLimiter, validate(emailLoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginWithEmail(email, password, req.ip, req.headers['user-agent']);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await authService.logout(req.player!.id, req.body.refreshToken);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/account', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await authService.deleteAccount(req.player!.id);
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    next(err);
  }
});

router.get('/export', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await authService.exportAccountData(req.player!.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/recover', authRateLimiter, async (req, res, next) => {
  try {
    const result = await authService.requestAccountRecovery(req.body.email);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/recover/custom-id', authRateLimiter, validate(customIdRecoveryRequestSchema), async (req, res, next) => {
  try {
    const { customId, email } = req.body;
    const result = await authService.requestCustomIdRecovery(customId, email);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/recover/custom-id/complete', authRateLimiter, validate(customIdRecoveryCompleteSchema), async (req, res, next) => {
  try {
    const { customId, token, newSecret } = req.body;
    const result = await authService.completeCustomIdRecovery(customId, token, newSecret, req.ip);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
