import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + config.sessionDays * 24 * 60 * 60 * 1000;

  db.prepare('INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    csrfToken,
    expiresAt,
  );
  return { token, expiresAt };
}

export function getSession(token) {
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT s.id, s.csrf_token, s.expires_at, u.id AS user_id, u.username
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(hashToken(token));

  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }

  return {
    id: row.id,
    csrfToken: row.csrf_token,
    user: { id: row.user_id, username: row.username },
  };
}

export function deleteSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

/** Alle anderen Sessions eines Benutzers beenden (z. B. nach Passwortänderung). */
export function deleteOtherSessions(userId, keepSessionId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, keepSessionId);
}

export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}