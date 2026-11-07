import { config } from '../config.js';
import { createSession, getSession, deleteSession } from '../services/sessions.js';
import { safeEqual } from '../utils/helpers.js';

export const SESSION_COOKIE = 'tsw_session';

/** onRequest-Hook: hängt request.session und request.user an. */
export async function loadSession(request) {
  if (request.url.startsWith('/static/')) return;
  const session = getSession(request.cookies[SESSION_COOKIE]);
  request.session = session;
  request.user = session?.user ?? null;
}

export function startSession(reply, userId) {
  const { token, expiresAt } = createSession(userId);
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    expires: new Date(expiresAt),
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

/** preHandler für den Admin-Bereich: Login erzwingen, Formulare prüfen. */
export async function requireAdmin(request, reply) {
  if (!request.user) {
    return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`);
  }
  if (request.method === 'POST' && !checkCsrf(request)) {
    return reply.code(403).send('Ungültiges Formular-Token. Bitte lade die Seite neu und versuche es erneut.');
  }
}