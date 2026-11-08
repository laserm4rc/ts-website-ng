import { query } from './connection.js';

const toInt = (value) => Number.parseInt(value ?? '0', 10) || 0;

/** Alle verbundenen Personen (ohne Query-Clients). Immer aktuell, nie aus dem Cache. */
export async function listConnectedClients() {
  const rows = await query('clientlist', {}, ['uid']);
  return rows
    .filter((row) => row.client_type === '0')
    .map((row) => ({
      clid: toInt(row.clid),
      uid: row.client_unique_identifier,
      nickname: row.client_nickname,
    }));
}

export async function pokeClient(clid, message) {
  await query('clientpoke', { clid, msg: message.slice(0, 100) });
}

/** Schickt die Nachricht an alle Verbindungen dieser Identität. */
export async function pokeUid(uid, message) {
  const clients = (await listConnectedClients()).filter((client) => client.uid === uid);
  for (const client of clients) await pokeClient(client.clid, message);
}
