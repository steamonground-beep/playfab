import { query, queryOne } from '../lib/db';
import { NotFoundError } from '../lib/errors';

export async function getCatalogItems(category?: string): Promise<Array<Record<string, unknown>>> {
  let sql = `SELECT item_id, display_name, description, item_type, is_stackable, max_stack, metadata, category, version
             FROM catalog_items WHERE is_active = true`;
  const params: unknown[] = [];
  if (category) {
    sql += ` AND category = $1`;
    params.push(category);
  }
  return query(sql, params);
}

export async function getCatalogItem(itemId: string): Promise<Record<string, unknown>> {
  const item = await queryOne(`SELECT * FROM catalog_items WHERE item_id = $1 AND is_active = true`, [itemId]);
  if (!item) throw new NotFoundError('Catalog item not found');
  return item;
}

export async function getCatalogBundles(): Promise<Array<Record<string, unknown>>> {
  return query(`SELECT bundle_id, display_name, item_ids, prices, metadata FROM catalog_bundles WHERE is_active = true`);
}

export async function createCatalogItem(data: {
  itemId: string;
  displayName: string;
  description?: string;
  itemType?: string;
  isStackable?: boolean;
  maxStack?: number;
  metadata?: Record<string, unknown>;
  category?: string;
}): Promise<Record<string, unknown>> {
  const result = await queryOne(
    `INSERT INTO catalog_items (item_id, display_name, description, item_type, is_stackable, max_stack, metadata, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      data.itemId, data.displayName, data.description, data.itemType ?? 'item',
      data.isStackable ?? true, data.maxStack ?? 999,
      JSON.stringify(data.metadata ?? {}), data.category,
    ]
  );
  return result!;
}

export async function updateCatalogItem(itemId: string, updates: Partial<{
  displayName: string;
  description: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  category: string;
}>): Promise<Record<string, unknown>> {
  const sets: string[] = ['version = version + 1'];
  const params: unknown[] = [];
  let i = 1;

  if (updates.displayName) { sets.push(`display_name = $${i++}`); params.push(updates.displayName); }
  if (updates.description !== undefined) { sets.push(`description = $${i++}`); params.push(updates.description); }
  if (updates.metadata) { sets.push(`metadata = $${i++}`); params.push(JSON.stringify(updates.metadata)); }
  if (updates.isActive !== undefined) { sets.push(`is_active = $${i++}`); params.push(updates.isActive); }
  if (updates.category) { sets.push(`category = $${i++}`); params.push(updates.category); }

  params.push(itemId);
  const result = await queryOne(`UPDATE catalog_items SET ${sets.join(', ')} WHERE item_id = $${i} RETURNING *`, params);
  if (!result) throw new NotFoundError('Catalog item not found');
  return result;
}
