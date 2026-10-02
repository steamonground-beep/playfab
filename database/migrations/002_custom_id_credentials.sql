-- Custom IDs identify accounts but do not authenticate them. Store a separate
-- password hash so knowing an ID alone cannot take over an existing account.
ALTER TABLE players ADD COLUMN custom_id_secret_hash VARCHAR(255);

