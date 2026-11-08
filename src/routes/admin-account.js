import { config } from '../config.js';
import {
  findUserById,
  verifyUserPassword,
  changePassword,
  isTsUidTaken,
  linkTeamSpeak,
  unlinkTeamSpeak,
} from '../services/users.js';
import { deleteOtherSessions } from '../services/sessions.js';
import { getSetting } from '../services/settings.js';
import { createLimiter } from '../auth/rate-limit.js';
import {
  createChallenge,
  getChallenge,
  deleteChallenge,
  verifyChallenge,
  setChallengeCookie,
  clearChallengeCookie,
} from '../auth/ts-challenges.js';
import { getServerStatus } from '../ts3/status.js';
import { listConnectedClients, pokeClient } from '../ts3/clients.js';
import { MIN_PASSWORD_LENGTH } from './setup.js';
import { str, toId } from '../utils/helpers.js';

const CHALLENGE_COOKIE = 'tsw_ts_link';

const sendsPerUser = createLimiter({ max: 5, windowMs: 10 * 60 * 1000 });

const NOTICES = {
  linked: 'admin.account.tsLinkedNotice',
  unlinked: 'admin.account.tsUnlinkedNotice',
};

const linkChallenge = (request) =>
  getChallenge(request.cookies[CHALLENGE_COOKIE], { purpose: 'link', userId: request.user.id });

async function renderAccount(request, reply, { errors = [], saved = false, tsNotice = null, tsError = null, code = 200 } = {}) {
  const account = findUserById(request.user.id);
  const ts = { linkedNickname: account.ts_uid ? account.ts_nickname : null, challenge: null, online: true, clients: [] };

  if (!account.ts_uid) {
    const challenge = linkChallenge(request);
    if (challenge) {
      ts.challenge = { nickname: challenge.client.nickname };
    } else if ((await getServerStatus()).online) {
      try {
        ts.clients = (await listConnectedClients()).sort((a, b) => a.nickname.localeCompare(b.nickname));
      } catch (err) {
        request.log.debug(`Clients konnten nicht geladen werden: ${err.message}`);
        ts.online = false;
      }
    } else {
      ts.online = false;
    }
  }

  return reply.code(code).render('./admin/account', {
    title: request.t('admin.account.title'),
    errors,
    saved,
    tsNotice,
    tsError,
    ts,
  });
}

export default async function adminAccountRoutes(app) {
  app.get('/', async (request, reply) => {
    const key = request.query.notice;
    return renderAccount(request, reply, {
      saved: request.query.saved === '1',
      tsNotice: Object.hasOwn(NOTICES, key) ? request.t(NOTICES[key]) : null,
    });
  });

  // --- Passwort ändern ---
  app.post('/', async (request, reply) => {
    const body = request.body ?? {};
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const next = typeof body.newPassword === 'string' ? body.newPassword : '';
    const errors = [];

    if (!(await verifyUserPassword(request.user.id, current))) {
      errors.push(request.t('admin.account.errorCurrent'));
    }
    if (next.length < MIN_PASSWORD_LENGTH || next.length > 256) {
      errors.push(request.t('admin.account.errorNew', { min: MIN_PASSWORD_LENGTH }));
    }
    if (next !== body.newPasswordRepeat) {
      errors.push(request.t('admin.account.errorRepeat'));
    }
    if (errors.length > 0) return renderAccount(request, reply, { errors, code: 400 });

    await changePassword(request.user.id, next);
    deleteOtherSessions(request.user.id, request.session.id); // andere Geräte abmelden
    request.log.info({ username: request.user.username }, 'Admin-Passwort geändert');
    return reply.redirect('/admin/account?saved=1', 303);
  });

  // --- TeamSpeak verbinden, Schritt 1: Code an den gewählten Client schicken ---
  app.post('/ts/send', async (request, reply) => {
    const userId = request.user.id;

    if (sendsPerUser.isBlocked(userId)) {
      return renderAccount(request, reply, { tsError: request.t('login.tsTooMany'), code: 429 });
    }
    sendsPerUser.hit(userId);

    try {
      const clid = toId(request.body?.clid);
      const client = (await listConnectedClients()).find((candidate) => candidate.clid === clid);
      if (!client) {
        return renderAccount(request, reply, { tsError: request.t('admin.account.tsClientGone'), code: 404 });
      }

      const { id, code } = createChallenge({ purpose: 'link', userId, client });
      const site = getSetting('site_name', config.site.name).slice(0, 40);
      await pokeClient(client.clid, request.t('admin.account.tsPoke', { site, code }));

      setChallengeCookie(reply, CHALLENGE_COOKIE, id);
      return reply.redirect('/admin/account', 303);
    } catch (err) {
      request.log.warn(`TS-Verbindung: Code konnte nicht gesendet werden: ${err.message}`);
      return renderAccount(request, reply, { tsError: request.t('admin.account.tsSendFailed'), code: 502 });
    }
  });

  // --- TeamSpeak verbinden, Schritt 2: Code prüfen ---
  app.post('/ts/verify', async (request, reply) => {
    const userId = request.user.id;
    const result = verifyChallenge(
      request.cookies[CHALLENGE_COOKIE],
      { purpose: 'link', userId },
      str(request.body?.code),
    );

    if (result.status === 'wrong') {
      return renderAccount(request, reply, { tsError: request.t('login.tsWrong'), code: 400 });
    }

    clearChallengeCookie(reply, CHALLENGE_COOKIE);
    if (result.status === 'expired') {
      return renderAccount(request, reply, { tsError: request.t('login.tsExpired'), code: 400 });
    }

    const { client } = result.payload;
    if (isTsUidTaken(client.uid, userId)) {
      return renderAccount(request, reply, { tsError: request.t('admin.account.tsAlreadyLinked'), code: 409 });
    }

    linkTeamSpeak(userId, client);
    request.log.info({ username: request.user.username, nickname: client.nickname }, 'TeamSpeak-Account verbunden');
    return reply.redirect('/admin/account?notice=linked', 303);
  });

  app.post('/ts/cancel', async (request, reply) => {
    deleteChallenge(request.cookies[CHALLENGE_COOKIE]);
    clearChallengeCookie(reply, CHALLENGE_COOKIE);
    return reply.redirect('/admin/account', 303);
  });

  app.post('/ts/unlink', async (request, reply) => {
    unlinkTeamSpeak(request.user.id);
    request.log.info({ username: request.user.username }, 'TeamSpeak-Verbindung getrennt');
    return reply.redirect('/admin/account?notice=unlinked', 303);
  });
}
