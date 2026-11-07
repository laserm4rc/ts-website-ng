import { timingSafeEqual } from 'node:crypto';

/** Formularwert als getrimmter String (alles andere wird zu ''). */
export function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Vergleicht zwei Strings in konstanter Zeit (gegen Timing-Angriffe). */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Nur interne Weiterleitungsziele erlauben (verhindert Open-Redirects). */
export function safeNext(value, fallback = '/admin') {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : fallback;
}