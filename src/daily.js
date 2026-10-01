// Daily completed-session count, persisted per local calendar day.
// Storage is optional: if it is missing, throws, or holds invalid data, the
// count falls back to memory for the current page.

export const STORAGE_KEY = 'focus-timer:daily';

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns window.localStorage if it is present and writable, else null. */
export function getSafeStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function parse(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const value = JSON.parse(raw);
    if (
      value &&
      typeof value.date === 'string' &&
      Number.isSafeInteger(value.count) &&
      value.count >= 0
    ) {
      return { date: value.date, count: value.count };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * @param {object} [options]
 * @param {Storage | null} [options.storage]
 * @param {() => string} [options.today] Returns the current local date key.
 */
export function createDailyCounter({ storage = null, today = () => localDateKey() } = {}) {
  let memory = { date: today(), count: 0 };

  // After any storage failure, stop using storage for this counter so a
  // stale persisted value can never override the newer in-memory count.
  function read() {
    if (storage) {
      try {
        const stored = parse(storage.getItem(STORAGE_KEY));
        if (stored) memory = stored;
      } catch {
        storage = null;
      }
    }
    return memory;
  }

  function write(record) {
    memory = record;
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      storage = null;
    }
  }

  /** Completed sessions today; 0 after the date rolls over. */
  function get() {
    const record = read();
    return record.date === today() ? record.count : 0;
  }

  function increment() {
    const count = get() + 1;
    write({ date: today(), count });
    return count;
  }

  return { get, increment };
}
