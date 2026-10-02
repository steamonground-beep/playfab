import { Router } from 'express';
import * as matchmakingService from '../services/matchmaking.service';
import * as lobbyService from '../services/lobby.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.post('/ticket', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const ticket = await matchmakingService.createMatchmakingTicket(req.player!.id, req.body.queueName, req.body);
    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
});

router.get('/ticket/:ticketId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const ticket = await matchmakingService.getMatchmakingTicket(req.player!.id, req.params.ticketId);
    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
});

router.delete('/ticket/:ticketId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await matchmakingService.cancelMatchmakingTicket(req.player!.id, req.params.ticketId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/queues', async (_req, res, next) => {
  try {
    const queues = await matchmakingService.getActiveQueues();
    res.json({ success: true, data: queues });
  } catch (err) {
    next(err);
  }
});

// Lobbies
router.post('/lobbies', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const lobby = await lobbyService.createLobby(req.player!.id, req.body.name, req.body);
    res.json({ success: true, data: lobby });
  } catch (err) {
    next(err);
  }
});

router.get('/lobbies', async (req, res, next) => {
  try {
    const lobbies = await lobbyService.listPublicLobbies(parseInt(req.query.limit as string ?? '50', 10));
    res.json({ success: true, data: lobbies });
  } catch (err) {
    next(err);
  }
});

router.get('/lobbies/:lobbyId', async (req, res, next) => {
  try {
    const lobby = await lobbyService.getLobby(req.params.lobbyId);
    res.json({ success: true, data: lobby });
  } catch (err) {
    next(err);
  }
});

router.post('/lobbies/:lobbyId/join', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await lobbyService.joinLobby(req.player!.id, req.params.lobbyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/lobbies/:lobbyId/leave', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await lobbyService.leaveLobby(req.player!.id, req.params.lobbyId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
