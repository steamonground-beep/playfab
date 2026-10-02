-- Rayvo Game Backend - Initial Schema
-- Compatible with PostgreSQL 14+ (Supabase)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- PLAYERS & AUTHENTICATION
-- =============================================================================

CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id VARCHAR(32) NOT NULL UNIQUE,
    display_name VARCHAR(64) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    is_guest BOOLEAN NOT NULL DEFAULT false,
    custom_id VARCHAR(128) UNIQUE,
    avatar_url TEXT,
    bio TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_banned BOOLEAN NOT NULL DEFAULT false,
    ban_reason TEXT,
    ban_expires_at TIMESTAMPTZ,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_players_custom_id ON players(custom_id) WHERE custom_id IS NOT NULL;
CREATE INDEX idx_players_display_name ON players(display_name);
CREATE INDEX idx_players_email ON players(email) WHERE email IS NOT NULL;

CREATE TABLE player_linked_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}',
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);

CREATE TABLE player_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(128) NOT NULL UNIQUE,
    access_token_jti VARCHAR(64) NOT NULL,
    device_info JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_player ON player_sessions(player_id);
CREATE INDEX idx_sessions_expires ON player_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE account_recovery_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PLAYER DATA
-- =============================================================================

CREATE TABLE player_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    data_key VARCHAR(128) NOT NULL,
    data_value JSONB NOT NULL DEFAULT '{}',
    visibility VARCHAR(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'readonly')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(player_id, data_key)
);

CREATE INDEX idx_player_data_player ON player_data(player_id);

-- =============================================================================
-- STATISTICS
-- =============================================================================

CREATE TABLE statistic_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stat_key VARCHAR(64) NOT NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    aggregation VARCHAR(16) NOT NULL DEFAULT 'last' CHECK (aggregation IN ('last', 'max', 'min', 'sum')),
    default_value NUMERIC NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    stat_key VARCHAR(64) NOT NULL REFERENCES statistic_definitions(stat_key),
    value NUMERIC NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(player_id, stat_key)
);

CREATE TABLE player_statistic_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    stat_key VARCHAR(64) NOT NULL,
    old_value NUMERIC,
    new_value NUMERIC NOT NULL,
    change_source VARCHAR(64) NOT NULL DEFAULT 'api',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stat_history_player ON player_statistic_history(player_id, stat_key);

-- =============================================================================
-- INVENTORY & ECONOMY
-- =============================================================================

CREATE TABLE catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id VARCHAR(64) NOT NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    description TEXT,
    item_type VARCHAR(32) NOT NULL DEFAULT 'item',
    is_stackable BOOLEAN NOT NULL DEFAULT true,
    max_stack INT NOT NULL DEFAULT 999,
    metadata JSONB DEFAULT '{}',
    category VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE catalog_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id VARCHAR(64) NOT NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    item_ids JSONB NOT NULL DEFAULT '[]',
    prices JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE currency_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_code VARCHAR(32) NOT NULL UNIQUE,
    display_name VARCHAR(64) NOT NULL,
    initial_balance NUMERIC NOT NULL DEFAULT 0,
    max_balance NUMERIC,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    item_id VARCHAR(64) NOT NULL REFERENCES catalog_items(item_id),
    instance_id UUID NOT NULL DEFAULT gen_random_uuid(),
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_player ON player_inventory(player_id);
CREATE INDEX idx_inventory_item ON player_inventory(player_id, item_id);

CREATE TABLE player_currency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    currency_code VARCHAR(32) NOT NULL REFERENCES currency_definitions(currency_code),
    balance NUMERIC NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(player_id, currency_code)
);

CREATE TABLE currency_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    currency_code VARCHAR(32) NOT NULL,
    amount NUMERIC NOT NULL,
    balance_after NUMERIC NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    reference_id VARCHAR(128),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_currency_tx_player ON currency_transactions(player_id, created_at DESC);

-- =============================================================================
-- ACHIEVEMENTS
-- =============================================================================

CREATE TABLE achievement_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    achievement_id VARCHAR(64) NOT NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    description TEXT,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    target_value NUMERIC NOT NULL DEFAULT 1,
    rewards JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    achievement_id VARCHAR(64) NOT NULL REFERENCES achievement_definitions(achievement_id),
    progress NUMERIC NOT NULL DEFAULT 0,
    unlocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(player_id, achievement_id)
);

-- =============================================================================
-- LEADERBOARDS
-- =============================================================================

CREATE TABLE leaderboard_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leaderboard_id VARCHAR(64) NOT NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    stat_key VARCHAR(64) NOT NULL,
    sort_order VARCHAR(4) NOT NULL DEFAULT 'desc' CHECK (sort_order IN ('asc', 'desc')),
    max_entries INT NOT NULL DEFAULT 1000,
    reset_schedule VARCHAR(64),
    season_id VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leaderboard_id VARCHAR(64) NOT NULL REFERENCES leaderboard_definitions(leaderboard_id),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    score NUMERIC NOT NULL DEFAULT 0,
    rank INT,
    season_id VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(leaderboard_id, player_id, season_id)
);

CREATE INDEX idx_leaderboard_rank ON leaderboard_entries(leaderboard_id, season_id, score DESC);

