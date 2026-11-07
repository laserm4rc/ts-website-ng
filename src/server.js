import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Eta } from 'eta';
import { config } from './config.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildServer() {
  const app = Fastify({
    trustProxy: config.trustProxy,
    disableRequestLogging: true,
    logger: {
      level: config.logLevel,
      // Lesbare Log-Ausgabe statt JSON-Zeilen
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    },
  });

  // Template-Engine (im Development ohne Cache, damit Änderungen sofort sichtbar sind)
  const eta = new Eta({
    views: path.join(rootDir, 'views'),
    cache: config.isProduction,
  });

  // reply.render('./seite', { ... }) rendert ein Template als HTML-Antwort
  app.decorateReply('render', function (template, data = {}) {
    const html = eta.render(template, { ...data, site: config.site });
    return this.type('text/html; charset=utf-8').send(html);
  });

  // Statische Dateien (CSS, Bilder, JS) unter /static/
  await app.register(fastifyStatic, {
    root: path.join(rootDir, 'public'),
    prefix: '/static/',
  });

  // --- Routen ---
  app.get('/', async (request, reply) => {
    return reply.render('./index', {
      title: 'Startseite',
      visitorIp: request.ip,
    });
  });

  app.get('/health', async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
  }));

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).render('./404', { title: 'Seite nicht gefunden' });
  });

  return app;
}