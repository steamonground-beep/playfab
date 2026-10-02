import { query, queryOne, withTransaction } from '../lib/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import { v4 as uuidv4 } from 'uuid';

const MAX_INVENTORY_ITEMS = 500;

export interface InventoryItem {
  instanceId: string;
  itemId: string;
  quantity: number;
  metadata: Record<string, unknown>;
  expiresAt?: string;
  acquiredAt: string;
}

export async function getInventory(playerId: string): Promise<InventoryItem[]> {
  const rows = await query<{
    instance_id: string;
    item_id: string;
    quantity: number;
    metadata: Record<string, unknown>;
    expires_at: Date | null;
    acquired_at: Date;
  }>(
    `SELECT instance_id, item_id, quantity, metadata, expires_at, acquired_at
     FROM player_inventory WHERE player_id = $1
     AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY acquired_at DESC`,
    [playerId]
  );

  return rows.map(r => ({
    instanceId: r.instance_id,
    itemId: r.item_id,
    quantity: r.quantity,
    metadata: r.metadata ?? {},
    expiresAt: r.expires_at?.toISOString(),
    acquiredAt: r.acquired_at.toISOString(),
  }));
}

export async function grantItem(
  playerId: string,
  itemId: string,
  quantity = 1,
  metadata?: Record<string, unknown>,
  expiresAt?: Date,
  source = 'grant'
): Promise<InventoryItem[]> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_INVENTORY_ITEMS) {
    throw new ValidationError(`Quantity must be an integer between 1 and ${MAX_INVENTORY_ITEMS}`);
  }
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
    throw new ValidationError('Item expiration must be a future date');
  }

  const catalogItem = await queryOne<{ is_stackable: boolean; max_stack: number }>(
    `SELECT is_stackable, max_stack FROM catalog_items WHERE item_id = $1 AND is_active = true`,
    [itemId]
  );
  if (!catalogItem) throw new NotFoundError(`Item not found: ${itemId}`);
  if (catalogItem.max_stack < 1) throw new ValidationError('Catalog item has an invalid maximum stack');

  const granted: InventoryItem[] = [];

  await withTransaction(async (client) => {
    await client.query(`SELECT id FROM players WHERE id = $1 FOR UPDATE`, [playerId]);
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM player_inventory
       WHERE player_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [playerId]
    );
    const activeCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

    if (catalogItem.is_stackable) {
      if (quantity > catalogItem.max_stack) throw new ValidationError('Quantity exceeds the item maximum stack');
      const existing = await client.query<{ id: string; instance_id: string; quantity: number }>(
        `SELECT id, instance_id, quantity FROM player_inventory
         WHERE player_id = $1 AND item_id = $2 AND metadata = $3::jsonb
           AND expires_at IS NOT DISTINCT FROM $4
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY acquired_at LIMIT 1 FOR UPDATE`,
        [playerId, itemId, JSON.stringify(metadata ?? {}), expiresAt ?? null]
      );

      if (existing.rows.length) {
        const newQty = existing.rows[0].quantity + quantity;
        if (newQty > catalogItem.max_stack) throw new ValidationError('Quantity would exceed the item maximum stack');
        await client.query(`UPDATE player_inventory SET quantity = $1, updated_at = NOW() WHERE id = $2`, [newQty, existing.rows[0].id]);
        granted.push({
          instanceId: existing.rows[0].instance_id,
          itemId,
          quantity: newQty,
          metadata: metadata ?? {},
          acquiredAt: new Date().toISOString(),
        });
      } else {
        if (activeCount >= MAX_INVENTORY_ITEMS) throw new ValidationError('Inventory full');
        const instanceId = uuidv4();
        await client.query(
          `INSERT INTO player_inventory (player_id, item_id, instance_id, quantity, metadata, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [playerId, itemId, instanceId, Math.min(quantity, catalogItem.max_stack), JSON.stringify(metadata ?? {}), expiresAt]
        );
        granted.push({ instanceId, itemId, quantity, metadata: metadata ?? {}, expiresAt: expiresAt?.toISOString(), acquiredAt: new Date().toISOString() });
      }
    } else {
      if (activeCount + quantity > MAX_INVENTORY_ITEMS) throw new ValidationError('Inventory full');
      for (let i = 0; i < quantity; i++) {
        const instanceId = uuidv4();
        await client.query(
          `INSERT INTO player_inventory (player_id, item_id, instance_id, quantity, metadata, expires_at) VALUES ($1, $2, $3, 1, $4, $5)`,
          [playerId, itemId, instanceId, JSON.stringify(metadata ?? {}), expiresAt]
        );
        granted.push({ instanceId, itemId, quantity: 1, metadata: metadata ?? {}, expiresAt: expiresAt?.toISOString(), acquiredAt: new Date().toISOString() });
      }
    }

    await client.query(
      `INSERT INTO analytics_events (event_type, player_id, properties) VALUES ('inventory_grant', $1, $2)`,
      [playerId, JSON.stringify({ itemId, quantity, source })]
    );
  });

  return granted;
}

export async function removeItem(playerId: string, instanceId: string, quantity = 1, eventType = 'inventory_remove'): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1) throw new ValidationError('Quantity must be a positive integer');
  await withTransaction(async (client) => {
    const item = await client.query<{ id: string; quantity: number; item_id: string }>(
      `SELECT id, quantity, item_id FROM player_inventory WHERE player_id = $1 AND instance_id = $2 FOR UPDATE`,
      [playerId, instanceId]
    );
    if (!item.rows.length) throw new NotFoundError('Item not found in inventory');

    const row = item.rows[0];
    if (row.quantity < quantity) throw new ValidationError('Not enough items in this stack');
    if (row.quantity <= quantity) {
      await client.query(`DELETE FROM player_inventory WHERE id = $1`, [row.id]);
    } else {
      await client.query(`UPDATE player_inventory SET quantity = quantity - $1 WHERE id = $2`, [quantity, row.id]);
    }

    await client.query(
      `INSERT INTO analytics_events (event_type, player_id, properties) VALUES ($1, $2, $3)`,
      [eventType, playerId, JSON.stringify({ instanceId, itemId: row.item_id, quantity })]
    );
  });
}

export async function consumeItem(playerId: string, instanceId: string, quantity = 1): Promise<void> {
  await removeItem(playerId, instanceId, quantity, 'inventory_consume');
}
