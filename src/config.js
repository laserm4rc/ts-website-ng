import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Zentrale Konfiguration. Alles kommt aus Umgebungsvariablen:
// lokal aus der .env, später auf Pelican aus den Egg-Variablen.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Liest eine Ganzzahl aus einer Umgebungsvariable, leere Werte ergeben den Fallback. */
function int(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  // Immer auf allen Interfaces lauschen (lokal egal, in Docker zwingend nötig)
  host: '0.0.0.0',
  port: int(process.env.SERVER_PORT, 3000),

  isProduction: process.env.NODE_ENV !== 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Erst einschalten, wenn später ein Reverse Proxy oder Cloudflare-Tunnel davor sitzt
  trustProxy: process.env.TRUST_PROXY === '1',

  paths: {
    root: rootDir,
    views: path.join(rootDir, 'views'),
    public: path.join(rootDir, 'public'),
    data: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data'),
  },

  // Sessions / Cookies
  cookieSecure: process.env.COOKIE_SECURE === '1',
  sessionDays: int(process.env.SESSION_DAYS, 7),

  // Nur noch Vorschlag fürs Setup, danach kommt der Name aus der Datenbank
  site: {
    name: process.env.SITE_NAME || 'TeamSpeak Server',
  },

  ts3: {
    host: process.env.TS3_HOST || '127.0.0.1',
    queryPort: int(process.env.TS3_QUERY_PORT, 10011),
    queryUser: process.env.TS3_QUERY_USER || 'serveradmin',
    queryPassword: process.env.TS3_QUERY_PASSWORD || '',
    serverPort: int(process.env.TS3_SERVER_PORT, 9987),
    publicAddress: process.env.TS3_PUBLIC_ADDRESS || process.env.TS3_HOST || '127.0.0.1',
    cacheSeconds: int(process.env.TS3_CACHE_SECONDS, 30),
  },
};