import messages from './en.js';

// Die Webseite ist nur auf Englisch verfügbar. Das bestimmt auch das Datums- und Zahlenformat.
export const LOCALE = 'en-GB';

/** Liefert den Text zu einem Schlüssel. Platzhalter wie {name} werden aus params ersetzt. */
export function translate(key, params) {
  const text = messages[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}
