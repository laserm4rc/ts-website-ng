import { config } from '../config.js';
import { LOCALE, translate } from '../i18n/index.js';

/** SQLite speichert UTC als "2026-11-08 14:30:00". Daraus wird ein Date-Objekt. */
export function parseDbDate(value) {
  return value ? new Date(`${String(value).replace(' ', 'T')}Z`) : null;
}

/** Formatierungshilfen für Templates. */
export const fmt = {
  formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days) parts.push(translate(days === 1 ? 'time.day' : 'time.days', { n: days }));
    if (hours) parts.push(translate('time.hours', { n: hours }));
    parts.push(translate('time.minutes', { n: minutes }));
    return parts.join(' ');
  },

  /** Kompakte Form für die Status-Box: "27d 00h 04m" */
  formatUptime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = String(Math.floor((seconds % 86400) / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    return `${days}d ${hours}h ${minutes}m`;
  },

  formatNumber(value, digits = 0) {
    return new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  },

  formatDate(value, withTime = true) {
    const date = value instanceof Date ? value : parseDbDate(value);
    if (!date || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(LOCALE, {
      dateStyle: 'medium',
      ...(withTime ? { timeStyle: 'short' } : {}),
      timeZone: config.timezone,
    }).format(date);
  },
};
