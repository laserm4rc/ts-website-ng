import { listAllNews, getNews, createNews, updateNews, deleteNews } from '../services/news.js';
import { str, toId } from '../utils/helpers.js';

const LIMITS = { title: 150, summary: 1000, content: 50000 };

const NOTICES = {
  created: 'admin.news.created',
  saved: 'admin.news.saved',
  deleted: 'admin.news.deleted',
};

function readForm(body = {}) {
  return {
    title: str(body.title),
    summary: str(body.summary),
    content: str(body.content),
    published: body.published === '1',
  };
}

function validate(values, t) {
  const errors = [];
  if (!values.title) errors.push(t('admin.news.errorTitle'));
  else if (values.title.length > LIMITS.title) errors.push(t('admin.news.errorTitleLength', { max: LIMITS.title }));

  if (values.summary.length > LIMITS.summary) {
    errors.push(t('admin.news.errorSummaryLength', { max: LIMITS.summary }));
  }

  if (!values.content) errors.push(t('admin.news.errorContent'));
  else if (values.content.length > LIMITS.content) errors.push(t('admin.news.errorContentLength', { max: LIMITS.content }));

  return errors;
}

function notFound(reply) {
  reply.callNotFound();
  return reply;
}

export default async function adminNewsRoutes(app) {
  // Übersicht
  app.get('/', async (request, reply) => {
    const key = request.query.notice;
    return reply.render('./admin/news-list', {
      title: request.t('news.title'),
      items: listAllNews(),
      notice: Object.hasOwn(NOTICES, key) ? request.t(NOTICES[key]) : null,
    });
  });

  // Neu anlegen
  app.get('/new', async (request, reply) => {
    return reply.render('./admin/news-form', {
      title: request.t('admin.news.new'),
      isNew: true,
      values: { title: '', summary: '', content: '', published: true },
      errors: [],
    });
  });

  app.post('/', async (request, reply) => {
    const values = readForm(request.body);
    const errors = validate(values, request.t);
    if (errors.length > 0) {
      return reply.code(400).render('./admin/news-form', { title: request.t('admin.news.new'), isNew: true, values, errors });
    }

    createNews({ ...values, authorId: request.user.id });
    return reply.redirect('/admin/news?notice=created', 303);
  });

  // Bearbeiten
  app.get('/:id/edit', async (request, reply) => {
    const id = toId(request.params.id);
    const post = id ? getNews(id, { includeDrafts: true }) : null;
    if (!post) return notFound(reply);

    return reply.render('./admin/news-form', {
      title: request.t('admin.news.edit'),
      isNew: false,
      id,
      values: {
        title: post.title,
        summary: post.summary ?? '',
        content: post.content,
        published: Boolean(post.published),
      },
      errors: [],
    });
  });

  app.post('/:id', async (request, reply) => {
    const id = toId(request.params.id);
    if (!id || !getNews(id, { includeDrafts: true })) return notFound(reply);

    const values = readForm(request.body);
    const errors = validate(values, request.t);
    if (errors.length > 0) {
      return reply.code(400).render('./admin/news-form', { title: request.t('admin.news.edit'), isNew: false, id, values, errors });
    }

    updateNews(id, values);
    return reply.redirect('/admin/news?notice=saved', 303);
  });

  // Löschen
  app.post('/:id/delete', async (request, reply) => {
    const id = toId(request.params.id);
    if (!id || !deleteNews(id)) return notFound(reply);
    return reply.redirect('/admin/news?notice=deleted', 303);
  });
}
