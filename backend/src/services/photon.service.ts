import { query, queryOne } from '../lib/db';
import { config } from '../config';
import { generateSecureToken, hashToken, signPhotonAuth } from '../lib/crypto';
import { NotFoundError } from '../lib/errors';

export interface PhotonAuthData {
  appId: string;
  userId: string;
  authToken: string;
  region: string;
  appVersion: string;
  serviceType: 'realtime' | 'voice';
}

async function getPhotonConfig(): Promise<{
  realtimeAppId: string;
  voiceAppId: string;
  region: string;
  appVersion: string;
}> {
  const configs = await query<{ key: string; value: unknown }>(
    `SELECT key, value FROM system_config WHERE key IN ('photon_realtime_app_id', 'photon_voice_app_id', 'photon_region', 'photon_app_version')`
  );

  const map = Object.fromEntries(configs.map(c => [c.key, c.value]));

  return {
    realtimeAppId: (map.photon_realtime_app_id as string) || config.photon.realtimeAppId,
    voiceAppId: (map.photon_voice_app_id as string) || config.photon.voiceAppId,
    region: (map.photon_region as string)?.replace(/"/g, '') || config.photon.region,
    appVersion: (map.photon_app_version as string)?.replace(/"/g, '') || config.photon.appVersion,
  };
}

export async function getPhotonRealtimeAuthenticationData(playerId: string, publicId: string): Promise<PhotonAuthData> {
  const photonConfig = await getPhotonConfig();

  if (!photonConfig.realtimeAppId) {
    throw new NotFoundError('Photon Realtime App ID not configured. Set PHOTON_REALTIME_APP_ID environment variable or configure in admin dashboard.');
  }

  const userId = publicId;
  const authToken = signPhotonAuth(userId, config.photonAuthSecret);
  const tokenRaw = generateSecureToken(16);
  const tokenHash = hashToken(tokenRaw);

  await query(
    `INSERT INTO photon_auth_tokens (player_id, service_type, token_hash, user_id, expires_at)
     VALUES ($1, 'realtime', $2, $3, NOW() + INTERVAL '1 hour')`,
    [playerId, tokenHash, userId]
  );

  return {
    appId: photonConfig.realtimeAppId,
    userId,
    authToken: `${authToken}:${tokenRaw}`,
    region: photonConfig.region,
    appVersion: photonConfig.appVersion,
    serviceType: 'realtime',
  };
}

export async function getPhotonVoiceAuthenticationData(playerId: string, publicId: string): Promise<PhotonAuthData> {
  const photonConfig = await getPhotonConfig();

  if (!photonConfig.voiceAppId) {
    throw new NotFoundError('Photon Voice App ID not configured. Set PHOTON_VOICE_APP_ID environment variable or configure in admin dashboard. Do NOT use the Realtime App ID.');
  }

  const userId = publicId;
  const authToken = signPhotonAuth(userId, config.photonAuthSecret);
  const tokenRaw = generateSecureToken(16);
  const tokenHash = hashToken(tokenRaw);

  await query(
    `INSERT INTO photon_auth_tokens (player_id, service_type, token_hash, user_id, expires_at)
     VALUES ($1, 'voice', $2, $3, NOW() + INTERVAL '1 hour')`,
    [playerId, tokenHash, userId]
  );

  return {
    appId: photonConfig.voiceAppId,
    userId,
    authToken: `${authToken}:${tokenRaw}`,
    region: photonConfig.region,
    appVersion: photonConfig.appVersion,
    serviceType: 'voice',
  };
}

export async function validatePhotonAuth(userId: string, authToken: string, serviceType: 'realtime' | 'voice'): Promise<boolean> {
  const [signature, tokenRaw] = authToken.split(':');
  if (!signature || !tokenRaw) return false;

  const expectedSignature = signPhotonAuth(userId, config.photonAuthSecret);
  if (signature !== expectedSignature) return false;

  const tokenHash = hashToken(tokenRaw);
  const token = await queryOne(
    `SELECT id FROM photon_auth_tokens WHERE user_id = $1 AND token_hash = $2 AND service_type = $3
     AND expires_at > NOW() AND used_at IS NULL`,
    [userId, tokenHash, serviceType]
  );

  if (token) {
    await query(`UPDATE photon_auth_tokens SET used_at = NOW() WHERE id = $1`, [(token as { id: string }).id]);
    return true;
  }

  return false;
}

export async function updatePhotonConfig(updates: {
  realtimeAppId?: string;
  voiceAppId?: string;
  region?: string;
  appVersion?: string;
}, adminId?: string): Promise<void> {
  const mappings: Record<string, string | undefined> = {
    photon_realtime_app_id: updates.realtimeAppId,
    photon_voice_app_id: updates.voiceAppId,
    photon_region: updates.region,
    photon_app_version: updates.appVersion,
  };

  for (const [key, value] of Object.entries(mappings)) {
    if (value !== undefined) {
      await query(
        `INSERT INTO system_config (key, value, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3`,
        [key, JSON.stringify(value), adminId]
      );
    }
  }
}

export async function getPhotonConfigForAdmin(): Promise<Record<string, string>> {
  const photonConfig = await getPhotonConfig();
  return {
    realtimeAppId: photonConfig.realtimeAppId,
    voiceAppId: photonConfig.voiceAppId,
    region: photonConfig.region,
    appVersion: photonConfig.appVersion,
  };
}
