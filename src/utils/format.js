import { config } from '../config.js';

// Formatierungshilfen für Templates (vorerst Deutsch, Mehrsprachigkeit folgt später)

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? 'Tag' : 'Tage'}`);
  if (hours) parts.push(`${hours} Std.`);
  parts.push(`${minutes} Min.`);
  return parts.join(' ');
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** SQLite speichert UTC als "2026-11-08 14:30:00". Daraus wird ein Date-Objekt. */
export function parseDbDate(value) {
  return value ? new Date(`${String(value).replace(' ', 'T')}Z`) : null;
}

export function formatDate(value, withTime = true) {
  const date = value instanceof Date ? value : parseDbDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone: config.timezone,
  }).format(date);
}
