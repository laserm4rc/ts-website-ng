import { query } from './connection.js';
import { cached } from '../cache.js';

const GROUPS_TTL_MS = 5 * 60 * 1000; // Gruppen ändern sich selten
const toInt = (value) => Number.parseInt(value ?? '0', 10) || 0;

/** Alle Server-Gruppen als Map: id -> Gruppe. Wirft, wenn der TS3-Server nicht erreichbar ist. */
export function loadServerGroups() {
  return cached('ts3:servergroups', GROUPS_TTL_MS, async () => {
    const rows = await query('servergrouplist');
    return new Map(
      rows.map((row) => [
        toInt(row.sgid),
        {
          id: toInt(row.sgid),
          name: row.name,
          type: toInt(row.type), // 0 = Vorlage, 1 = normal, 2 = Query
          sortId: toInt(row.sortid),
          iconId: toInt(row.iconid) >>> 0, // TS3 liefert Icon-IDs teils negativ
          nameMode: toInt(row.namemode),
        },
      ]),
    );
  });
}