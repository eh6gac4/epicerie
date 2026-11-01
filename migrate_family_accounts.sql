-- Separate membership marker: existing password accounts remain agents by default.
CREATE TABLE IF NOT EXISTS family_accounts (
  account_id TEXT PRIMARY KEY,
  FOREIGN KEY (account_id) REFERENCES agent_accounts(id) ON DELETE CASCADE
);
