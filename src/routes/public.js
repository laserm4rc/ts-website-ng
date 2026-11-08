import { getServerStatus } from '../ts3/status.js';
import { listPublishedNews, getNews } from '../services/news.js';
import { PAGES, getPage } from '../services/pages.js';
import { listFaq } from '../services/faq.js';
import { toId } from '../utils/helpers.js';

const NEWS_PER_PAGE = 5;

export default async function publicRoutes(app) {
  // --- News-Übersicht (Startseite) ---
  app.get('/', async (request, reply) => {
    const page = Number.parseInt(request.query.page ?? '1', 10) || 1;
    const news = listPublishedNews({ page, perPage: NEWS_PER_PAGE });
    return reply.render('./index', { title: 'News', news });
  });

  // --- Einzelne News (Admins sehen auch Entwürfe) ---
  app.get('/news/:id', async (request, reply) => {
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
    app.get(page.path, async (request, reply) => {
      return reply.render('./page', { title: page.title, slug, page: getPage(slug) });
    });
  }

  // --- FAQ ---
  app.get('/faq', async (request, reply) => {
    return reply.render('./faq', { title: 'FAQ', items: listFaq() });
  });

  // --- API ---
  app.get('/api/status', async () => getServerStatus());

  app.get('/health', async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
  }));
}