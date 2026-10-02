import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as socialService from './social.service';
import { query, queryOne, withTransaction } from '../lib/db';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';

vi.mock('../lib/db');
vi.mock('./audit.service');

describe('Social Service Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendFriendRequest', () => {
    it('should prevent self-friending', async () => {
      (queryOne as any).mockResolvedValue({ id: 'player-123' });

      await expect(
        socialService.sendFriendRequest('player-123', 'player-123')
      ).rejects.toThrow(ConflictError);
    });

    it('should prevent duplicate friend requests', async () => {
      (queryOne as any)
        .mockResolvedValueOnce({ id: 'player-456' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-friendship' });

      await expect(
        socialService.sendFriendRequest('player-123', 'player-456')
      ).rejects.toThrow(ConflictError);
    });

    it('should create friend request successfully', async () => {
      (queryOne as any)
        .mockResolvedValueOnce({ id: 'player-456' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (query as any).mockResolvedValue({ rows: [] });

      await socialService.sendFriendRequest('player-123', 'player-456');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO friend_requests'),
        expect.any(Array)
      );
    });
  });

  describe('respondFriendRequest', () => {
    it('should reject non-existent requests', async () => {
      (queryOne as any).mockResolvedValue(null);

      await expect(
        socialService.respondFriendRequest('player-123', 'player-456', true)
      ).rejects.toThrow(NotFoundError);
    });

    it('should create friendship on accept', async () => {
      (queryOne as any)
        .mockResolvedValueOnce({ id: 'player-456' })
        .mockResolvedValueOnce({ id: 'request-123' });
      (withTransaction as any).mockImplementation(async (callback: any) => {
        const mockClient = {
          query: vi.fn().mockResolvedValue({ rows: [] }),
        };
        return callback(mockClient);
      });

      await socialService.respondFriendRequest('player-123', 'player-456', true);
      expect(withTransaction).toHaveBeenCalled();
    });
  });

  describe('blockPlayer', () => {
    it('should prevent self-blocking', async () => {
      (queryOne as any).mockResolvedValue({ id: 'player-123' });

      await expect(
        socialService.blockPlayer('player-123', 'player-123')
      ).rejects.toThrow();
    });

    it('should create block record', async () => {
      (queryOne as any).mockResolvedValue({ id: 'player-456' });
      (query as any).mockResolvedValue({ rows: [] });

      await socialService.blockPlayer('player-123', 'player-456');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO player_blocks'),
        expect.any(Array)
      );
    });
  });

  describe('getFriends', () => {
    it('should return friends for player', async () => {
      const mockFriends = [
        { public_id: 'friend-1', display_name: 'Friend One', status: 'offline', last_seen_at: null },
      ];
      (query as any).mockResolvedValue({ rows: mockFriends });

      const result = await socialService.getFriends('player-123');
      expect(result).toEqual([
        { publicId: 'friend-1', displayName: 'Friend One', status: 'offline', lastSeenAt: undefined },
      ]);
    });
  });
});
