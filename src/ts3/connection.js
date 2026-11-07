import { QueryClient } from './query-client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

let connecting = null; // Promise<QueryClient>
let activeClient = null;

async function createConnection() {
  const { host, queryPort, queryUser, queryPassword, serverPort } = config.ts3;
  const client = new QueryClient({ host, port: queryPort });

  try {
    await client.connect();
    await client.send('login', {
      client_login_name: queryUser,
      client_login_password: queryPassword,
    });
    await client.send('use', { port: serverPort });
  } catch (err) {
    client.destroy(err);
    throw err;
  }

  client.on('close', (reason) => {
    if (activeClient !== client) return;
    activeClient = null;
    connecting = null;
    logger.warn(`TS3-ServerQuery getrennt: ${reason.message}`);
  });

  activeClient = client;
  logger.info(`Mit TS3-ServerQuery verbunden (${host}:${queryPort}, Server-Port ${serverPort})`);
  return client;
}

/** Liefert den verbundenen Client und verbindet bei Bedarf neu. */
export function getQueryClient() {
  if (!connecting) {
    const attempt = createConnection();
    connecting = attempt;
    attempt.catch(() => {
      if (connecting === attempt) connecting = null;
    });
  }
  return connecting;
}

/** Kurzform: query('serverinfo'), query('clientlist', {}, ['uid', 'away']) */
export async function query(command, params, options) {
  const client = await getQueryClient();
  return client.send(command, params, options);
}

/** Beim Herunterfahren aufrufen. */
export async function closeQuery() {
  const client = activeClient;
  activeClient = null;
  connecting = null;
  if (client) await client.close();
}