-- Preserve one active matchmaking ticket per player and prevent duplicate
-- trusted-server statistic requests from being applied twice.
WITH ranked_tickets AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY created_at, id) AS position
  FROM matchmaking_tickets
  WHERE status = 'searching'
)
UPDATE matchmaking_tickets AS ticket
SET status = 'cancelled'
FROM ranked_tickets
WHERE ticket.id = ranked_tickets.id AND ranked_tickets.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_matchmaking_one_searching_ticket
  ON matchmaking_tickets(player_id) WHERE status = 'searching';

CREATE TABLE IF NOT EXISTS server_idempotency_keys (
  actor_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  PRIMARY KEY (actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_server_idempotency_expiry
  ON server_idempotency_keys(expires_at);
