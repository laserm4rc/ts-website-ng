import { query } from './connection.js';
import { cached, setCache } from '../cache.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const CACHE_KEY = 'ts3:status';
const OFFLINE_RETRY_MS = 10_000; // bei Fehler höchstens alle 10 s neu versuchen
let lastError = null;

const toInt = (value) => Number.parseInt(value ?? '0', 10) || 0;
const toFloat = (value) => Number.parseFloat(value ?? '0') || 0;

function connectInfo(port) {
  const host = config.ts3.publicAddress;
  return {
    address: port === 9987 ? host : `${host}:${port}`,
    connectUrl: `ts3server://${host}?port=${port}`,
  };
}

async function loadStatus() {
  const [info] = await query('serverinfo');
  const port = toInt(info.virtualserver_port) || config.ts3.serverPort;

  return {
    online: true,
    name: info.virtualserver_name,
    // Query-Clients (z. B. diese Webseite) nicht mitzählen
    clientsOnline: toInt(info.virtualserver_clientsonline) - toInt(info.virtualserver_queryclientsonline),
    maxClients: toInt(info.virtualserver_maxclients),
    reservedSlots: toInt(info.virtualserver_reserved_slots),
    channels: toInt(info.virtualserver_channelsonline),
    uptime: toInt(info.virtualserver_uptime),
    version: info.virtualserver_version,
    platform: info.virtualserver_platform,
    ping: toFloat(info.virtualserver_total_ping),
    packetLoss: toFloat(info.virtualserver_total_packetloss_total) * 100,
    ...connectInfo(port),
    updatedAt: new Date().toISOString(),
  };
}

/** Liefert immer ein Status-Objekt und wirft nie. Bei Problemen: { online: false, ... } */
export async function getServerStatus() {
  try {
    const status = await cached(CACHE_KEY, config.ts3.cacheSeconds * 1000, loadStatus);
    if (status.online && lastError) {
      logger.info('TS3-Server ist wieder erreichbar');
      lastError = null;
    }
    return status;
  } catch (err) {
    if (lastError !== err.message) {
      logger.warn(`TS3-Status nicht abrufbar: ${err.message}`);
      lastError = err.message;
    }
    const offline = {
      online: false,
      ...connectInfo(config.ts3.serverPort),
      updatedAt: new Date().toISOString(),
    };
    setCache(CACHE_KEY, offline, OFFLINE_RETRY_MS);
    return offline;
  }
}