-- Add recovery mechanism for custom-ID accounts created before the secret requirement
-- This allows players to link an email and set a new secret to recover their account

ALTER TABLE players ADD COLUMN recovery_email VARCHAR(255);
ALTER TABLE players ADD COLUMN recovery_email_verified BOOLEAN DEFAULT false;
ALTER TABLE players ADD COLUMN recovery_token_hash VARCHAR(128);
ALTER TABLE players ADD COLUMN recovery_token_expires_at TIMESTAMPTZ;

CREATE INDEX idx_players_recovery_email ON players(recovery_email) WHERE recovery_email IS NOT NULL;
