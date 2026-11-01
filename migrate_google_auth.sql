-- Existing list ownership and memberships remain unchanged.
CREATE TABLE IF NOT EXISTS app_users (
  id INTEGER PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT ''
);
