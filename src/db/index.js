import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { migrations } from './migrations.js';

fs.mkdirSync(config.paths.data, { recursive: true });
const dbFile = path.join(config.paths.data, 'website.db');

export const db = new DatabaseSync(dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

/** Führt mehrere Schreibvorgänge atomar aus (alles oder nichts). */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function migrate() {
  const { user_version: current } = db.prepare('PRAGMA user_version').get();

  for (let version = current + 1; version <= migrations.length; version++) {
    transaction(() => {
      db.exec(migrations[version - 1]);
      db.exec(`PRAGMA user_version = ${version}`);
    });
    logger.info(`Datenbank auf Version ${version} aktualisiert`);
  }
}

migrate();

export function closeDb() {
  if (db.isOpen) db.close();
}