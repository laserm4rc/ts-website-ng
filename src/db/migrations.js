// Datenbank-Migrationen. Index 0 = Version 1, Index 1 = Version 2, ...
// WICHTIG: Bestehende Einträge niemals ändern, nur neue anhängen!

export const migrations = [
  // Version 1: Einstellungen, Benutzer, Sessions
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX idx_sessions_expires ON sessions(expires_at);
  `,

    // Version 2: News
  `
  CREATE TABLE news (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL,
    summary    TEXT,
    content    TEXT NOT NULL,
    author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    published  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE INDEX idx_news_published_created ON news(published, created_at DESC);
  `,
];