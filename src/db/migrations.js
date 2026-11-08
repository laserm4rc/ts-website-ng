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

    // Version 3: Textseiten (Regeln, Impressum) und FAQ
  `
  CREATE TABLE pages (
    slug       TEXT PRIMARY KEY,
    content    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE faq (
    id         INTEGER PRIMARY KEY,
    question   TEXT NOT NULL,
    answer     TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_faq_sort ON faq(sort_order, id);
  `,

  // Version 4: TeamSpeak-Login für Besucher
  `
  CREATE TABLE ts_sessions (
    id                 TEXT PRIMARY KEY,
    client_database_id INTEGER NOT NULL,
    client_uid         TEXT NOT NULL,
    nickname           TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at         INTEGER NOT NULL
  );

  CREATE INDEX idx_ts_sessions_expires ON ts_sessions(expires_at);
  `,

  // Version 5: TeamSpeak-Login und Gruppen-Assigner wurden entfernt
  `
  DROP TABLE IF EXISTS ts_sessions;
  DELETE FROM settings WHERE key = 'assigner_categories';
  `,

  // Version 6: TeamSpeak-Verbindung für Admins, alte langlebige Anmeldungen beenden
  `
  ALTER TABLE users ADD COLUMN ts_uid TEXT;
  ALTER TABLE users ADD COLUMN ts_nickname TEXT;
  CREATE UNIQUE INDEX idx_users_ts_uid ON users(ts_uid) WHERE ts_uid IS NOT NULL;
  DELETE FROM sessions;
  `,
];