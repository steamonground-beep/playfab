import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, queryOne, withTransaction } = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../lib/db', () => ({ query, queryOne, withTransaction }));

import { updatePlayerData } from './player-data.service';

describe('player data updates', () => {
  let clientQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clientQuery = vi.fn().mockResolvedValue({ rows: [] });
    withTransaction.mockImplementation((callback: (client: unknown) => unknown) => callback({ query: clientQuery }));
  });

  it('enforces the per-player key cap while holding the player row lock', async () => {
    const keys = Array.from({ length: 200 }, (_, index) => ({ data_key: `key-${index}` }));
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: keys });

    await expect(updatePlayerData('player', { another: { value: true } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(clientQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('FOR UPDATE'), ['player']);
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO player_data'), expect.any(Array));
  });

  it('rejects values larger than 64 KiB without writing them', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await updatePlayerData('player', { oversized: { value: 'x'.repeat(65537) } });
    expect(result).toEqual({ updated: [], errors: { oversized: 'Data too large' } });
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO player_data'), expect.any(Array));
  });

  it('rejects stale optimistic versions without overwriting the current value', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ data_key: 'progress' }] })
      .mockResolvedValueOnce({ rows: [{ version: 4, visibility: 'private' }] });

    const result = await updatePlayerData('player', { progress: { value: 10 } }, { progress: 3 });
    expect(result.errors.progress).toBe('Version conflict');
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE player_data'), expect.any(Array));
  });
});
