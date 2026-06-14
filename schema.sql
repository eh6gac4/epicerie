CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  share_code TEXT UNIQUE NOT NULL,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS list_members (
  list_id TEXT NOT NULL,
  tg_user_id INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (list_id, tg_user_id),
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  added_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  quantity TEXT,
  unit TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  tg_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  created_at INTEGER NOT NULL,
  UNIQUE(tg_user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_items_list ON items(list_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON list_members(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_lists_code ON lists(share_code);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(tg_user_id);
