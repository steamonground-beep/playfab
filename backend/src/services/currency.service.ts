import { query, queryOne, withTransaction } from '../lib/db';
import { NotFoundError, ValidationError } from '../lib/errors';

export async function getCurrencyBalance(playerId: string, currencyCode?: string): Promise<Array<{ currencyCode: string; balance: number }>> {
  let sql = `SELECT pc.currency_code, pc.balance FROM player_currency pc
             JOIN currency_definitions cd ON pc.currency_code = cd.currency_code
             WHERE pc.player_id = $1 AND cd.is_active = true`;
  const params: unknown[] = [playerId];

  if (currencyCode) {
    sql += ` AND pc.currency_code = $2`;
    params.push(currencyCode);
  }

  const rows = await query<{ currency_code: string; balance: string }>(sql, params);
  return rows.map(r => ({ currencyCode: r.currency_code, balance: parseFloat(r.balance) }));
}

export async function modifyCurrency(
  playerId: string,
  currencyCode: string,
  amount: number,
  transactionType: string,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<{ balance: number; transactionId: string }> {
  if (!Number.isFinite(amount) || amount === 0) throw new ValidationError('Currency amount must be a finite non-zero number');
  const currencyDef = await queryOne(`SELECT currency_code, max_balance FROM currency_definitions WHERE currency_code = $1 AND is_active = true`, [currencyCode]);
  if (!currencyDef) throw new NotFoundError(`Currency not found: ${currencyCode}`);

  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO player_currency (player_id, currency_code, balance) VALUES ($1, $2, 0)
       ON CONFLICT (player_id, currency_code) DO NOTHING`,
      [playerId, currencyCode]
    );
    const balance = await client.query<{ balance: string }>(
      `SELECT balance FROM player_currency WHERE player_id = $1 AND currency_code = $2 FOR UPDATE`,
      [playerId, currencyCode]
    );

    let currentBalance = balance.rows[0] ? parseFloat(balance.rows[0].balance) : 0;

    const newBalance = currentBalance + amount;
    if (newBalance < 0) throw new ValidationError('Insufficient currency');

    const maxBalance = (currencyDef as { max_balance: number | null }).max_balance;
    if (maxBalance !== null && newBalance > maxBalance) {
      throw new ValidationError('Maximum balance exceeded');
    }

    await client.query(
      `UPDATE player_currency SET balance = $1, updated_at = NOW() WHERE player_id = $2 AND currency_code = $3`,
      [newBalance, playerId, currencyCode]
    );

    const txResult = await client.query<{ id: string }>(
      `INSERT INTO currency_transactions (player_id, currency_code, amount, balance_after, transaction_type, reference_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [playerId, currencyCode, amount, newBalance, transactionType, referenceId, JSON.stringify(metadata ?? {})]
    );

    await client.query(
      `INSERT INTO analytics_events (event_type, player_id, properties)
       VALUES ('currency_transaction', $1, $2)`,
      [playerId, JSON.stringify({ currencyCode, amount, transactionType, newBalance })]
    );

    return { balance: newBalance, transactionId: txResult.rows[0].id };
  });
}

export async function grantCurrency(playerId: string, currencyCode: string, amount: number, reason?: string): Promise<{ balance: number }> {
  if (amount <= 0) throw new ValidationError('Grant amount must be positive');
  const result = await modifyCurrency(playerId, currencyCode, amount, 'grant', undefined, { reason });
  return { balance: result.balance };
}

export async function deductCurrency(playerId: string, currencyCode: string, amount: number, reason?: string): Promise<{ balance: number }> {
  if (amount <= 0) throw new ValidationError('Deduction amount must be positive');
  const result = await modifyCurrency(playerId, currencyCode, -amount, 'deduct', undefined, { reason });
  return { balance: result.balance };
}

export async function getTransactionHistory(playerId: string, limit = 50, offset = 0): Promise<Array<Record<string, unknown>>> {
  return query(
    `SELECT id, currency_code, amount, balance_after, transaction_type, reference_id, metadata, created_at
     FROM currency_transactions WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [playerId, limit, offset]
  );
}
