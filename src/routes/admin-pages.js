import { PAGES, getPage, savePage } from '../services/pages.js';
import { str } from '../utils/helpers.js';

const MAX_LENGTH = 50000;

function findPage(slug) {
  return Object.hasOwn(PAGES, slug) ? PAGES[slug] : null;
}

function notFound(reply) {
  reply.callNotFound();
  return reply;
}

function editTitle(request, page) {
  return request.t('admin.pages.editTitle', { title: request.t(page.titleKey) });
}

export default async function adminPagesRoutes(app) {
  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params;
    const page = findPage(slug);
    if (!page) return notFound(reply);

    return reply.render('./admin/page-form', {
      title: editTitle(request, page),
      slug,
      page,
      content: getPage(slug)?.content ?? '',
      errors: [],
      saved: request.query.saved === '1',
    });
  });

  app.post('/:slug', async (request, reply) => {
    const { slug } = request.params;
    const page = findPage(slug);
    if (!page) return notFound(reply);

    const content = str(request.body?.content);
    if (content.length > MAX_LENGTH) {
      return reply.code(400).render('./admin/page-form', {
        title: editTitle(request, page),
        slug,
        page,
        content,
        errors: [request.t('admin.pages.errorLength', { max: MAX_LENGTH })],
        saved: false,
      });
    }

    savePage(slug, content);
    return reply.redirect(`/admin/pages/${slug}?saved=1`, 303);
  });
}
