import { query } from './connection.js';
import { getServerStatus } from './status.js';
import { cached } from '../cache.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { loadServerGroups } from './groups.js';

const SPACER_PATTERN = /^\[([lcr*]?)spacer[^\]]*\](.*)$/i;
const SPACER_ALIGN = { '': 'left', l: 'left', c: 'center', r: 'right', '*': 'fill' };

const CLIENT_STATES = {
  away: { icon: 'bi-moon-fill', color: 'text-warning', labelKey: 'common.away' },
  outputMuted: { icon: 'bi-volume-mute-fill', color: 'text-danger', labelKey: 'viewer.outputMuted' },
  inputMuted: { icon: 'bi-mic-mute-fill', color: 'text-danger', labelKey: 'viewer.inputMuted' },
  normal: { icon: 'bi-circle-fill', color: 'text-success', labelKey: 'common.online' },
};

const toInt = (value) => Number.parseInt(value ?? '0', 10) || 0;

/** "[cspacer]Text" wird nur bei Channels auf oberster Ebene zum Spacer. */
function parseSpacer(name, parentId) {
  if (parentId !== 0) return null;
  const match = SPACER_PATTERN.exec(name);
  if (!match) return null;

  const align = SPACER_ALIGN[match[1].toLowerCase()];
  const text = match[2];
  return {
    align,
    // [*spacer] wiederholt den Text über die ganze Breite
    text: align === 'fill' && text ? text.repeat(Math.ceil(200 / text.length)) : text,
  };
}

function mapChannel(row) {
  const parentId = toInt(row.pid);
  const maxClients = toInt(row.channel_maxclients);
  const hasPassword = row.channel_flag_password === '1';
  const isFull = maxClients >= 0 && toInt(row.total_clients) >= maxClients;

  let icon = 'bi-hash';
  if (isFull) icon = 'bi-people-fill';
  if (hasPassword) icon = 'bi-lock-fill';

  return {
    id: toInt(row.cid),
    parentId,
    order: toInt(row.channel_order),
    name: row.channel_name,
    topic: row.channel_topic ?? '',
    isDefault: row.channel_flag_default === '1',
    hasPassword,
    isFull,
    icon,
    spacer: parseSpacer(row.channel_name, parentId),
    clients: [],
    children: [],
  };
}

function clientState(row) {
  if (row.client_away === '1') return CLIENT_STATES.away;
  if (row.client_output_muted === '1' || row.client_output_hardware === '0') return CLIENT_STATES.outputMuted;
  if (row.client_input_muted === '1' || row.client_input_hardware === '0') return CLIENT_STATES.inputMuted;
  return CLIENT_STATES.normal;
}

/** Bewusst nur Anzeigedaten: keine IPs, keine Unique-IDs. */
function mapClient(row, serverGroups) {
  const state = clientState(row);
  const isAway = row.client_away === '1';

  const groups = (row.client_servergroups ?? '')
    .split(',')
    .filter(Boolean)
    .map((id) => serverGroups.get(toInt(id)))
    .filter(Boolean)
    .sort((a, b) => a.sortId - b.sortId || a.id - b.id);

  return {
    channelId: toInt(row.cid),
    nickname: row.client_nickname,
    talkPower: toInt(row.client_talk_power),
    icon: state.icon,
    color: state.color,
    // Der Viewer wird sprachneutral zwischengespeichert, übersetzt wird erst im Template
    labelKey: state.labelKey,
    awayMessage: isAway ? (row.client_away_message ?? '') : '',
    isCommander: row.client_is_channel_commander === '1',
    isRecording: row.client_is_recording === '1',
    // Wie im TS-Client: nur Gruppen mit Icon oder Namenszusatz fallen auf
    badges: groups.filter((group) => group.iconId !== 0 || group.nameMode !== 0),
  };
}

/** channel_order zeigt auf den Channel direkt darüber (0 = ganz oben). */
function sortSiblings(channels) {
  const byPrevious = new Map(channels.map((channel) => [channel.order, channel]));
  const sorted = [];
  const seen = new Set();

  let current = byPrevious.get(0);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    sorted.push(current);
    current = byPrevious.get(current.id);
  }

  // Sicherheitsnetz, falls die Kette unvollständig ist
  for (const channel of channels) {
    if (!seen.has(channel.id)) sorted.push(channel);
  }
  return sorted;
}

function buildTree(channels) {
  const byParent = new Map();
  for (const channel of channels) {
    if (!byParent.has(channel.parentId)) byParent.set(channel.parentId, []);
    byParent.get(channel.parentId).push(channel);
  }

  for (const channel of channels) {
    channel.children = sortSiblings(byParent.get(channel.id) ?? []);
  }
  return sortSiblings(byParent.get(0) ?? []);
}

async function loadViewer(serverName) {
  const [channelRows, clientRows, serverGroups] = await Promise.all([
    query('channellist', {}, ['topic', 'flags', 'limits']),
    query('clientlist', {}, ['away', 'voice', 'groups']),
    loadServerGroups(),
  ]);

  const channels = channelRows.map(mapChannel);
  const channelsById = new Map(channels.map((channel) => [channel.id, channel]));

  // client_type 1 = Query-Client (z. B. diese Webseite)
  const clients = clientRows.filter((row) => row.client_type === '0').map((row) => mapClient(row, serverGroups));

  for (const client of clients) {
    channelsById.get(client.channelId)?.clients.push(client);
  }

  // Wie im TS-Client: hohe Talk Power zuerst, dann alphabetisch
  for (const channel of channels) {
    channel.clients.sort((a, b) => b.talkPower - a.talkPower || a.nickname.localeCompare(b.nickname, 'en'));
  }

  return {
    online: true,
    serverName,
    clientCount: clients.length,
    channels: buildTree(channels),
  };
}

/** Liefert immer ein Objekt und wirft nie. */
export async function getViewer() {
  const status = await getServerStatus();
  if (!status.online) return { online: false };

  try {
    return await cached('ts3:viewer', config.ts3.cacheSeconds * 1000, () => loadViewer(status.name));
  } catch (err) {
    logger.debug(`Viewer konnte nicht geladen werden: ${err.message}`);
    return { online: false };
  }
}