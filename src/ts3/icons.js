import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { query } from './connection.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const ICON_DIR = path.join(config.paths.data, 'icons');
const MAX_ICON_BYTES = 512 * 1024;
const TRANSFER_TIMEOUT_MS = 10_000;
const MISSING_RETRY_MS = 10 * 60 * 1000;

const missing = new Map(); // id -> Zeitpunkt des nächsten Versuchs
const pending = new Map(); // id -> Promise
let nextTransferId = 1;

/** Erkennt den Bildtyp am Dateianfang. SVG wird bewusst nicht akzeptiert. */
function detectImageType(data) {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png';
  if (data.length >= 4 && data.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Holt eine Datei über den TS3-Dateitransfer-Port. */
function transferFile({ host, port, key, size }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks = [];
    let received = 0;

    socket.setTimeout(TRANSFER_TIMEOUT_MS);
    socket.on('connect', () => socket.write(key));
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      received += chunk.length;
      if (received >= size) socket.end();
    });
    socket.on('timeout', () => socket.destroy(new Error('Zeitüberschreitung beim Dateitransfer')));
    socket.on('error', reject);
    socket.on('close', () => {
      if (received >= size) resolve(Buffer.concat(chunks).subarray(0, size));
      else reject(new Error('Dateitransfer unvollständig'));
    });
  });
}

async function readFromDisk(id) {
  try {
    return await fs.readFile(path.join(ICON_DIR, String(id)));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function downloadIcon(id) {
  const [info] = await query('ftinitdownload', {
    clientftfid: nextTransferId++,
    name: `/icon_${id}`,
    cid: 0,
    cpw: '',
    seekpos: 0,
  });

  if (!info?.ftkey) throw new Error('Datei auf dem Server nicht gefunden');

  const size = Number.parseInt(info.size ?? '0', 10);
  if (size <= 0 || size > MAX_ICON_BYTES) throw new Error(`Ungültige Dateigröße: ${size}`);

  const data = await transferFile({
    host: config.ts3.host,
    port: Number.parseInt(info.port, 10),
    key: info.ftkey,
    size,
  });

  if (!detectImageType(data)) throw new Error('Kein unterstütztes Bildformat');

  // Die Icon-ID ist eine Prüfsumme des Inhalts, die Datei ändert sich also nie
  await fs.mkdir(ICON_DIR, { recursive: true });
  await fs.writeFile(path.join(ICON_DIR, String(id)), data);
  return data;
}

/** Liefert { data, type } oder null. */
export async function getIcon(id) {
  const stored = await readFromDisk(id);
  if (stored) {
    const type = detectImageType(stored);
    return type ? { data: stored, type } : null;
  }

  if ((missing.get(id) ?? 0) > Date.now()) return null;

  if (!pending.has(id)) {
    const download = downloadIcon(id)
      .catch((err) => {
        logger.debug(`Icon ${id} konnte nicht geladen werden: ${err.message}`);
        missing.set(id, Date.now() + MISSING_RETRY_MS);
        return null;
      })
      .finally(() => pending.delete(id));
    pending.set(id, download);
  }

  const data = await pending.get(id);
  return data ? { data, type: detectImageType(data) } : null;
}