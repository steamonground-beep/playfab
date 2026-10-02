import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cloudFunctionsService from './cloud-functions.service';
import { query, queryOne, withTransaction } from '../lib/db';
import { ValidationError, NotFoundError } from '../lib/errors';

vi.mock('../lib/db');
vi.mock('./audit.service');
vi.mock('./analytics.service');

describe('Cloud Functions Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeCloudFunction', () => {
    it('should reject inactive functions', async () => {
      (queryOne as any).mockResolvedValue(null);

      await expect(
        cloudFunctionsService.executeCloudFunction('test_func', 'player-123', {})
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject non-builtin handlers', async () => {
      (queryOne as any).mockResolvedValue({
        function_name: 'test_func',
        handler_type: 'custom',
        is_active: true,
      });

      await expect(
        cloudFunctionsService.executeCloudFunction('test_func', 'player-123', {})
      ).rejects.toThrow('Only builtin function handlers are currently supported');
    });

    it('should reject unimplemented handlers', async () => {
      (queryOne as any).mockResolvedValue({
        function_name: 'unimplemented_func',
        handler_type: 'builtin',
        is_active: true,
      });

      await expect(
        cloudFunctionsService.executeCloudFunction('unimplemented_func', 'player-123', {})
      ).rejects.toThrow(NotFoundError);
    });

    it('should validate grant_daily_reward arguments', async () => {
      (queryOne as any).mockResolvedValue({
        function_name: 'grant_daily_reward',
        handler_type: 'builtin',
        is_active: true,
      });

      await expect(
        cloudFunctionsService.executeCloudFunction('grant_daily_reward', 'player-123', {})
      ).rejects.toThrow(ValidationError);
    });

    it('should validate update_statistic arguments', async () => {
      (queryOne as any).mockResolvedValue({
        function_name: 'update_statistic',
        handler_type: 'builtin',
        is_active: true,
      });

      await expect(
        cloudFunctionsService.executeCloudFunction('update_statistic', 'player-123', {})
      ).rejects.toThrow(ValidationError);
    });

    it('should enforce rate limits', async () => {
      (queryOne as any).mockResolvedValue({
        function_name: 'grant_daily_reward',
        handler_type: 'builtin',
        is_active: true,
      });
      (query as any).mockResolvedValue({ rows: [{ count: '15' }] });

      await expect(
        cloudFunctionsService.executeCloudFunction('grant_daily_reward', 'player-123', { currencyCode: 'coins' })
      ).rejects.toThrow(ValidationError);
    });

    it('should return cached result for idempotent calls', async () => {
      (queryOne as any)
        .mockResolvedValueOnce({
          function_name: 'grant_daily_reward',
          handler_type: 'builtin',
          is_active: true,
        })
        .mockResolvedValueOnce({
          output: { balance: 500, amount: 100 },
        });
      (query as any).mockResolvedValue({ rows: [{ count: '0' }] });

      const result = await cloudFunctionsService.executeCloudFunction(
        'grant_daily_reward',
        'player-123',
        { currencyCode: 'coins' },
        'unique-idempotency-key'
      );

      expect(result).toEqual({ balance: 500, amount: 100 });
    });
  });

  describe('listCloudFunctions', () => {
    it('should return active functions', async () => {
      const mockFunctions = [
        { function_name: 'grant_daily_reward', description: 'Grant daily reward' },
      ];
      (query as any).mockResolvedValue({ rows: mockFunctions });

      const result = await cloudFunctionsService.listCloudFunctions();
      expect(result).toEqual(mockFunctions);
    });
  });

  describe('getFunctionLogs', () => {
    it('should return logs for a function', async () => {
      const mockLogs = [
        { function_name: 'grant_daily_reward', success: true, execution_ms: 10 },
      ];
      (query as any).mockResolvedValue({ rows: mockLogs });

      const result = await cloudFunctionsService.getFunctionLogs('grant_daily_reward');
      expect(result).toEqual(mockLogs);
    });

    it('should filter logs by player ID', async () => {
      const mockLogs = [
        { function_name: 'grant_daily_reward', player_id: 'player-123', success: true },
      ];
      (query as any).mockResolvedValue({ rows: mockLogs });

      const result = await cloudFunctionsService.getFunctionLogs('grant_daily_reward', 'player-123');
      expect(result).toEqual(mockLogs);
    });
  });
});
