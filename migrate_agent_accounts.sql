CREATE TABLE IF NOT EXISTS agent_accounts (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'items:write')),
  list_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_accounts_user ON agent_accounts(user_id);
CREATE TABLE IF NOT EXISTS agent_login_attempts (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_attempts_window ON agent_login_attempts(window_start);
