import { query, queryOne, withTransaction } from '../lib/db';
import { NotFoundError } from '../lib/errors';
import { grantCurrency } from './currency.service';
import { grantItem } from './inventory.service';
import { trackEvent } from './analytics.service';

export async function getAchievements(playerId: string): Promise<Array<{
  achievementId: string;
  displayName: string;
  description: string;
  progress: number;
  targetValue: number;
  unlocked: boolean;
  unlockedAt?: string;
  isHidden: boolean;
}>> {
  const rows = await query<{
    achievement_id: string;
    display_name: string;
    description: string;
    target_value: string;
    is_hidden: boolean;
    progress: string | null;
    unlocked_at: Date | null;
  }>(
    `SELECT ad.achievement_id, ad.display_name, ad.description, ad.target_value, ad.is_hidden,
            pa.progress, pa.unlocked_at
     FROM achievement_definitions ad
     LEFT JOIN player_achievements pa ON ad.achievement_id = pa.achievement_id AND pa.player_id = $1
     WHERE ad.is_active = true
     AND (ad.is_hidden = false OR pa.unlocked_at IS NOT NULL)`,
    [playerId]
  );

  return rows.map(r => ({
    achievementId: r.achievement_id,
    displayName: r.display_name,
    description: r.description ?? '',
    progress: parseFloat(r.progress ?? '0'),
    targetValue: parseFloat(r.target_value),
    unlocked: r.unlocked_at !== null,
    unlockedAt: r.unlocked_at?.toISOString(),
    isHidden: r.is_hidden,
  }));
}

export async function updateAchievementProgress(
  playerId: string,
  achievementId: string,
  progress: number
): Promise<{ unlocked: boolean; rewards?: Record<string, unknown> }> {
  const def = await queryOne<{ target_value: string; rewards: Record<string, unknown>; display_name: string }>(
    `SELECT target_value, rewards, display_name FROM achievement_definitions WHERE achievement_id = $1 AND is_active = true`,
    [achievementId]
  );
  if (!def) throw new NotFoundError('Achievement not found');

  const targetValue = parseFloat(def.target_value);
  let unlocked = false;
  let rewards: Record<string, unknown> | undefined;

  await withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT progress, unlocked_at FROM player_achievements WHERE player_id = $1 AND achievement_id = $2 FOR UPDATE`,
      [playerId, achievementId]
    );

    const currentProgress = existing.rows[0] ? parseFloat(existing.rows[0].progress) : 0;
    const newProgress = Math.max(currentProgress, progress);
    const wasUnlocked = existing.rows[0]?.unlocked_at !== null;

    if (!existing.rows.length) {
      await client.query(
        `INSERT INTO player_achievements (player_id, achievement_id, progress, unlocked_at)
         VALUES ($1, $2, $3, $4)`,
        [playerId, achievementId, newProgress, newProgress >= targetValue ? new Date() : null]
      );
    } else if (!wasUnlocked) {
      await client.query(
        `UPDATE player_achievements SET progress = $1, unlocked_at = CASE WHEN $1 >= $2 AND unlocked_at IS NULL THEN NOW() ELSE unlocked_at END
         WHERE player_id = $3 AND achievement_id = $4`,
        [newProgress, targetValue, playerId, achievementId]
      );
    }

    if (!wasUnlocked && newProgress >= targetValue) {
      unlocked = true;
      rewards = def.rewards;

      if (rewards?.currency) {
        for (const [code, amount] of Object.entries(rewards.currency as Record<string, number>)) {
          await grantCurrency(playerId, code, amount, `achievement:${achievementId}`);
        }
      }
      if (rewards?.items && Array.isArray(rewards.items)) {
        for (const itemId of rewards.items as string[]) {
          await grantItem(playerId, itemId, 1, undefined, undefined, `achievement:${achievementId}`);
        }
      }

      await trackEvent('achievement_unlock', playerId, undefined, { achievementId, displayName: def.display_name });
    }
  });

  return { unlocked, rewards: unlocked ? rewards : undefined };
}
