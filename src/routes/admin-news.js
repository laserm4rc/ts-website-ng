import { listAllNews, getNews, createNews, updateNews, deleteNews } from '../services/news.js';
import { str, toId } from '../utils/helpers.js';

const LIMITS = { title: 150, summary: 1000, content: 50000 };

const NOTICES = {
  created: 'News angelegt.',
  saved: 'Änderungen gespeichert.',
  deleted: 'News gelöscht.',
};

function readForm(body = {}) {
  return {
    title: str(body.title),
    summary: str(body.summary),
    content: str(body.content),
    published: body.published === '1',
  };
}

function validate(values) {
  const errors = [];
  if (!values.title) errors.push('Bitte einen Titel angeben.');
  else if (values.title.length > LIMITS.title) errors.push(`Der Titel darf höchstens ${LIMITS.title} Zeichen haben.`);

  if (values.summary.length > LIMITS.summary) {
    errors.push(`Die Kurzfassung darf höchstens ${LIMITS.summary} Zeichen haben.`);
  }

  if (!values.content) errors.push('Bitte einen Text angeben.');
  else if (values.content.length > LIMITS.content) errors.push(`Der Text darf höchstens ${LIMITS.content} Zeichen haben.`);

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
      title: 'News',
      items: listAllNews(),
      notice: Object.hasOwn(NOTICES, key) ? NOTICES[key] : null,
    });
  });

  // Neu anlegen
  app.get('/new', async (request, reply) => {
    return reply.render('./admin/news-form', {
      title: 'Neue News',
      isNew: true,
      values: { title: '', summary: '', content: '', published: true },
      errors: [],
    });
  });

  app.post('/', async (request, reply) => {
    const values = readForm(request.body);
    const errors = validate(values);
    if (errors.length > 0) {
      return reply.code(400).render('./admin/news-form', { title: 'Neue News', isNew: true, values, errors });
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
      title: 'News bearbeiten',
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
    const errors = validate(values);
    if (errors.length > 0) {
      return reply.code(400).render('./admin/news-form', { title: 'News bearbeiten', isNew: false, id, values, errors });
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