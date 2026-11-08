import adminNewsRoutes from './admin-news.js';
import adminPagesRoutes from './admin-pages.js';
import adminFaqRoutes from './admin-faq.js';
import adminStatusRoutes from './admin-adminstatus.js';

import { config } from '../config.js';
import { requireAdmin } from '../auth/session.js';
import { getSetting, setSetting } from '../services/settings.js';
import { verifyUserPassword, changePassword } from '../services/users.js';
import { deleteOtherSessions } from '../services/sessions.js';
import { MIN_PASSWORD_LENGTH } from './setup.js';
import { str } from '../utils/helpers.js';

export default async function adminRoutes(app) {
  // Alles in diesem Plugin erfordert Login (+ CSRF-Prüfung bei POST)
  app.addHook('preHandler', requireAdmin);
  // Unterbereiche (erben Login-Pflicht und CSRF-Prüfung)
  await app.register(adminNewsRoutes, { prefix: '/news' });
    await app.register(adminStatusRoutes, { prefix: '/adminstatus' });

  // --- Dashboard ---
  app.get('/', async (request, reply) => {
    return reply.render('./admin/dashboard', {
      title: 'Dashboard',
      welcome: request.query.welcome === '1',
    });
  });

  // --- Einstellungen ---
  app.get('/settings', async (request, reply) => {
    return reply.render('./admin/settings', {
      title: 'Einstellungen',
      values: { siteName: getSetting('site_name', config.site.name) },
      errors: [],
      saved: request.query.saved === '1',
    });
  });

  app.post('/settings', async (request, reply) => {
    const values = { siteName: str(request.body?.siteName) };
    const errors = [];

    if (values.siteName.length < 2 || values.siteName.length > 60) {
      errors.push('Der Name der Webseite muss 2–60 Zeichen lang sein.');
    }
    if (errors.length > 0) {
      return reply.code(400).render('./admin/settings', { title: 'Einstellungen', values, errors, saved: false });
    }

    setSetting('site_name', values.siteName);
    return reply.redirect('/admin/settings?saved=1', 303);
  });

  // --- Eigenes Konto (Passwort ändern) ---
  app.get('/account', async (request, reply) => {
    return reply.render('./admin/account', {
      title: 'Mein Konto',
      errors: [],
      saved: request.query.saved === '1',
    });
  });

  app.post('/account', async (request, reply) => {
    const body = request.body ?? {};
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const next = typeof body.newPassword === 'string' ? body.newPassword : '';
    const errors = [];

    if (!(await verifyUserPassword(request.user.id, current))) {
      errors.push('Das aktuelle Passwort ist falsch.');
    }
    if (next.length < MIN_PASSWORD_LENGTH || next.length > 256) {
      errors.push(`Das neue Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
    }
    if (next !== body.newPasswordRepeat) {
      errors.push('Die neuen Passwörter stimmen nicht überein.');
    }
    if (errors.length > 0) {
      return reply.code(400).render('./admin/account', { title: 'Mein Konto', errors, saved: false });
    }

    await changePassword(request.user.id, next);
    deleteOtherSessions(request.user.id, request.session.id); // andere Geräte abmelden
    request.log.info({ username: request.user.username }, 'Admin-Passwort geändert');
    return reply.redirect('/admin/account?saved=1', 303);
  });
}