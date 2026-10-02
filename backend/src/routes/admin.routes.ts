import { Router } from 'express';
import * as adminService from '../services/admin.service';
import * as moderationService from '../services/moderation.service';
import * as inventoryService from '../services/inventory.service';
import * as currencyService from '../services/currency.service';
import * as catalogService from '../services/catalog.service';
import * as leaderboardService from '../services/leaderboard.service';
import * as matchmakingService from '../services/matchmaking.service';
import * as photonService from '../services/photon.service';
import * as analyticsService from '../services/analytics.service';
import { getPlayerByPublicId } from '../services/auth.service';
import { requireAdmin, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';
import { NotFoundError } from '../lib/errors';
import { authRateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const result = await adminService.adminLogin(req.body.username, req.body.password, req.body.totpCode, req.ip);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.use(requireAdmin);

router.get('/players/search', requireRole('superadmin', 'admin', 'moderator', 'viewer'), async (req, res, next) => {
  try {
    const players = await adminService.searchPlayers(req.query.q as string ?? '', parseInt(req.query.limit as string ?? '50', 10));
    res.json({ success: true, data: players });
  } catch (err) {
    next(err);
  }
});

router.get('/players/:publicId', requireRole('superadmin', 'admin', 'moderator', 'viewer'), async (req, res, next) => {
  try {
    const player = await adminService.getPlayerDetails(req.params.publicId);
    res.json({ success: true, data: player });
  } catch (err) {
    next(err);
  }
});

router.post('/players/:publicId/ban', requireRole('superadmin', 'admin', 'moderator'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const player = await getPlayerByPublicId(req.params.publicId);
    if (!player) throw new NotFoundError('Player not found');
    await moderationService.banPlayer(player.id, req.body.reason, req.body.durationMinutes, req.admin!.id, req.body.adminNotes);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/players/:publicId/unban', requireRole('superadmin', 'admin', 'moderator'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const player = await getPlayerByPublicId(req.params.publicId);
    if (!player) throw new NotFoundError('Player not found');
    await moderationService.unbanPlayer(player.id, req.admin!.id, req.body.reason);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/players/:publicId/grant-item', requireRole('superadmin', 'admin'), async (req, res, next) => {
  try {
    const player = await getPlayerByPublicId(req.params.publicId);
    if (!player) throw new NotFoundError('Player not found');
    const items = await inventoryService.grantItem(player.id, req.body.itemId, req.body.quantity ?? 1);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

router.post('/players/:publicId/grant-currency', requireRole('superadmin', 'admin'), async (req, res, next) => {
  try {
    const player = await getPlayerByPublicId(req.params.publicId);
    if (!player) throw new NotFoundError('Player not found');
    const result = await currencyService.grantCurrency(player.id, req.body.currencyCode, req.body.amount, req.body.reason);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/catalog/items', requireRole('superadmin', 'admin', 'viewer'), async (_req, res, next) => {
  try {
    const items = await catalogService.getCatalogItems();
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

router.post('/catalog/items', requireRole('superadmin', 'admin'), async (req, res, next) => {
  try {
    const item = await catalogService.createCatalogItem(req.body);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

router.patch('/catalog/items/:itemId', requireRole('superadmin', 'admin'), async (req, res, next) => {
  try {
    const item = await catalogService.updateCatalogItem(req.params.itemId, req.body);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

router.post('/leaderboards/:leaderboardId/reset', requireRole('superadmin', 'admin'), async (req, res, next) => {
  try {
    const count = await leaderboardService.resetLeaderboard(req.params.leaderboardId, req.body.seasonId);
    res.json({ success: true, data: { deletedEntries: count } });
  } catch (err) {
    next(err);
  }
});

router.get('/matchmaking/queues', requireRole('superadmin', 'admin', 'viewer'), async (_req, res, next) => {
  try {
    const queues = await matchmakingService.getActiveQueues();
    res.json({ success: true, data: queues });
  } catch (err) {
    next(err);
  }
});

router.get('/matchmaking/matches', requireRole('superadmin', 'admin', 'viewer'), async (_req, res, next) => {
  try {
    const matches = await matchmakingService.getActiveMatches();
    res.json({ success: true, data: matches });
  } catch (err) {
    next(err);
  }
});

router.get('/photon/config', requireRole('superadmin', 'admin'), async (_req, res, next) => {
  try {
    const config = await photonService.getPhotonConfigForAdmin();
    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

router.put('/photon/config', requireRole('superadmin', 'admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    await photonService.updatePhotonConfig(req.body, req.admin!.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics/summary', requireRole('superadmin', 'admin', 'viewer'), async (_req, res, next) => {
  try {
    const stats = await analyticsService.getEventStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', requireRole('superadmin', 'admin'), async (req, res, next) => {
  try {
    const logs = await adminService.getAuditLogs(parseInt(req.query.limit as string ?? '100', 10));
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

router.post('/api-keys', requireRole('superadmin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const key = await adminService.createApiKey(req.body.name, req.body.permissions, req.admin!.id);
    res.json({ success: true, data: key });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/setup', requireRole('superadmin', 'admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await adminService.setupAdmin2FA(req.admin!.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/enable', requireRole('superadmin', 'admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    await adminService.enableAdmin2FA(req.admin!.id, req.body.totpCode);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
