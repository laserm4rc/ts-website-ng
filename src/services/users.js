import { db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../auth/password.js';

export function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

export function findUserById(id) {
  return (
    db.prepare('SELECT id, username, created_at, last_login_at, ts_uid, ts_nickname FROM users WHERE id = ?').get(id) ?? null
  );
}

export function findUserByUsername(username) {
  return db.prepare('SELECT id, username, ts_uid FROM users WHERE username = ?').get(username) ?? null;
}

export function recordLogin(id) {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
}

/** Ist diese TeamSpeak-Identität schon mit einem anderen Admin-Konto verbunden? */
export function isTsUidTaken(uid, userId) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE ts_uid = ? AND id != ?').get(uid, userId));
}

export function linkTeamSpeak(id, { uid, nickname }) {
  db.prepare('UPDATE users SET ts_uid = ?, ts_nickname = ? WHERE id = ?').run(uid, nickname, id);
}

export function unlinkTeamSpeak(id) {
  db.prepare('UPDATE users SET ts_uid = NULL, ts_nickname = NULL WHERE id = ?').run(id);
}

export async function createUser(username, password) {
  const passwordHash = await hashPassword(password);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  return Number(result.lastInsertRowid);
}

/** Prüft Login-Daten. Gibt den Benutzer zurück oder null. */
export async function authenticate(username, password) {
  const row = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username);
  if (!row) {
    await hashPassword(password); // gleiche Antwortzeit, egal ob der Name existiert
    return null;
  }
  if (!(await verifyPassword(password, row.password_hash))) return null;

  recordLogin(row.id);
  return findUserById(row.id);
}

export async function verifyUserPassword(id, password) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id);
  return row ? verifyPassword(password, row.password_hash) : false;
}

export async function changePassword(id, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}