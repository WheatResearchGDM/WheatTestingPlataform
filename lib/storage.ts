export type StorageUpdates = Record<string, string | null>;

export function readJson<T>(key: string, fallback: T, storage: Pick<Storage, 'getItem'> = localStorage): T {
  const text = storage.getItem(key);
  return text === null ? fallback : JSON.parse(text) as T;
}

export function readArray<T>(key: string, fallback: T[] = []): T[] {
  if (typeof window === 'undefined') return fallback;
  try { const value = readJson<unknown>(key, fallback); return Array.isArray(value) ? value : fallback; }
  catch { return fallback; }
}

/** Roll back the entire synchronous batch if a write fails (for example quota). */
export function writeStorageBatch(updates: StorageUpdates, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage) {
  const keys = Object.keys(updates);
  const originals = new Map(keys.map((key) => [key, storage.getItem(key)]));
  try {
    for (const key of keys) {
      if (updates[key] === null) storage.removeItem(key);
      else storage.setItem(key, updates[key]!);
    }
  } catch (cause) {
    // Free the batch's new values before restoring the previous storage footprint.
    for (const key of keys) storage.removeItem(key);
    for (const [key, value] of originals) if (value !== null) storage.setItem(key, value);
    throw new Error('Não foi possível salvar: o armazenamento está indisponível ou cheio. Os dados anteriores foram preservados.', { cause });
  }
}
