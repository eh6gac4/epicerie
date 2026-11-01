-- Enroll the intended existing Telegram users explicitly before the initial data copy.
CREATE TABLE IF NOT EXISTS shared_telegram_users (
  tg_user_id INTEGER PRIMARY KEY CHECK (tg_user_id > 0)
);
CREATE TABLE IF NOT EXISTS data_migrations (
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- Preserve original memberships and owners. A shared membership grants data access.
INSERT OR IGNORE INTO list_members (list_id, tg_user_id, joined_at, archived_at)
SELECT l.id, 0, MIN(lm.joined_at),
       CASE WHEN SUM(CASE WHEN lm.archived_at IS NULL THEN 1 ELSE 0 END) > 0 THEN NULL ELSE MIN(lm.archived_at) END
FROM lists l JOIN list_members lm ON lm.list_id = l.id
WHERE l.created_by IN (SELECT tg_user_id FROM shared_telegram_users)
  AND lm.tg_user_id IN (SELECT tg_user_id FROM shared_telegram_users)
  AND NOT EXISTS (SELECT 1 FROM data_migrations WHERE name = 'shared-workspace-v1')
GROUP BY l.id;

-- Keep the original favorites for rollback. Copy once so deleted shared favorites stay deleted.
INSERT OR IGNORE INTO favorites (id, tg_user_id, name, category, created_at)
SELECT 'shared:' || id, 0, name, category, created_at FROM favorites
WHERE tg_user_id IN (SELECT tg_user_id FROM shared_telegram_users)
  AND NOT EXISTS (SELECT 1 FROM data_migrations WHERE name = 'shared-workspace-v1')
ORDER BY created_at, id;

UPDATE agent_accounts SET user_id = 0
WHERE user_id IN (SELECT tg_user_id FROM shared_telegram_users)
  AND NOT EXISTS (SELECT 1 FROM data_migrations WHERE name = 'shared-workspace-v1');

INSERT OR IGNORE INTO data_migrations (name, applied_at)
SELECT 'shared-workspace-v1', CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM shared_telegram_users);
