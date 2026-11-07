import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Eta } from 'eta';
import { config } from './config.js';
import { logger } from './logger.js';
import { getServerStatus } from './ts3/status.js';
import { closeQuery } from './ts3/connection.js';
import * as fmt from './utils/format.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.trustProxy,
    disableRequestLogging: true,
  });

  // Template-Engine (im Development ohne Cache, damit Änderungen sofort sichtbar sind)
  const eta = new Eta({
    views: path.join(rootDir, 'views'),
    cache: config.isProduction,
  });

  // reply.render('./seite', { ... }) rendert ein Template inkl. Server-Status für die Sidebar
  app.decorateReply('render', async function (template, data = {}) {
    const status = await getServerStatus();
    const html = eta.render(template, { ...data, site: config.site, status, fmt });
    return this.type('text/html; charset=utf-8').send(html);
  });

  // Statische Dateien (CSS, Bilder, JS) unter /static/
  await app.register(fastifyStatic, {
    root: path.join(rootDir, 'public'),
    prefix: '/static/',
  });

  // --- Seiten ---
  app.get('/', async (request, reply) => {
    return reply.render('./index', {
      title: 'Startseite',
      visitorIp: request.ip,
    });
  });

  // --- API ---
  app.get('/api/status', async () => getServerStatus());

  app.get('/health', async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
  }));

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).render('./404', { title: 'Seite nicht gefunden' });
  });

  // Query-Verbindung beim Herunterfahren sauber schließen
  app.addHook('onClose', async () => {
    await closeQuery();
  });

  return app;
}