-- =============================================================================
-- SOCIAL
-- =============================================================================

CREATE TABLE friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    to_player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(from_player_id, to_player_id)
);

CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_a_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    player_b_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(player_a_id, player_b_id),
    CHECK (player_a_id < player_b_id)
);

CREATE TABLE player_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

CREATE TABLE player_presence (
    player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- =============================================================================
-- GROUPS / CLANS
-- =============================================================================

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES players(id),
    max_members INT NOT NULL DEFAULT 50,
    metadata JSONB DEFAULT '{}',
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, player_id)
);

CREATE TABLE group_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES players(id),
    invitee_id UUID NOT NULL REFERENCES players(id),
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    UNIQUE(group_id, invitee_id)
);

-- =============================================================================
-- MATCHMAKING & LOBBIES
-- =============================================================================

CREATE TABLE matchmaking_queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name VARCHAR(64) NOT NULL UNIQUE,
    game_mode VARCHAR(64) NOT NULL,
    min_players INT NOT NULL DEFAULT 2,
    max_players INT NOT NULL DEFAULT 8,
    region VARCHAR(32) NOT NULL DEFAULT 'us',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE matchmaking_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id VARCHAR(32) NOT NULL UNIQUE,
    queue_name VARCHAR(64) NOT NULL REFERENCES matchmaking_queues(queue_name),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    party_members JSONB DEFAULT '[]',
    skill_rating NUMERIC DEFAULT 1000,
    region VARCHAR(32) NOT NULL DEFAULT 'us',
    status VARCHAR(16) NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'matched', 'cancelled', 'expired')),
    match_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX idx_mm_tickets_status ON matchmaking_tickets(status, queue_name) WHERE status = 'searching';

CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id VARCHAR(32) NOT NULL UNIQUE,
    queue_name VARCHAR(64) NOT NULL,
    game_mode VARCHAR(64) NOT NULL,
    region VARCHAR(32) NOT NULL,
    player_ids JSONB NOT NULL DEFAULT '[]',
    photon_room_name VARCHAR(128),
    status VARCHAR(16) NOT NULL DEFAULT 'forming' CHECK (status IN ('forming', 'ready', 'in_progress', 'completed', 'cancelled')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

CREATE TABLE lobbies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    owner_id UUID NOT NULL REFERENCES players(id),
    max_players INT NOT NULL DEFAULT 8,
    is_private BOOLEAN NOT NULL DEFAULT false,
    join_code VARCHAR(8) UNIQUE,
    metadata JSONB DEFAULT '{}',
    photon_room_name VARCHAR(128),
    status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'starting', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lobby_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    is_ready BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lobby_id, player_id)
);

CREATE TABLE lobby_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES players(id),
    invitee_id UUID NOT NULL REFERENCES players(id),
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

-- =============================================================================
-- MODERATION
-- =============================================================================

CREATE TABLE moderation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    action_type VARCHAR(32) NOT NULL CHECK (action_type IN ('ban', 'unban', 'mute', 'unmute', 'warn', 'kick')),
    reason TEXT NOT NULL,
    duration_minutes INT,
    expires_at TIMESTAMPTZ,
    admin_id UUID,
    appeal_status VARCHAR(16) DEFAULT 'none' CHECK (appeal_status IN ('none', 'pending', 'approved', 'denied')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_player ON moderation_actions(player_id, created_at DESC);

-- =============================================================================
-- ANALYTICS
-- =============================================================================

CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    session_id UUID,
    properties JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX idx_analytics_player ON analytics_events(player_id, created_at DESC);

-- =============================================================================
-- CLOUD FUNCTIONS
-- =============================================================================

CREATE TABLE cloud_functions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name VARCHAR(64) NOT NULL UNIQUE,
    description TEXT,
    handler_type VARCHAR(32) NOT NULL DEFAULT 'builtin',
    config JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cloud_function_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name VARCHAR(64) NOT NULL,
    player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    input JSONB DEFAULT '{}',
    output JSONB DEFAULT '{}',
    success BOOLEAN NOT NULL,
    error_message TEXT,
    execution_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ADMIN & SECURITY
-- =============================================================================

CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'moderator' CHECK (role IN ('superadmin', 'admin', 'moderator', 'viewer')),
    totp_secret VARCHAR(128),
    totp_enabled BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    key_prefix VARCHAR(12) NOT NULL,
    name VARCHAR(128) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]',
    created_by UUID REFERENCES admin_users(id),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('player', 'admin', 'system', 'api_key')),
    actor_id UUID,
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(64),
    resource_id VARCHAR(128),
    details JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE system_config (
    key VARCHAR(128) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES admin_users(id)
);

CREATE TABLE request_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce VARCHAR(64) NOT NULL UNIQUE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nonces_expires ON request_nonces(expires_at) WHERE used_at IS NULL;

-- =============================================================================
-- PHOTON
-- =============================================================================

CREATE TABLE photon_auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    service_type VARCHAR(16) NOT NULL CHECK (service_type IN ('realtime', 'voice')),
    token_hash VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_photon_auth_player ON photon_auth_tokens(player_id, service_type);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_data_updated_at BEFORE UPDATE ON player_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lobbies_updated_at BEFORE UPDATE ON lobbies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
