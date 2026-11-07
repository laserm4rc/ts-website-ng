// Einfacher In-Memory-Cache mit Ablaufzeit.
// Gleichzeitige Anfragen auf denselben Schlüssel teilen sich einen Ladevorgang.

const store = new Map(); // key -> { value, expiresAt }
const pending = new Map(); // key -> Promise

export async function cached(key, ttlMs, loader) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  if (pending.has(key)) return pending.get(key);

  const promise = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise;
}

export function setCache(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearCache(prefix = '') {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}