import { query } from '../lib/db';

export async function trackEvent(
  eventType: string,
  playerId?: string,
  sessionId?: string,
  properties?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  await query(
    `INSERT INTO analytics_events (event_type, player_id, session_id, properties, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventType, playerId ?? null, sessionId ?? null, JSON.stringify(properties ?? {}), ipAddress]
  );
}

export async function getEventStats(days = 7): Promise<Record<string, number>> {
  const rows = await query<{ event_type: string; count: string }>(
    `SELECT event_type, COUNT(*) as count FROM analytics_events
     WHERE created_at > NOW() - INTERVAL '${days} days'
     GROUP BY event_type ORDER BY count DESC`
  );
  return Object.fromEntries(rows.map(r => [r.event_type, parseInt(r.count, 10)]));
}

export async function getDailyEventCounts(eventType: string, days = 30): Promise<Array<{ date: string; count: number }>> {
  const rows = await query<{ date: string; count: string }>(
    `SELECT DATE(created_at) as date, COUNT(*) as count FROM analytics_events
     WHERE event_type = $1 AND created_at > NOW() - INTERVAL '${days} days'
     GROUP BY DATE(created_at) ORDER BY date`,
    [eventType]
  );
  return rows.map(r => ({ date: r.date, count: parseInt(r.count, 10) }));
}
