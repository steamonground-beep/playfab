import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, queryOne, withTransaction } = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../lib/db', () => ({ query, queryOne, withTransaction }));

import { modifyCurrency } from './currency.service';

describe('currency transactions', () => {
  let clientQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryOne.mockResolvedValue({ currency_code: 'GC', max_balance: null });
    clientQuery = vi.fn().mockResolvedValue({ rows: [] });
    withTransaction.mockImplementation((callback: (client: unknown) => unknown) => callback({ query: clientQuery }));
  });

  it('rejects non-finite or zero changes before reading definitions', async () => {
    await expect(modifyCurrency('player', 'GC', Number.NaN, 'grant')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(modifyCurrency('player', 'GC', 0, 'grant')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('locks or creates the balance and records the balance and analytics atomically', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ balance: '10' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'transaction-id' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await modifyCurrency('player', 'GC', 5, 'grant');

    expect(result).toEqual({ balance: 15, transactionId: 'transaction-id' });
    expect(clientQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('ON CONFLICT (player_id, currency_code) DO NOTHING'), ['player', 'GC']);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), ['player', 'GC']);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('currency_transactions'), expect.any(Array));
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('analytics_events'), ['player', JSON.stringify({ currencyCode: 'GC', amount: 5, transactionType: 'grant', newBalance: 15 })]);
  });

  it('does not write a transaction when a deduction would make the balance negative', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ balance: '2' }] });

    await expect(modifyCurrency('player', 'GC', -3, 'deduct')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('currency_transactions'), expect.any(Array));
  });
});
