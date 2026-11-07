// Zentrale Konfiguration. Alles kommt aus Umgebungsvariablen:
// lokal aus der .env, später auf Pelican aus den Egg-Variablen.
export const config = {
  // Immer auf allen Interfaces lauschen (lokal egal, in Docker zwingend nötig)
  host: '0.0.0.0',
  port: Number.parseInt(process.env.SERVER_PORT ?? '3000', 10),

  isProduction: process.env.NODE_ENV !== 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',

  // Erst einschalten, wenn später ein Reverse Proxy oder Cloudflare-Tunnel davor sitzt
  trustProxy: process.env.TRUST_PROXY === '1',

  site: {
    name: process.env.SITE_NAME ?? 'TeamSpeak Server',
  },
};