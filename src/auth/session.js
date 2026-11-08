import { config } from '../config.js';
import { createSession, getSession, deleteSession, touchSession } from '../services/sessions.js';
import { safeEqual } from '../utils/helpers.js';

export const SESSION_COOKIE = 'tsw_session';

/** onRequest-Hook: hängt request.session und request.user an. */
export async function loadSession(request) {
  if (request.url.startsWith('/static/') || request.url.startsWith('/vendor/')) return;
  const session = getSession(request.cookies[SESSION_COOKIE]);
  request.session = session;
  request.user = session?.user ?? null;
}

export function startSession(reply, userId) {
  // Ohne Ablaufdatum im Cookie: Wann die Anmeldung endet, entscheidet allein der Server
  reply.setCookie(SESSION_COOKIE, createSession(userId), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
  });
}

export function endSession(request, reply) {
  deleteSession(request.cookies[SESSION_COOKIE]);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Prüft das versteckte _csrf-Feld eines Formulars gegen die Session. */
export function checkCsrf(request) {
  const expected = request.session?.csrfToken;
  return Boolean(expected) && safeEqual(request.body?._csrf, expected);
}

/** preHandler für den Admin-Bereich: Login erzwingen, Formulare prüfen, Anmeldung verlängern. */
export async function requireAdmin(request, reply) {
  if (!request.user) {
    return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`);
  }
  if (request.method === 'POST' && !checkCsrf(request)) {
    return reply.code(403).type('text/plain; charset=utf-8').send(request.t('common.invalidForm'));
  }

  // Nur hier verlängern: Die öffentlichen Seiten laden alle paar Sekunden von selbst nach
  // und würden die Anmeldung sonst nie ablaufen lassen.
  touchSession(request.session);
}
