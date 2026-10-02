import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, queryOne, withTransaction, trackEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  withTransaction: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('../lib/db', () => ({ query, queryOne, withTransaction }));
vi.mock('./analytics.service', () => ({ trackEvent }));

import { updatePlayerStatistics } from './statistics.service';

describe('server-authoritative statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects client updates before opening a transaction', async () => {
    await expect(updatePlayerStatistics('player-id', [{ statKey: 'wins', value: 999 }]))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('accepts updates from trusted server code', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ idempotency_key: 'server-request-0001' }] })
      .mockResolvedValueOnce({ rows: [{ aggregation: 'sum' }] })
      .mockResolvedValueOnce({ rows: [{ value: '3' }] })
      .mockResolvedValue({ rows: [] });
    withTransaction.mockImplementation((callback: (client: unknown) => unknown) => callback({ query: clientQuery }));
    trackEvent.mockResolvedValue(undefined);

    const result = await updatePlayerStatistics('player-id', [{ statKey: 'wins', increment: 1 }], 'server', 'server-request-0001');

    expect(result).toEqual([{ statKey: 'wins', value: 4 }]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('server_idempotency_keys'), ['player-id', 'server-request-0001']);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('change_source'), ['player-id', 'wins', 3, 4, 'server']);
  });
});
