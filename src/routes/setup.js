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
      title: 'Ersteinrichtung',
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

    if (!checkSetupToken(body.setupToken)) {
      errors.push('Das Setup-Token ist falsch. Du findest es in der Konsole.');
    }
    if (values.siteName.length < 2 || values.siteName.length > 60) {
      errors.push('Der Name der Webseite muss 2–60 Zeichen lang sein.');
    }
    if (!USERNAME_PATTERN.test(values.username)) {
      errors.push('Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen sowie _ . -');
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 256) {
      errors.push(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
    }
    if (password !== body.passwordRepeat) {
      errors.push('Die Passwörter stimmen nicht überein.');
    }

    if (errors.length > 0) {
      return reply.code(400).render('./setup', { title: 'Ersteinrichtung', values, errors });
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