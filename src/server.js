import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import { Eta } from 'eta';
import { config } from './config.js';
import { logger } from './logger.js';
import { closeDb } from './db/index.js';
import { getAdminStatus } from './ts3/admin-status.js';
import { getSetting } from './services/settings.js';
import { getSectionVisibility } from './services/sections.js';
import { purgeExpiredSessions } from './services/sessions.js';
import { loadSession } from './auth/session.js';
import { isSetupComplete } from './setup.js';
import { getServerStatus } from './ts3/status.js';
import { closeQuery } from './ts3/connection.js';
import { translate } from './i18n/index.js';
import { fmt } from './utils/format.js';
import { renderMarkdown } from './utils/markdown.js';
import publicRoutes from './routes/public.js';
import setupRoutes from './routes/setup.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';

// Diese Templates zeigen keine Sidebar und brauchen die Team-Box nicht
const NO_SIDEBAR = /^\.\/(admin\/|partials\/(?!sidebar$)|login$|setup$)/;

// Diese Pfade funktionieren auch, solange die Einrichtung noch nicht abgeschlossen ist
const SETUP_ALLOWED = ['/setup', '/static/', '/vendor/', '/api/'];

// Die Seite lädt so oft nach, wie die Daten vom TS3-Server zwischengespeichert werden
const liveSeconds = Math.max(config.ts3.cacheSeconds, 1);

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.trustProxy,
    // Keine Log-Zeile pro Seitenaufruf, damit die Konsole übersichtlich bleibt
    logController: new Fastify.LogController({ disableRequestLogging: true }),
  });

  // Template-Engine (im Development ohne Cache, damit Änderungen sofort sichtbar sind)
  const eta = new Eta({ views: config.paths.views, cache: config.isProduction });

  // --- Plugins ---
  await app.register(fastifyCookie);
  await app.register(fastifyFormbody);
  await app.register(fastifyStatic, { root: config.paths.public, prefix: '/static/' });

  // Bootstrap kommt aus node_modules statt von einem fremden CDN
  const nodeModules = path.join(config.paths.root, 'node_modules');
  await app.register(fastifyStatic, {
    root: path.join(nodeModules, 'bootstrap', 'dist'),
    prefix: '/vendor/bootstrap/',
    decorateReply: false,
    maxAge: '7d',
  });
  await app.register(fastifyStatic, {
    root: path.join(nodeModules, 'bootstrap-icons', 'font'),
    prefix: '/vendor/bootstrap-icons/',
    decorateReply: false,
    maxAge: '7d',
  });

  app.decorateRequest('user', null);
  app.decorateRequest('session', null);
  app.decorateRequest('t', translate);

  // reply.render('./seite', { ... }) – stellt allen Templates gemeinsame Daten bereit
  app.decorateReply('render', async function (template, data = {}) {
    const request = this.request;
    const status = await getServerStatus();
    const adminStatus = NO_SIDEBAR.test(template) ? null : await getAdminStatus();
    const html = eta.render(template, {
      ...data,
      site: { name: getSetting('site_name', config.site.name) },
      visible: getSectionVisibility(),
      user: request.user,
      csrf: request.session?.csrfToken ?? '',
      path: request.url.split('?')[0].replace(/\/+$/, '') || '/',
      liveSeconds,
      status,
      adminStatus,
      t: translate,
      fmt,
      md: renderMarkdown,
    });
    return this.type('text/html; charset=utf-8').send(html);
  });

  // --- Hooks ---
  app.addHook('onRequest', loadSession);

  // Solange kein Admin existiert, führt jeder Weg zur Einrichtung
  app.addHook('onRequest', async (request, reply) => {
    if (isSetupComplete()) return;
    const url = request.url;
    if (url === '/health' || SETUP_ALLOWED.some((prefix) => url.startsWith(prefix))) return;
    return reply.redirect('/setup');
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
  });

  // --- Routen ---
  await app.register(publicRoutes);
  await app.register(setupRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes, { prefix: '/admin' });

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).render('./404', { title: request.t('notFound.title') });
  });

  // --- Aufräumen ---
  purgeExpiredSessions();
  const purgeTimer = setInterval(purgeExpiredSessions, 60 * 60 * 1000);
  purgeTimer.unref();

  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    await closeQuery();
    closeDb();
  });

  return app;
}
