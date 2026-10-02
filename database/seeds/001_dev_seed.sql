-- Development seed data

INSERT INTO currency_definitions (currency_code, display_name, initial_balance) VALUES
    ('GC', 'Gold Coins', 100),
    ('SC', 'Silver Coins', 500)
ON CONFLICT (currency_code) DO NOTHING;

INSERT INTO catalog_items (item_id, display_name, description, item_type, is_stackable, category, metadata) VALUES
    ('sword_basic', 'Basic Sword', 'A starter sword', 'weapon', false, 'weapons', '{"damage": 10}'),
    ('potion_health', 'Health Potion', 'Restores 50 HP', 'consumable', true, 'consumables', '{"heal": 50}'),
    ('shield_iron', 'Iron Shield', 'Basic defense', 'armor', false, 'armor', '{"defense": 15}'),
    ('gem_rare', 'Rare Gem', 'Crafting material', 'material', true, 'materials', '{"rarity": "rare"}')
ON CONFLICT (item_id) DO NOTHING;

INSERT INTO statistic_definitions (stat_key, display_name, aggregation) VALUES
    ('wins', 'Total Wins', 'sum'),
    ('losses', 'Total Losses', 'sum'),
    ('kills', 'Total Kills', 'sum'),
    ('deaths', 'Total Deaths', 'sum'),
    ('high_score', 'High Score', 'max'),
    ('games_played', 'Games Played', 'sum')
ON CONFLICT (stat_key) DO NOTHING;

INSERT INTO achievement_definitions (achievement_id, display_name, description, target_value, rewards, is_hidden) VALUES
    ('first_win', 'First Victory', 'Win your first match', 1, '{"currency": {"GC": 50}}', false),
    ('veteran', 'Veteran', 'Play 100 games', 100, '{"currency": {"GC": 200}, "items": ["gem_rare"]}', false),
    ('secret_finder', 'Secret Finder', 'Find the hidden area', 1, '{"currency": {"SC": 100}}', true)
ON CONFLICT (achievement_id) DO NOTHING;

INSERT INTO leaderboard_definitions (leaderboard_id, display_name, stat_key, sort_order) VALUES
    ('global_wins', 'Global Wins Leaderboard', 'wins', 'desc'),
    ('global_high_score', 'High Score Leaderboard', 'high_score', 'desc')
ON CONFLICT (leaderboard_id) DO NOTHING;

INSERT INTO matchmaking_queues (queue_name, game_mode, min_players, max_players, region) VALUES
    ('default_4v4', 'team_deathmatch', 2, 8, 'us'),
    ('casual_2v2', 'duel', 2, 4, 'us'),
    ('ranked_5v5', 'ranked', 10, 10, 'us')
ON CONFLICT (queue_name) DO NOTHING;

INSERT INTO cloud_functions (function_name, description, handler_type, config) VALUES
    ('GrantDailyReward', 'Grants daily login reward', 'builtin', '{"rewardCurrency": {"GC": 25}}'),
    ('ValidateMatchResult', 'Validates and processes match results', 'builtin', '{}'),
    ('ProcessPurchase', 'Processes catalog purchases server-side', 'builtin', '{}')
ON CONFLICT (function_name) DO NOTHING;

INSERT INTO system_config (key, value) VALUES
    ('photon_realtime_app_id', '""'),
    ('photon_voice_app_id', '""'),
    ('photon_region', '"us"'),
    ('photon_app_version', '"1.0"'),
    ('rate_limits', '{"auth": 20, "api": 100, "admin": 200}')
ON CONFLICT (key) DO NOTHING;

-- Default admin (password: Admin123! - CHANGE IN PRODUCTION)
-- bcrypt hash of Admin123!
INSERT INTO admin_users (username, email, password_hash, role) VALUES
    ('admin', 'admin@rayvo.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G2oQKqKqKqKqKq', 'superadmin')
ON CONFLICT (username) DO NOTHING;
