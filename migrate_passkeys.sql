-- Credentials belong to individual family accounts, never the shared data user.
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES family_accounts(account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_passkeys_account ON passkeys(account_id);
CREATE TABLE IF NOT EXISTS passkey_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  ceremony TEXT NOT NULL CHECK (ceremony IN ('register', 'login')),
  account_id TEXT,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES family_accounts(account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expiry ON passkey_challenges(expires_at);
