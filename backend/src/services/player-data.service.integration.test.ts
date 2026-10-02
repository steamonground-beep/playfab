import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as playerDataService from './player-data.service';
import { query, queryOne, withTransaction } from '../lib/db';
import { ValidationError, NotFoundError } from '../lib/errors';

vi.mock('../lib/db');
vi.mock('./audit.service');

describe('Player Data Service Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlayerData', () => {
    it('should return player data for authenticated player', async () => {
      const mockData = [
        { data_key: 'settings', data_value: { volume: 0.5 }, visibility: 'private', version: 1, updated_at: new Date() },
      ];
      (query as any).mockResolvedValue({ rows: mockData });

      const result = await playerDataService.getPlayerData('player-123');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by keys when specified', async () => {
      const mockData = [
        { data_key: 'public_stats', data_value: { wins: 10 }, visibility: 'public', version: 1, updated_at: new Date() },
      ];
      (query as any).mockResolvedValue({ rows: mockData });

      const result = await playerDataService.getPlayerData('player-123', ['public_stats']);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('updatePlayerData', () => {
    it('should validate data size limits', async () => {
      const largeData = { x: 'a'.repeat(10000) };
      
      await expect(
        playerDataService.updatePlayerData('player-123', { large_key: { value: largeData } })
      ).rejects.toThrow();
    });

    it('should enforce data key limits', async () => {
      (withTransaction as any).mockImplementation(async (callback: any) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: Array(200).map(() => ({ data_key: 'key' })) }),
        };
        return callback(mockClient);
      });

      await expect(
        playerDataService.updatePlayerData('player-123', { new_key: { value: 'test' } })
      ).rejects.toThrow(ValidationError);
    });

    it('should update existing data atomically', async () => {
      (withTransaction as any).mockImplementation(async (callback: any) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] }),
        };
        return callback(mockClient);
      });

      const result = await playerDataService.updatePlayerData('player-123', { settings: { value: { volume: 0.8 } } });
      expect(withTransaction).toHaveBeenCalled();
      expect(result.updated).toContain('settings');
    });
  });

  describe('deletePlayerData', () => {
    it('should delete specific data keys', async () => {
      (queryOne as any).mockResolvedValue({ visibility: 'private' });
      (query as any).mockResolvedValue([{ data_key: 'settings' }]);

      const result = await playerDataService.deletePlayerData('player-123', ['settings']);
      expect(result).toContain('settings');
    });
  });

  describe('getPlayerProfile', () => {
    it('should return player profile', async () => {
      const mockProfile = {
        public_id: 'player-123',
        display_name: 'Test Player',
        avatar_url: null,
        bio: null,
        is_guest: false,
        created_at: new Date(),
        last_login_at: new Date(),
      };
      (queryOne as any).mockResolvedValue(mockProfile);

      const result = await playerDataService.getPlayerProfile('player-123');
      expect(result).toEqual(mockProfile);
    });

    it('should throw for non-existent player', async () => {
      (queryOne as any).mockResolvedValue(null);

      await expect(
        playerDataService.getPlayerProfile('nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
