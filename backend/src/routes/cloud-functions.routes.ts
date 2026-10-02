import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as cloudFunctionsService from '../services/cloud-functions.service';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

const executeFunctionSchema = z.object({
  idempotencyKey: z.string().optional(),
});

router.post('/:functionName', requireAuth, validate(executeFunctionSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { idempotencyKey } = req.body;
    const result = await cloudFunctionsService.executeCloudFunction(
      req.params.functionName,
      req.player!.id,
      req.body,
      idempotencyKey,
      req.ip
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const functions = await cloudFunctionsService.listCloudFunctions();
    res.json({ success: true, data: functions });
  } catch (err) {
    next(err);
  }
});

router.get('/:functionName/logs', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await cloudFunctionsService.getFunctionLogs(req.params.functionName, undefined, limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

router.get('/:functionName/logs/my', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await cloudFunctionsService.getFunctionLogs(req.params.functionName, req.player!.id, limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

export default router;
