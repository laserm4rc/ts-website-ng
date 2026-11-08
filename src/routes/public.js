import { getViewer } from '../ts3/viewer.js';
import { getBans } from '../ts3/bans.js';
import { getServerStatus } from '../ts3/status.js';
import { listPublishedNews, getNews } from '../services/news.js';
import { PAGES, getPage } from '../services/pages.js';
import { listFaq } from '../services/faq.js';
import { isSectionVisible, firstVisibleSection } from '../services/sections.js';
import { toId } from '../utils/helpers.js';
import { loadServerGroups } from '../ts3/groups.js';
import { getIcon } from '../ts3/icons.js';

const NEWS_PER_PAGE = 5;

/** Ausgeblendete Bereiche sind für alle nicht erreichbar, auch für eingeloggte Admins. */
function requireSection(id) {
  return async (request, reply) => {
    if (isSectionVisible(id)) return undefined;
    reply.callNotFound();
    return reply;
  };
}

export default async function publicRoutes(app) {
  // --- News-Übersicht (Startseite) ---
  app.get('/', async (request, reply) => {
    if (!isSectionVisible('news')) {
      const first = firstVisibleSection();
      if (first) return reply.redirect(first.path);
      return reply.render('./nothing', { title: request.t('home.emptyTitle') });
    }

    const page = Number.parseInt(request.query.page ?? '1', 10) || 1;
    const news = listPublishedNews({ page, perPage: NEWS_PER_PAGE });
    return reply.render('./index', { title: request.t('news.title'), news });
  });

  // --- Einzelne News (Admins sehen auch Entwürfe) ---
  app.get('/news/:id', { preHandler: requireSection('news') }, async (request, reply) => {
    const id = toId(request.params.id);
    const post = id ? getNews(id, { includeDrafts: Boolean(request.user) }) : null;
    if (!post) {
      reply.callNotFound();
      return reply;
    }
    return reply.render('./news', { title: post.title, post });
  });

  // --- Textseiten (Regeln, Impressum) ---
  for (const [slug, page] of Object.entries(PAGES)) {
    app.get(page.path, { preHandler: requireSection(slug) }, async (request, reply) => {
      return reply.render('./page', { title: request.t(page.titleKey), slug, page: getPage(slug) });
    });
  }

  // --- FAQ ---
  app.get('/faq', { preHandler: requireSection('faq') }, async (request, reply) => {
    return reply.render('./faq', { title: request.t('faq.title'), items: listFaq() });
  });

  // --- API ---
  app.get('/api/status', async () => getServerStatus());

  app.get('/health', async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
  }));

  // --- Server-Viewer ---
  app.get('/viewer', { preHandler: requireSection('viewer') }, async (request, reply) => {
    return reply.render('./viewer', { title: request.t('viewer.title'), viewer: await getViewer() });
  });

  // --- Automatische Aktualisierung einzelner Seitenbereiche ---
  app.get('/viewer/tree', { preHandler: requireSection('viewer') }, async (request, reply) => {
    return reply.render('./partials/viewer-tree', { viewer: await getViewer() });
  });

  app.get('/live/sidebar', async (request, reply) => {
    return reply.render('./partials/sidebar');
  });

  // --- Bannliste ---
  app.get('/bans', { preHandler: requireSection('bans') }, async (request, reply) => {
    const page = Number.parseInt(request.query.page ?? '1', 10) || 1;
    return reply.render('./bans', { title: request.t('bans.title'), bans: await getBans({ page }) });
  });

  // --- Gruppen-Icons (nur Icons, die eine Gruppe wirklich nutzt) ---
  app.get('/ts3-icon/:id', async (request, reply) => {
    const id = toId(request.params.id);
    const groups = await loadServerGroups().catch(() => null);
    const allowed = id !== null && id >= 1000 && groups && [...groups.values()].some((group) => group.iconId === id);
    const icon = allowed ? await getIcon(id) : null;

    if (!icon) return reply.code(404).type('text/plain; charset=utf-8').send('Not found');

    return reply
      .header('Cache-Control', 'public, max-age=604800, immutable')
      .type(icon.type)
      .send(icon.data);
  });
}
