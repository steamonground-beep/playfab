import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  withTransaction: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  hashToken: vi.fn(),
  generatePublicId: vi.fn(),
  generateSecureToken: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  getRefreshExpiryDate: vi.fn(),
  logAudit: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  query: mocks.query,
  queryOne: mocks.queryOne,
  withTransaction: mocks.withTransaction,
}));
vi.mock('../lib/crypto', () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
  hashToken: mocks.hashToken,
  generatePublicId: mocks.generatePublicId,
  generateSecureToken: mocks.generateSecureToken,
}));
vi.mock('../lib/jwt', () => ({
  signAccessToken: mocks.signAccessToken,
  signRefreshToken: mocks.signRefreshToken,
  verifyRefreshToken: mocks.verifyRefreshToken,
  getRefreshExpiryDate: mocks.getRefreshExpiryDate,
}));
vi.mock('./audit.service', () => ({ logAudit: mocks.logAudit }));
vi.mock('./analytics.service', () => ({ trackEvent: mocks.trackEvent }));

import { loginRayvoCustomIDNoPCVR } from './auth.service';

const player = {
  id: 'internal-id',
  public_id: 'public-id',
  display_name: 'Example',
  email: null,
  password_hash: null,
  custom_id: 'player-abc',
  custom_id_secret_hash: '$bcrypt-hash',
  is_guest: false,
  is_active: true,
  is_banned: false,
  ban_reason: null,
  ban_expires_at: null,
  failed_login_attempts: 0,
  locked_until: null,
  created_at: new Date(),
  last_login_at: null,
};

const customId = 'player-abc';
const customSecret = 'a-random-per-account-credential-at-least-32';

describe('custom ID authentication', () => {
  let clientQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clientQuery = vi.fn().mockResolvedValue({ rows: [] });
    mocks.withTransaction.mockImplementation((callback: (client: unknown) => unknown) => callback({ query: clientQuery }));
    mocks.query.mockResolvedValue([]);
    mocks.hashPassword.mockResolvedValue('$new-bcrypt-hash');
    mocks.hashToken.mockReturnValue('token-hash');
    mocks.generatePublicId.mockReturnValue('PUBLIC123');
    mocks.signAccessToken.mockReturnValue({ token: 'access-token', jti: 'access-jti' });
    mocks.signRefreshToken.mockReturnValue('refresh-token');
    mocks.verifyRefreshToken.mockReturnValue({ sub: player.id, sessionId: 'session-old' });
    mocks.getRefreshExpiryDate.mockReturnValue(new Date(Date.now() + 86400000));
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.trackEvent.mockResolvedValue(undefined);
  });

  it('rejects credentials shorter than 32 characters before database access', async () => {
    await expect(loginRayvoCustomIDNoPCVR(customId, 'too-short')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it('fails closed for a pre-migration account without a credential hash', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ ...player, custom_id_secret_hash: null }] });
    await expect(loginRayvoCustomIDNoPCVR(customId, customSecret)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mocks.signAccessToken).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('failed_login_attempts'), expect.any(Array));
  });

  it('rejects a wrong credential and records a failed attempt', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [player] });
    mocks.verifyPassword.mockResolvedValue(false);
    await expect(loginRayvoCustomIDNoPCVR(customId, customSecret)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mocks.verifyPassword).toHaveBeenCalledWith(customSecret, player.custom_id_secret_hash);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('failed_login_attempts'), expect.any(Array));
    expect(mocks.signAccessToken).not.toHaveBeenCalled();
  });

  it('creates an account with a bcrypt hash and never stores the raw credential', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...player, custom_id_secret_hash: '$new-bcrypt-hash' }] })
      .mockResolvedValue({ rows: [] });
    const result = await loginRayvoCustomIDNoPCVR(customId, customSecret, 'Example', true);
    expect(mocks.hashPassword).toHaveBeenCalledWith(customSecret);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('custom_id_secret_hash'),
      ['PUBLIC123', 'Example', customId, '$new-bcrypt-hash']
    );
    expect(result.accessToken).toBe('access-token');
  });

  it('rotates refresh tokens into a new session row and binds them to the prior session', async () => {
    mocks.queryOne.mockResolvedValue(null);
    clientQuery
      .mockResolvedValueOnce({ rows: [{ id: 'session-old', player_id: player.id, revoked_at: null, expires_at: new Date(Date.now() + 60000) }] })
      .mockResolvedValueOnce({ rows: [player] })
      .mockResolvedValue({ rows: [] });
    mocks.signRefreshToken.mockReturnValue('rotated-refresh-token');

    const result = await (await import('./auth.service')).refreshAccessToken('old-refresh-token');

    expect(clientQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('FOR UPDATE'), ['session-old', player.id, 'token-hash']);
    expect(clientQuery).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE player_sessions'), ['session-old']);
    expect(clientQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO player_sessions'),
      [expect.not.stringMatching('session-old'), player.id, 'token-hash', 'access-jti', undefined, undefined, expect.any(Date)]
    );
    expect(result.refreshToken).toBe('rotated-refresh-token');
  });
});
