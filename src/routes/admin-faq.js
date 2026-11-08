import { listFaq, getFaq, createFaq, updateFaq, deleteFaq, moveFaq } from '../services/faq.js';
import { str, toId } from '../utils/helpers.js';

const LIMITS = { question: 200, answer: 10000 };

const NOTICES = {
  created: 'admin.faq.created',
  saved: 'admin.faq.saved',
  deleted: 'admin.faq.deleted',
};

function readForm(body = {}) {
  return { question: str(body.question), answer: str(body.answer) };
}

function validate(values, t) {
  const errors = [];
  if (!values.question) errors.push(t('admin.faq.errorQuestion'));
  else if (values.question.length > LIMITS.question) errors.push(t('admin.faq.errorQuestionLength', { max: LIMITS.question }));

  if (!values.answer) errors.push(t('admin.faq.errorAnswer'));
  else if (values.answer.length > LIMITS.answer) errors.push(t('admin.faq.errorAnswerLength', { max: LIMITS.answer }));

  return errors;
}

function notFound(reply) {
  reply.callNotFound();
  return reply;
}

export default async function adminFaqRoutes(app) {
  // Übersicht
  app.get('/', async (request, reply) => {
    const key = request.query.notice;
    return reply.render('./admin/faq-list', {
      title: request.t('admin.faq.title'),
      items: listFaq(),
      notice: Object.hasOwn(NOTICES, key) ? request.t(NOTICES[key]) : null,
    });
  });

  // Neu anlegen
  app.get('/new', async (request, reply) => {
    return reply.render('./admin/faq-form', {
      title: request.t('admin.faq.new'),
      isNew: true,
      values: { question: '', answer: '' },
      errors: [],
    });
  });

  app.post('/', async (request, reply) => {
    const values = readForm(request.body);
    const errors = validate(values, request.t);
    if (errors.length > 0) {
      return reply.code(400).render('./admin/faq-form', { title: request.t('admin.faq.new'), isNew: true, values, errors });
    }

    createFaq(values);
    return reply.redirect('/admin/faq?notice=created', 303);
  });

  // Bearbeiten
  app.get('/:id/edit', async (request, reply) => {
    const id = toId(request.params.id);
    const item = id ? getFaq(id) : null;
    if (!item) return notFound(reply);

    return reply.render('./admin/faq-form', {
      title: request.t('admin.faq.edit'),
      isNew: false,
      id,
      values: { question: item.question, answer: item.answer },
      errors: [],
    });
  });

  app.post('/:id', async (request, reply) => {
    const id = toId(request.params.id);
    if (!id || !getFaq(id)) return notFound(reply);

    const values = readForm(request.body);
    const errors = validate(values, request.t);
    if (errors.length > 0) {
      return reply.code(400).render('./admin/faq-form', { title: request.t('admin.faq.edit'), isNew: false, id, values, errors });
    }

    updateFaq(id, values);
    return reply.redirect('/admin/faq?notice=saved', 303);
  });

  // Sortieren
  app.post('/:id/move', async (request, reply) => {
    const id = toId(request.params.id);
    if (!id || !getFaq(id)) return notFound(reply);

    moveFaq(id, request.body?.direction === 'up' ? 'up' : 'down');
    return reply.redirect('/admin/faq', 303);
  });

  // Löschen
  app.post('/:id/delete', async (request, reply) => {
    const id = toId(request.params.id);
    if (!id || !deleteFaq(id)) return notFound(reply);
    return reply.redirect('/admin/faq?notice=deleted', 303);
  });
}
