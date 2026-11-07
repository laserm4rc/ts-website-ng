import { db } from '../db/index.js';

// Einstellungen als Schlüssel/Wert (JSON) mit kleinem Cache
const cache = new Map();

export function getSetting(key, fallback = null) {
  if (cache.has(key)) return cache.get(key);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  const value = JSON.parse(row.value);
  cache.set(key, value);
  return value;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
  cache.set(key, value);
}