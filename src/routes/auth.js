import { authenticate } from '../services/users.js';
import { startSession, endSession, checkCsrf } from '../auth/session.js';
import { isBlocked, registerFailure, resetFailures } from '../auth/rate-limit.js';
import { str, safeNext } from '../utils/helpers.js';

export default async function authRoutes(app) {
  app.get('/login', async (request, reply) => {
    const next = safeNext(request.query.next);
    if (request.user) return reply.redirect(next);
    return reply.render('./login', { title: 'Anmelden', next, username: '', error: null });
  });

  app.post('/login', async (request, reply) => {
    const body = request.body ?? {};
    const username = str(body.username);
    const password = typeof body.password === 'string' ? body.password : '';
    const next = safeNext(body.next);
    const ip = request.ip;

    if (isBlocked(ip)) {
      return reply.code(429).render('./login', {
        title: 'Anmelden', next, username,
        error: 'Zu viele Fehlversuche. Bitte warte 15 Minuten.',
      });
    }

    const user = await authenticate(username, password);
    if (!user) {
      registerFailure(ip);
      request.log.warn({ username, ip }, 'Fehlgeschlagener Admin-Login');
      return reply.code(401).render('./login', {
        title: 'Anmelden', next, username,
        error: 'Benutzername oder Passwort falsch.',
      });
    }

    resetFailures(ip);
    startSession(reply, user.id);
    request.log.info({ username: user.username, ip }, 'Admin angemeldet');
    return reply.redirect(next, 303);
  });

  app.post('/logout', async (request, reply) => {
    if (request.session && checkCsrf(request)) endSession(request, reply);
    return reply.redirect('/', 303);
  });
}