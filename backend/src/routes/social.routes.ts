import { Router, Response, NextFunction } from 'express';
import * as socialService from '../services/social.service';
import * as groupsService from '../services/groups.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/friends', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const friends = await socialService.getFriends(req.player!.id);
    res.json({ success: true, data: friends });
  } catch (err) {
    next(err);
  }
});

router.post('/friends/request', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await socialService.sendFriendRequest(req.player!.id, req.body.publicId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/friends/respond', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await socialService.respondFriendRequest(req.player!.id, req.body.publicId, req.body.accept);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/friends/:publicId', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await socialService.removeFriend(req.player!.id, req.params.publicId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/block', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await socialService.blockPlayer(req.player!.id, req.body.publicId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/block/:publicId', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await socialService.unblockPlayer(req.player!.id, req.params.publicId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/search', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const results = await socialService.searchPlayers(req.query.q as string);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

router.put('/presence', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await socialService.updatePresence(req.player!.id, req.body.status);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Groups
router.post('/groups', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const group = await groupsService.createGroup(req.player!.id, req.body.name, req.body.description, req.body.isPublic, req.body.maxMembers);
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

router.get('/groups', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const groups = await groupsService.getPlayerGroups(req.player!.id);
    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
});

router.post('/groups/:publicId/join', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await groupsService.joinGroup(req.player!.id, req.params.publicId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/groups/:publicId/leave', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await groupsService.leaveGroup(req.player!.id, req.params.publicId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/groups/:publicId/members', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const members = await groupsService.getGroupMembers(req.params.publicId);
    res.json({ success: true, data: members });
  } catch (err) {
    next(err);
  }
});

export default router;
