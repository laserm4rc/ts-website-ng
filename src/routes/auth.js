import { config } from '../config.js';
import { authenticate, findUserByUsername, recordLogin } from '../services/users.js';
import { getSetting } from '../services/settings.js';
import { startSession, endSession, checkCsrf } from '../auth/session.js';
import { createLimiter, isBlocked, registerFailure, resetFailures } from '../auth/rate-limit.js';
import {
  createChallenge,
  getChallenge,
  deleteChallenge,
  verifyChallenge,
  setChallengeCookie,
  clearChallengeCookie,
} from '../auth/ts-challenges.js';
import { getServerStatus } from '../ts3/status.js';
import { pokeUid } from '../ts3/clients.js';
import { str, safeNext } from '../utils/helpers.js';

const CHALLENGE_COOKIE = 'tsw_ts_login';

// Begrenzt Poke-Spam und das Raten von Codes
const sendsPerIp = createLimiter({ max: 5, windowMs: 10 * 60 * 1000 });
const sendsPerUser = createLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

function renderLogin(request, reply, { next, username = '', error = null, code = 200 }) {
  return reply.code(code).render('./login', {
    title: request.t('login.pageTitle'),
    next,
    username,
    error,
    tsChallenge: Boolean(getChallenge(request.cookies[CHALLENGE_COOKIE], { purpose: 'login', ip: request.ip })),
  });
}

export default async function authRoutes(app) {
  app.get('/login', async (request, reply) => {
    const next = safeNext(request.query.next);
    if (request.user) return reply.redirect(next);
    return renderLogin(request, reply, { next });
  });

  app.post('/login', async (request, reply) => {
    const body = request.body ?? {};
    const username = str(body.username);
    const password = typeof body.password === 'string' ? body.password : '';
    const next = safeNext(body.next);
    const ip = request.ip;

    if (isBlocked(ip)) {
      return renderLogin(request, reply, { next, username, error: request.t('login.blocked'), code: 429 });
    }

    const user = await authenticate(username, password);
    if (!user) {
      registerFailure(ip);
      request.log.warn({ username, ip }, 'Fehlgeschlagener Admin-Login');
      return renderLogin(request, reply, { next, username, error: request.t('login.failed'), code: 401 });
    }

    resetFailures(ip);
    startSession(reply, user.id);
    request.log.info({ username: user.username, ip }, 'Admin angemeldet');
    return reply.redirect(next, 303);
  });

  // Anmeldung per TeamSpeak, Schritt 1: Code an den verbundenen Client schicken.
  // Die Antwort ist immer gleich, damit niemand herausfinden kann, welche Konten es gibt.
  app.post('/login/ts/send', async (request, reply) => {
    const body = request.body ?? {};
    const next = safeNext(body.next);
    const ip = request.ip;

    if (isBlocked(ip) || sendsPerIp.isBlocked(ip)) {
      return renderLogin(request, reply, { next, error: request.t('login.tsTooMany'), code: 429 });
    }
    sendsPerIp.hit(ip);

    if (!(await getServerStatus()).online) {
      return renderLogin(request, reply, { next, error: request.t('common.tsUnreachable'), code: 503 });
    }

    const user = findUserByUsername(str(body.username));
    const eligible = Boolean(user?.ts_uid) && !sendsPerUser.isBlocked(user.id);
    const { id, code } = createChallenge({ purpose: 'login', ip, userId: eligible ? user.id : null, next });

    if (eligible) {
      sendsPerUser.hit(user.id);
      const site = getSetting('site_name', config.site.name).slice(0, 40);
      try {
        await pokeUid(user.ts_uid, request.t('login.tsPoke', { site, code }));
      } catch (err) {
        request.log.warn(`TS-Login: Code konnte nicht gesendet werden: ${err.message}`);
      }
    }

    setChallengeCookie(reply, CHALLENGE_COOKIE, id);
    return reply.redirect(`/login?next=${encodeURIComponent(next)}`, 303);
  });

  // Anmeldung per TeamSpeak, Schritt 2: Code prüfen
  app.post('/login/ts/verify', async (request, reply) => {
    const next = safeNext(request.body?.next);
    const ip = request.ip;

    if (isBlocked(ip)) {
      return renderLogin(request, reply, { next, error: request.t('login.blocked'), code: 429 });
    }

    const result = verifyChallenge(
      request.cookies[CHALLENGE_COOKIE],
      { purpose: 'login', ip },
      str(request.body?.code),
    );

    if (result.status === 'ok' && result.payload.userId) {
      resetFailures(ip);
      clearChallengeCookie(reply, CHALLENGE_COOKIE);
      recordLogin(result.payload.userId);
      startSession(reply, result.payload.userId);
      request.log.info({ userId: result.payload.userId, ip }, 'Admin per TeamSpeak angemeldet');
      return reply.redirect(result.payload.next, 303);
    }

    registerFailure(ip);
    request.log.warn({ ip }, 'Fehlgeschlagener Admin-Login per TeamSpeak');

    if (result.status === 'wrong') {
      return renderLogin(request, reply, { next, error: request.t('login.tsWrong'), code: 400 });
    }

    clearChallengeCookie(reply, CHALLENGE_COOKIE);
    return renderLogin(request, reply, { next, error: request.t('login.tsExpired'), code: 400 });
  });

  app.post('/login/ts/cancel', async (request, reply) => {
    deleteChallenge(request.cookies[CHALLENGE_COOKIE]);
    clearChallengeCookie(reply, CHALLENGE_COOKIE);
    return reply.redirect(`/login?next=${encodeURIComponent(safeNext(request.body?.next))}`, 303);
  });

  app.post('/logout', async (request, reply) => {
    if (request.session && checkCsrf(request)) endSession(request, reply);
    return reply.redirect('/', 303);
  });
}
