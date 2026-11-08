import { randomBytes, randomInt } from 'node:crypto';
import { config } from '../config.js';
import { safeEqual } from '../utils/helpers.js';

// Laufende Code-Abfragen per Poke liegen nur im Speicher: Sie gelten ohnehin nur wenige Minuten.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const challenges = new Map(); // id -> { code, payload, attempts, expiresAt }

function removeExpired() {
  const now = Date.now();
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt < now) challenges.delete(id);
  }
}

function matches(payload, expected) {
  return Object.entries(expected).every(([key, value]) => payload[key] === value);
}

/** Legt eine neue Code-Abfrage an. Der Code muss danach per Poke verschickt werden. */
export function createChallenge(payload) {
  removeExpired();
  const id = randomBytes(24).toString('base64url');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  challenges.set(id, { code, payload, attempts: 0, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return { id, code };
}

/** Liefert die Daten der Abfrage, wenn sie gültig ist und zu "expected" passt, sonst null. */
export function getChallenge(id, expected) {
  const challenge = id ? challenges.get(id) : null;
  if (!challenge || !matches(challenge.payload, expected)) return null;
  if (challenge.expiresAt < Date.now()) {
    challenges.delete(id);
    return null;
  }
  return challenge.payload;
}

export function deleteChallenge(id) {
  challenges.delete(id);
}

/** Ergebnis: { status: 'ok', payload } | { status: 'wrong' } | { status: 'expired' } */
export function verifyChallenge(id, expected, code) {
  if (!getChallenge(id, expected)) return { status: 'expired' };
  const challenge = challenges.get(id);

  if (safeEqual(code, challenge.code)) {
    challenges.delete(id);
    return { status: 'ok', payload: challenge.payload };
  }

  challenge.attempts += 1;
  if (challenge.attempts >= MAX_ATTEMPTS) {
    challenges.delete(id);
    return { status: 'expired' };
  }
  return { status: 'wrong' };
}

export function setChallengeCookie(reply, name, id) {
  reply.setCookie(name, id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

export function clearChallengeCookie(reply, name) {
  reply.clearCookie(name, { path: '/' });
}
