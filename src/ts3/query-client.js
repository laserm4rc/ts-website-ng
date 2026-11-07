import net from 'node:net';
import { EventEmitter } from 'node:events';

// --- Escaping laut TS3-ServerQuery-Spezifikation ---

const ESCAPES = [
  ['\\', '\\\\'], // Backslash zuerst!
  ['/', '\\/'],
  [' ', '\\s'],
  ['|', '\\p'],
  ['\x07', '\\a'],
  ['\b', '\\b'],
  ['\f', '\\f'],
  ['\n', '\\n'],
  ['\r', '\\r'],
  ['\t', '\\t'],
  ['\v', '\\v'],
];

const UNESCAPES = {
  '\\': '\\', '/': '/', s: ' ', p: '|',
  a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v',
};

export function escape(value) {
  let result = String(value);
  for (const [char, replacement] of ESCAPES) result = result.replaceAll(char, replacement);
  return result;
}

export function unescape(value) {
  return value.replace(/\\(.)/g, (match, char) => UNESCAPES[char] ?? char);
}

/** "a=1 b=2|a=3 b=4" -> [{ a: '1', b: '2' }, { a: '3', b: '4' }] */
export function parseLine(line) {
  if (!line) return [];
  return line.split('|').map((entry) => {
    const item = {};
    for (const part of entry.split(' ')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      if (eq === -1) item[part] = '';
      else item[part.slice(0, eq)] = unescape(part.slice(eq + 1));
    }
    return item;
  });
}

/** Baut eine Befehlszeile, z. B. buildCommand('clientpoke', { clid: 5, msg: 'Hi' }) */
export function buildCommand(command, params = {}, options = []) {
  const parts = [command];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      parts.push(value.map((v) => `${key}=${escape(v)}`).join('|'));
    } else {
      parts.push(`${key}=${escape(value)}`);
    }
  }
  for (const option of options) parts.push(`-${option}`);
  return parts.join(' ');
}

// --- Fehlerklasse ---

export class TS3Error extends Error {
  constructor(id, message, details = {}) {
    const extra = details.extra_msg ? ` (${details.extra_msg})` : '';
    super(`TS3-Fehler ${id}: ${message}${extra}`);
    this.name = 'TS3Error';
    this.id = id;
    this.details = details;
  }
}

// --- Client ---

export class QueryClient extends EventEmitter {
  #socket = null;
  #buffer = '';
  #queue = [];
  #current = null;
  #ready = false;
  #pendingConnect = null;
  #keepAliveTimer = null;

  constructor({ host, port, connectTimeout = 5000, commandTimeout = 10000, keepAliveInterval = 240000 }) {
    super();
    this.options = { host, port, connectTimeout, commandTimeout, keepAliveInterval };
  }

  get isReady() {
    return this.#ready;
  }

