CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  reveal_at TEXT NOT NULL
);

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id),
  user_id TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX photos_event_created_idx
ON photos (event_id, created_at);

CREATE INDEX photos_event_user_idx
ON photos (event_id, user_id);

INSERT INTO events (id, name, reveal_at)
VALUES ('saxon-trip', 'Saxon Trip', '2026-11-16T14:00:00.000Z');
