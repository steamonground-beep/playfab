import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as inventoryService from '../services/inventory.service';
import * as currencyService from '../services/currency.service';
import * as catalogService from '../services/catalog.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.get('/inventory', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inventory = await inventoryService.getInventory(req.player!.id);
    res.json({ success: true, data: inventory });
  } catch (err) {
    next(err);
  }
});

router.get('/currency', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const currencyCode = req.query.currencyCode as string | undefined;
    const balances = await currencyService.getCurrencyBalance(req.player!.id, currencyCode);
    res.json({ success: true, data: balances });
  } catch (err) {
    next(err);
  }
});

router.get('/currency/transactions', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string ?? '50', 10);
    const offset = parseInt(req.query.offset as string ?? '0', 10);
    const transactions = await currencyService.getTransactionHistory(req.player!.id, limit, offset);
    res.json({ success: true, data: transactions });
  } catch (err) {
    next(err);
  }
});

router.get('/catalog/items', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const items = await catalogService.getCatalogItems(req.query.category as string | undefined);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

router.get('/catalog/bundles', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const bundles = await catalogService.getCatalogBundles();
    res.json({ success: true, data: bundles });
  } catch (err) {
    next(err);
  }
});

const consumeSchema = z.object({
  instanceId: z.string().uuid(),
  quantity: z.number().int().positive().optional().default(1),
});

router.post('/inventory/consume', requireAuth, validate(consumeSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await inventoryService.consumeItem(req.player!.id, req.body.instanceId, req.body.quantity);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
