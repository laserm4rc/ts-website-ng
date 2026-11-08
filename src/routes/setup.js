import { config } from '../config.js';
import { isSetupComplete, markSetupComplete, checkSetupToken } from '../setup.js';
import { createUser } from '../services/users.js';
import { getSetting, setSetting } from '../services/settings.js';
import { startSession } from '../auth/session.js';
import { str } from '../utils/helpers.js';

export const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 10;

let setupRunning = false;

export default async function setupRoutes(app) {
  app.get('/setup', async (request, reply) => {
    if (isSetupComplete()) return reply.redirect('/');
    return reply.render('./setup', {
      title: request.t('setup.title'),
      minPassword: MIN_PASSWORD_LENGTH,
      values: { siteName: getSetting('site_name', config.site.name), username: '' },
      errors: [],
    });
  });

  app.post('/setup', async (request, reply) => {
    if (isSetupComplete() || setupRunning) return reply.redirect('/', 303);

    const body = request.body ?? {};
    const values = { siteName: str(body.siteName), username: str(body.username) };
    const password = typeof body.password === 'string' ? body.password : '';
    const errors = [];

    if (!checkSetupToken(body.setupToken)) errors.push(request.t('setup.errorToken'));
    if (values.siteName.length < 2 || values.siteName.length > 60) errors.push(request.t('setup.errorSiteName'));
    if (!USERNAME_PATTERN.test(values.username)) errors.push(request.t('setup.errorUsername'));
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 256) {
      errors.push(request.t('setup.errorPassword', { min: MIN_PASSWORD_LENGTH }));
    }
    if (password !== body.passwordRepeat) errors.push(request.t('setup.errorPasswordRepeat'));

    if (errors.length > 0) {
      return reply.code(400).render('./setup', {
        title: request.t('setup.title'),
        minPassword: MIN_PASSWORD_LENGTH,
        values,
        errors,
      });
    }

    setupRunning = true;
    try {
      const userId = await createUser(values.username, password);
      setSetting('site_name', values.siteName);
      markSetupComplete();
      request.log.info({ username: values.username }, 'Ersteinrichtung abgeschlossen, Admin angelegt');
      startSession(reply, userId);
    } finally {
      setupRunning = false;
    }

    return reply.redirect('/admin?welcome=1', 303);
  });
}
