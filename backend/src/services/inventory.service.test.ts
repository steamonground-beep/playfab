import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, queryOne, withTransaction } = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../lib/db', () => ({ query, queryOne, withTransaction }));

import { grantItem, removeItem } from './inventory.service';

describe('inventory mutations', () => {
  let clientQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryOne.mockResolvedValue({ is_stackable: true, max_stack: 10 });
    clientQuery = vi.fn().mockResolvedValue({ rows: [] });
    withTransaction.mockImplementation((callback: (client: unknown) => unknown) => callback({ query: clientQuery }));
  });

  it('rejects invalid grant quantities without querying the catalog', async () => {
    await expect(grantItem('player', 'potion', 0)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(grantItem('player', 'potion', 1.5)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('does not silently truncate grants that overflow a stack', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'stack-row', instance_id: 'instance', quantity: 9 }] });

    await expect(grantItem('player', 'potion', 2)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE player_inventory'), expect.any(Array));
  });

  it('rejects removal larger than the owned stack instead of deleting the whole stack', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'row', quantity: 2, item_id: 'potion' }] });

    await expect(removeItem('player', 'instance', 3)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM player_inventory'), expect.any(Array));
  });
});
