import adminNewsRoutes from './admin-news.js';
import adminPagesRoutes from './admin-pages.js';
import adminFaqRoutes from './admin-faq.js';
import adminStatusRoutes from './admin-adminstatus.js';
import adminAccountRoutes from './admin-account.js';

import { config } from '../config.js';
import { requireAdmin } from '../auth/session.js';
import { getSetting, setSetting } from '../services/settings.js';
import { SECTIONS, getSectionVisibility, saveVisibleSections } from '../services/sections.js';
import { str } from '../utils/helpers.js';

export default async function adminRoutes(app) {
  // Alles in diesem Plugin erfordert Login (+ CSRF-Prüfung bei POST)
  app.addHook('preHandler', requireAdmin);

  // Unterbereiche (erben Login-Pflicht und CSRF-Prüfung)
  await app.register(adminNewsRoutes, { prefix: '/news' });
  await app.register(adminPagesRoutes, { prefix: '/pages' });
  await app.register(adminFaqRoutes, { prefix: '/faq' });
  await app.register(adminStatusRoutes, { prefix: '/adminstatus' });
  await app.register(adminAccountRoutes, { prefix: '/account' });

  // --- Dashboard ---
  app.get('/', async (request, reply) => {
    return reply.render('./admin/dashboard', {
      title: request.t('admin.nav.dashboard'),
      welcome: request.query.welcome === '1',
    });
  });

  // --- Einstellungen ---
  app.get('/settings', async (request, reply) => {
    return reply.render('./admin/settings', {
      title: request.t('admin.settings.title'),
      values: { siteName: getSetting('site_name', config.site.name) },
      sections: SECTIONS,
      sectionVisibility: getSectionVisibility(),
      errors: [],
      saved: request.query.saved === '1',
    });
  });

  app.post('/settings', async (request, reply) => {
    const values = { siteName: str(request.body?.siteName) };
    const visibleIds = [].concat(request.body?.sections ?? []);
    const errors = [];

    if (values.siteName.length < 2 || values.siteName.length > 60) {
      errors.push(request.t('setup.errorSiteName'));
    }
    if (errors.length > 0) {
      return reply.code(400).render('./admin/settings', {
        title: request.t('admin.settings.title'),
        values,
        sections: SECTIONS,
        sectionVisibility: Object.fromEntries(SECTIONS.map(({ id }) => [id, visibleIds.includes(id)])),
        errors,
        saved: false,
      });
    }

    setSetting('site_name', values.siteName);
    saveVisibleSections(visibleIds);
    return reply.redirect('/admin/settings?saved=1', 303);
  });
}