  /** Baut die TCP-Verbindung auf und wartet auf die TS3-Begrüßung. */
  connect() {
    if (this.#socket) return Promise.reject(new Error('Client ist bereits verbunden'));

    const { host, port, connectTimeout } = this.options;

    return new Promise((resolve, reject) => {
      this.#pendingConnect = { resolve, reject, sawHeader: false };

      const socket = net.createConnection({ host, port });
      this.#socket = socket;
      socket.setEncoding('utf8');
      socket.setTimeout(connectTimeout);

      socket.on('data', (chunk) => this.#onData(chunk));
      socket.on('timeout', () => this.destroy(new Error(`Zeitüberschreitung bei der Verbindung zu ${host}:${port}`)));
      socket.on('error', (err) => this.destroy(err));
      socket.on('close', () => this.destroy(new Error('Verbindung zum ServerQuery wurde geschlossen')));
    });
  }

  /** Sendet einen Befehl. Antwort: Array von Objekten (leer bei Befehlen ohne Rückgabe). */
  send(command, params = {}, options = []) {
    if (!this.#socket) return Promise.reject(new Error('Nicht mit dem ServerQuery verbunden'));

    return new Promise((resolve, reject) => {
      this.#queue.push({
        command,
        text: buildCommand(command, params, options),
        lines: [],
        timer: null,
        resolve,
        reject,
      });
      this.#next();
    });
  }

  /** Höflich abmelden und Verbindung schließen. */
  async close() {
    if (!this.#socket) return;
    try {
      await this.send('quit');
    } catch {
      // egal, wir schließen sowieso
    }
    this.destroy(new Error('Verbindung geschlossen'));
  }

  /** Verbindung hart beenden und alle offenen Befehle abbrechen. */
  destroy(reason = new Error('Verbindung beendet')) {
    if (!this.#socket) return;

    const socket = this.#socket;
    this.#socket = null;
    this.#ready = false;
    this.#buffer = '';
    clearTimeout(this.#keepAliveTimer);
    socket.destroy();

    if (this.#pendingConnect) {
      this.#pendingConnect.reject(reason);
      this.#pendingConnect = null;
    }

    const open = this.#current ? [this.#current, ...this.#queue] : [...this.#queue];
    this.#current = null;
    this.#queue = [];
    for (const item of open) {
      clearTimeout(item.timer);
      item.reject(reason);
    }

    this.emit('close', reason);
  }

  // --- intern ---

  #onData(chunk) {
    this.#buffer += chunk;
    let index;
    while ((index = this.#buffer.indexOf('\n')) !== -1) {
      const line = this.#buffer.slice(0, index).replaceAll('\r', '').trim();
      this.#buffer = this.#buffer.slice(index + 1);
      if (line) this.#onLine(line);
    }
  }

  #onLine(line) {
    // Begrüßung: Zeile 1 = "TS3", Zeile 2 = Willkommenstext
    if (this.#pendingConnect) {
      if (!this.#pendingConnect.sawHeader) {
        if (line !== 'TS3') {
          this.destroy(new Error('Gegenstelle ist kein TeamSpeak-3-ServerQuery'));
          return;
        }
        this.#pendingConnect.sawHeader = true;
        return;
      }
      const { resolve } = this.#pendingConnect;
      this.#pendingConnect = null;
      this.#ready = true;
      this.#socket.setTimeout(0); // Verbindungs-Timeout gilt nur für den Aufbau
      resolve();
      this.#next();
      return;
    }

    // Benachrichtigungen (nutzen wir später evtl.)
    if (line.startsWith('notify')) {
      this.emit('notification', line);
      return;
    }

    const item = this.#current;
    if (!item) return; // unerwartete Zeile ignorieren

    if (line.startsWith('error ')) {
      clearTimeout(item.timer);
      this.#current = null;

      const [status] = parseLine(line.slice('error '.length));
      if (status.id === '0') {
        item.resolve(parseLine(item.lines.join('|')));
      } else {
        item.reject(new TS3Error(Number(status.id), status.msg ?? 'Unbekannter Fehler', status));
      }

      this.#scheduleKeepAlive();
      this.#next();
      return;
    }

    item.lines.push(line);
  }

  #next() {
    if (!this.#ready || this.#current || this.#queue.length === 0) return;

    const item = this.#queue.shift();
    this.#current = item;
    item.timer = setTimeout(() => {
      this.destroy(new Error(`Zeitüberschreitung beim Befehl "${item.command}"`));
    }, this.options.commandTimeout);

    this.#socket.write(`${item.text}\n`);
  }

  /** TS3 trennt inaktive Query-Verbindungen nach ca. 5 Minuten, daher regelmäßig ein Lebenszeichen. */
  #scheduleKeepAlive() {
    clearTimeout(this.#keepAliveTimer);
    this.#keepAliveTimer = setTimeout(() => {
      this.send('version').catch(() => {});
    }, this.options.keepAliveInterval);
    this.#keepAliveTimer.unref();
  }
}