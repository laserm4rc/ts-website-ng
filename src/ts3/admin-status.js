import { query } from './connection.js';
import { getServerStatus } from './status.js';
import { loadServerGroups } from './groups.js';
import { TS3Error } from './query-client.js';
import { cached } from '../cache.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getSetting } from '../services/settings.js';

export const ADMIN_STATUS_CACHE = 'ts3:adminstatus';

const EMPTY_RESULT = 1281;
const STATES = {
  online: { order: 0, labelKey: 'common.online', badge: 'text-bg-success' },
  away: { order: 1, labelKey: 'common.away', badge: 'text-bg-warning' },
  offline: { order: 2, labelKey: 'common.offline', badge: 'text-bg-secondary' },
};

const toInt = (value) => Number.parseInt(value ?? '0', 10) || 0;

async function loadGroupMembers(sgid) {
  try {
    return await query('servergroupclientlist', { sgid }, ['names']);
  } catch (err) {
    if (err instanceof TS3Error && err.id === EMPTY_RESULT) return [];
    throw err;
  }
}

/** Datenbank-ID -> { state, awayMessage } (bei mehreren Verbindungen gewinnt 'online') */
function buildOnlineMap(clientRows) {
  const online = new Map();
  for (const row of clientRows) {
    if (row.client_type !== '0') continue;
    const dbId = toInt(row.client_database_id);
    if (row.client_away !== '1') online.set(dbId, { state: 'online', awayMessage: '' });
    else if (!online.has(dbId)) online.set(dbId, { state: 'away', awayMessage: row.client_away_message ?? '' });
  }
  return online;
}

async function loadAdminStatus(groupIds, hideOffline) {
  const [groups, clientRows] = await Promise.all([loadServerGroups(), query('clientlist', {}, ['away'])]);
  const online = buildOnlineMap(clientRows);

  const selected = groupIds
    .map((id) => groups.get(id))
    .filter(Boolean)
    .sort((a, b) => a.sortId - b.sortId || a.id - b.id);

  const seen = new Set(); // jede Person nur in ihrer ersten Gruppe
  const result = [];

  for (const group of selected) {
    const members = [];

    for (const row of await loadGroupMembers(group.id)) {
      const dbId = toInt(row.cldbid);
      if (!dbId || seen.has(dbId)) continue;
      seen.add(dbId);

      const { state, awayMessage } = online.get(dbId) ?? { state: 'offline', awayMessage: '' };
      if (hideOffline && state === 'offline') continue;

      members.push({ nickname: row.client_nickname || '', state, awayMessage, ...STATES[state] });
    }

    members.sort((a, b) => a.order - b.order || a.nickname.localeCompare(b.nickname, 'en'));
    if (members.length > 0) {
      result.push({ name: group.name, iconId: group.iconId, members });
    }
  }

  return result;
}

/** Liefert immer ein Objekt und wirft nie. */
export async function getAdminStatus() {
  const groupIds = getSetting('adminstatus_groups', []);
  if (groupIds.length === 0) return { enabled: false };

  const status = await getServerStatus();
  if (!status.online) return { enabled: true, online: false, groups: [] };

  try {
    const hideOffline = getSetting('adminstatus_hide_offline', false);
    const groups = await cached(ADMIN_STATUS_CACHE, config.ts3.cacheSeconds * 1000, () =>
      loadAdminStatus(groupIds, hideOffline),
    );
    return { enabled: true, online: true, groups };
  } catch (err) {
    logger.debug(`Admin-Status konnte nicht geladen werden: ${err.message}`);
    return { enabled: true, online: false, groups: [] };
  }
}