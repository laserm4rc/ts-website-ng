import { query } from './connection.js';
import { getServerStatus } from './status.js';
import { TS3Error } from './query-client.js';
import { cached } from '../cache.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const EMPTY_RESULT = 1281; // "database empty result set"
const toInt = (value) => Number.parseInt(value ?? '0', 10) || 0;

async function fetchRows() {
  try {
    return await query('banlist');
  } catch (err) {
    if (err instanceof TS3Error && err.id === EMPTY_RESULT) return [];
    throw err;
  }
}

async function loadBans() {
  const rows = await fetchRows();

  // Ein Bann im TS-Client erzeugt oft mehrere Einträge (IP + UID): zusammenfassen
  const merged = new Map();
  for (const row of rows) {
    const key = [row.created, row.duration, row.invokercldbid, row.reason].join('|');
    const name = row.lastnickname || row.name || '';
    const existing = merged.get(key);

    if (existing) {
      existing.name ||= name;
      continue;
    }

    // Bewusst ohne IP und UID
    merged.set(key, {
      name,
      reason: row.reason ?? '',
      invoker: row.invokername ?? '',
      createdAt: toInt(row.created),
      duration: toInt(row.duration),
    });
  }

  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Liefert immer ein Objekt und wirft nie. Abgelaufene Banns werden ausgefiltert. */
export async function getBans({ page = 1, perPage = 25 } = {}) {
  const status = await getServerStatus();
  if (!status.online) return { online: false, items: [], page: 1, pages: 1, total: 0 };

  try {
    const all = await cached('ts3:bans', config.ts3.cacheSeconds * 1000, loadBans);
    const now = Math.floor(Date.now() / 1000);

    const active = all
      .filter((ban) => ban.duration === 0 || ban.createdAt + ban.duration > now)
      .map((ban) => ({
        ...ban,
        permanent: ban.duration === 0,
        remaining: ban.duration === 0 ? 0 : ban.createdAt + ban.duration - now,
      }));

    const pages = Math.max(1, Math.ceil(active.length / perPage));
    const current = Math.min(Math.max(1, page), pages);

    return {
      online: true,
      items: active.slice((current - 1) * perPage, current * perPage),
      page: current,
      pages,
      total: active.length,
    };
  } catch (err) {
    logger.debug(`Bannliste konnte nicht geladen werden: ${err.message}`);
    return { online: false, items: [], page: 1, pages: 1, total: 0 };
  }
}