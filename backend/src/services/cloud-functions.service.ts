import { query, queryOne, withTransaction } from '../lib/db';
import { ForbiddenError, ValidationError, NotFoundError } from '../lib/errors';
import { logAudit } from './audit.service';
import { trackEvent } from './analytics.service';
import { v4 as uuidv4 } from 'uuid';

interface CloudFunctionConfig {
  function_name: string;
  description: string | null;
  handler_type: string;
  config: Record<string, unknown>;
  is_active: boolean;
}

interface FunctionHandler {
  validate(args: Record<string, unknown>): void;
  execute(playerId: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const MAX_EXECUTION_TIME_MS = 5000;
const MAX_FUNCTION_CALLS_PER_MINUTE = 10;

const functionHandlers: Map<string, FunctionHandler> = new Map();

functionHandlers.set('grant_daily_reward', {
  validate(args: Record<string, unknown>) {
    if (!args.currencyCode || typeof args.currencyCode !== 'string') {
      throw new ValidationError('currencyCode is required');
    }
  },
  async execute(playerId: string, args: Record<string, unknown>) {
    const { currencyCode } = args;
    const amount = 100;
    
    const currency = await queryOne<{ initial_balance: string }>(
      `SELECT initial_balance FROM currency_definitions WHERE currency_code = $1 AND is_active = true`,
      [currencyCode]
    );
    if (!currency) throw new ValidationError('Invalid currency code');

    const result = await withTransaction(async (client) => {
      const inserted = await client.query<{ balance: string }>(
        `INSERT INTO player_currency (player_id, currency_code, balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (player_id, currency_code) 
         DO UPDATE SET balance = player_currency.balance + $3
         RETURNING balance`,
        [playerId, currencyCode, amount]
      );
      
      await client.query(
        `INSERT INTO currency_transactions (player_id, currency_code, amount, balance_after, transaction_type, metadata)
         VALUES ($1, $2, $3, $4, 'daily_reward', '{"source": "cloud_function"}'::jsonb)`,
        [playerId, currencyCode, amount, inserted.rows[0].balance]
      );
      
      return { balance: inserted.rows[0].balance, amount };
    });
    
    return result;
  },
});

functionHandlers.set('update_statistic', {
  validate(args: Record<string, unknown>) {
    if (!args.statKey || typeof args.statKey !== 'string') {
      throw new ValidationError('statKey is required');
    }
    if (args.value === undefined || typeof args.value !== 'number') {
      throw new ValidationError('value is required and must be a number');
    }
  },
  async execute(playerId: string, args: Record<string, unknown>) {
    const { statKey, value } = args;
    
    const statDef = await queryOne<{ aggregation: string }>(
      `SELECT aggregation FROM statistic_definitions WHERE stat_key = $1 AND is_active = true`,
      [statKey]
    );
    if (!statDef) throw new ValidationError('Invalid statistic key');

    const result = await withTransaction(async (client) => {
      const current = await client.query<{ value: string }>(
        `SELECT value FROM player_statistics WHERE player_id = $1 AND stat_key = $2`,
        [playerId, statKey]
      );
      
      let newValue = typeof value === 'number' ? value : Number(value);
      if (current.rows.length > 0) {
        const currentValue = Number(current.rows[0].value);
        switch (statDef.aggregation) {
          case 'max':
            newValue = Math.max(currentValue, newValue);
            break;
          case 'min':
            newValue = Math.min(currentValue, newValue);
            break;
          case 'sum':
            newValue = currentValue + newValue;
            break;
          case 'last':
          default:
            newValue = newValue;
            break;
        }
      }
      
      await client.query(
        `INSERT INTO player_statistics (player_id, stat_key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (player_id, stat_key) 
         DO UPDATE SET value = $3, updated_at = NOW()`,
        [playerId, statKey, newValue]
      );
      
      await client.query(
        `INSERT INTO player_statistic_history (player_id, stat_key, old_value, new_value, change_source)
         VALUES ($1, $2, $3, $4, 'cloud_function')`,
        [playerId, statKey, current.rows[0]?.value ?? null, newValue]
      );
      
      return { statKey, value: newValue };
    });
    
    return result;
  },
});

export async function executeCloudFunction(
  functionName: string,
  playerId: string,
  args: Record<string, unknown> = {},
  idempotencyKey?: string,
  ipAddress?: string
): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  
  const funcConfig = await queryOne<CloudFunctionConfig>(
    `SELECT * FROM cloud_functions WHERE function_name = $1 AND is_active = true`,
    [functionName]
  );
  
  if (!funcConfig) {
    throw new NotFoundError('Cloud function not found or inactive');
  }

  if (funcConfig.handler_type !== 'builtin') {
    await logAudit('player', playerId, 'cloud_function.rejected', 'cloud_function', functionName, {
      reason: 'Only builtin handlers are currently supported',
    }, ipAddress);
    throw new ForbiddenError('Only builtin function handlers are currently supported');
  }

  const handler = functionHandlers.get(functionName);
  if (!handler) {
    throw new NotFoundError('Function handler not implemented');
  }

  if (idempotencyKey) {
    const existing = await queryOne<{ output: Record<string, unknown> }>(
      `SELECT output FROM cloud_function_logs 
       WHERE function_name = $1 AND player_id = $2 AND input->>'idempotencyKey' = $3 AND success = true
       ORDER BY created_at DESC LIMIT 1`,
      [functionName, playerId, idempotencyKey]
    );
    if (existing) {
      return existing.output;
    }
  }

  const rateLimitKey = `cf_rate:${playerId}:${functionName}`;
  const recentCalls = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM cloud_function_logs 
     WHERE function_name = $1 AND player_id = $2 AND created_at > NOW() - INTERVAL '1 minute'`,
    [functionName, playerId]
  );
  if (recentCalls && Number(recentCalls.count) >= MAX_FUNCTION_CALLS_PER_MINUTE) {
    throw new ValidationError('Rate limit exceeded for this function');
  }

  try {
    handler.validate(args);
    
    const result = await handler.execute(playerId, args);
    const executionTime = Date.now() - startTime;
    
    if (executionTime > MAX_EXECUTION_TIME_MS) {
      throw new ValidationError('Function execution exceeded time limit');
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO cloud_function_logs (function_name, player_id, input, output, success, execution_ms)
         VALUES ($1, $2, $3, $4, true, $5)`,
        [functionName, playerId, { ...args, idempotencyKey }, result, executionTime]
      );
    });

    await trackEvent('cloud_function_executed', playerId, undefined, { functionName, success: true }, ipAddress);
    await logAudit('player', playerId, 'cloud_function.executed', 'cloud_function', functionName, { success: true }, ipAddress);
    
    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await query(
      `INSERT INTO cloud_function_logs (function_name, player_id, input, output, success, error_message, execution_ms)
       VALUES ($1, $2, $3, '{}'::jsonb, false, $4, $5)`,
      [functionName, playerId, { ...args, idempotencyKey }, errorMessage, executionTime]
    );
    
    await trackEvent('cloud_function_failed', playerId, undefined, { functionName, error: errorMessage }, ipAddress);
    await logAudit('player', playerId, 'cloud_function.failed', 'cloud_function', functionName, { error: errorMessage }, ipAddress);
    
    throw error;
  }
}

export async function listCloudFunctions(): Promise<Array<Record<string, unknown>>> {
  return query(`SELECT function_name, description, handler_type, is_active FROM cloud_functions WHERE is_active = true`);
}

export async function getFunctionLogs(
  functionName: string,
  playerId?: string,
  limit = 50
): Promise<Array<Record<string, unknown>>> {
  let queryStr = `SELECT * FROM cloud_function_logs WHERE function_name = $1`;
  const params: (string | number)[] = [functionName];
  
  if (playerId) {
    queryStr += ` AND player_id = $2`;
    params.push(playerId);
  }
  
  queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  
  return query(queryStr, params);
}
