import { buildServer } from './src/server.js';
import { config } from './src/config.js';
import { isSetupComplete, getSetupToken } from './src/setup.js';

const app = await buildServer();

try {
  await app.listen({ host: config.host, port: config.port });
  // Diese Zeile nutzt Pelican später, um "Server läuft" zu erkennen. Bitte nicht ändern.
  app.log.info(`ts-website-ng bereit auf Port ${config.port}`);

  if (!isSetupComplete()) {
    app.log.warn('------------------------------------------------------------');
    app.log.warn('Ersteinrichtung erforderlich! Öffne die Webseite unter /setup');
    app.log.warn(`Setup-Token: ${getSetupToken()}`);
    app.log.warn('------------------------------------------------------------');
  }
} catch (err) {
  app.log.error(err, 'Start fehlgeschlagen');
  process.exit(1);
}

// Sauber herunterfahren (Strg+C lokal, Stop-Button später in Pelican)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    app.log.info(`${signal} empfangen, fahre herunter...`);
    await app.close();
    process.exit(0);
  });
}