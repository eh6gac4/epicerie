ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT 'その他';
ALTER TABLE items ADD COLUMN quantity TEXT;
ALTER TABLE items ADD COLUMN unit TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  tg_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  created_at INTEGER NOT NULL,
  UNIQUE(tg_user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(tg_user_id);
