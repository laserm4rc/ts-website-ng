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
import { purgeExpiredSessions } from './services/sessions.js';
import { loadSession } from './auth/session.js';
import { isSetupComplete } from './setup.js';
import { getServerStatus } from './ts3/status.js';
import { closeQuery } from './ts3/connection.js';
import * as fmt from './utils/format.js';
import { renderMarkdown } from './utils/markdown.js';
import publicRoutes from './routes/public.js';
import setupRoutes from './routes/setup.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';

// Diese Templates zeigen keine Sidebar und brauchen die Team-Box nicht
const NO_SIDEBAR = /^\.\/(admin\/|partials\/|login$|setup$)/;

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

  app.decorateRequest('user', null);
  app.decorateRequest('session', null);

  // reply.render('./seite', { ... }) – stellt allen Templates gemeinsame Daten bereit
  app.decorateReply('render', async function (template, data = {}) {
    const request = this.request;
    const status = await getServerStatus();
    const adminStatus = NO_SIDEBAR.test(template) ? null : await getAdminStatus();
    const html = eta.render(template, {
      ...data,
      site: { name: getSetting('site_name', config.site.name) },
      user: request.user,
      csrf: request.session?.csrfToken ?? '',
      path: request.url.split('?')[0].replace(/\/+$/, '') || '/',
      status,
      adminStatus,
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
    if (url.startsWith('/setup') || url.startsWith('/static/') || url.startsWith('/api/') || url === '/health') return;
    return reply.redirect('/setup');
  });

  // --- Routen ---
  await app.register(publicRoutes);
  await app.register(setupRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes, { prefix: '/admin' });

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).render('./404', { title: 'Seite nicht gefunden' });
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