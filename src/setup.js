import { randomBytes } from 'node:crypto';
import { countUsers } from './services/users.js';
import { safeEqual } from './utils/helpers.js';

let setupComplete = false;
let setupToken = null;

/** Einrichtung gilt als abgeschlossen, sobald es mindestens einen Admin gibt. */
export function isSetupComplete() {
  if (!setupComplete) setupComplete = countUsers() > 0;
  return setupComplete;
}

export function markSetupComplete() {
  setupComplete = true;
  setupToken = null;
}

/** Wird bei jedem Start neu erzeugt und nur in der Konsole angezeigt. */
export function getSetupToken() {
  if (!setupToken) setupToken = randomBytes(9).toString('base64url');
  return setupToken;
}

export function checkSetupToken(input) {
  return safeEqual(String(input ?? '').trim(), getSetupToken());
}