CREATE TABLE IF NOT EXISTS user_logs (
  id TEXT PRIMARY KEY,
  tg_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  list_id TEXT,
  item_id TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_logs_user ON user_logs(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_list ON user_logs(list_id);
