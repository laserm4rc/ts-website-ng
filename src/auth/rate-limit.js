// Einfache Begrenzung von Versuchen pro Schlüssel (z. B. IP-Adresse) in einem Zeitfenster.

const MAX_TRACKED_KEYS = 5000;

export function createLimiter({ max, windowMs }) {
  const entries = new Map(); // key -> { count, resetAt }

  function removeExpired(now) {
    for (const [key, entry] of entries) {
      if (entry.resetAt < now) entries.delete(key);
    }
  }

  return {
    isBlocked(key) {
      const entry = entries.get(key);
      if (!entry) return false;
      if (entry.resetAt < Date.now()) {
        entries.delete(key);
        return false;
      }
      return entry.count >= max;
    },

    hit(key) {
      const now = Date.now();
      if (entries.size > MAX_TRACKED_KEYS) removeExpired(now);

      const entry = entries.get(key);
      if (!entry || entry.resetAt < now) {
        entries.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        entry.count += 1;
      }
    },

    reset(key) {
      entries.delete(key);
    },
  };
}

// Admin-Login: max. 5 Fehlversuche pro IP in 15 Minuten
const adminLogin = createLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

export const isBlocked = (ip) => adminLogin.isBlocked(ip);
export const registerFailure = (ip) => adminLogin.hit(ip);
export const resetFailures = (ip) => adminLogin.reset(ip);
