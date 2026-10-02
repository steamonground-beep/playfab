import { query } from '../lib/db';

export async function logAudit(
  actorType: 'player' | 'admin' | 'system' | 'api_key',
  actorId: string | null,
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  await query(
    `INSERT INTO audit_logs (actor_type, actor_id, action, resource_type, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorType, actorId, action, resourceType, resourceId, JSON.stringify(details ?? {}), ipAddress]
  );
}
