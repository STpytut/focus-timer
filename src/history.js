// Focus history: completed focus sessions and focus minutes per local
// calendar day (YYYY-MM-DD), kept for today plus the previous 89 days.
//
// Storage is optional and handled like the daily count: if it is missing,
// throws, or holds invalid data, the history lives in memory for the current
// page. After any read or write failure storage is no longer used, so a stale
// stored value can never override newer in-memory data.
//
// Carry-over: the first time a history is created, a valid legacy daily
// count (focus-timer:daily) dated today becomes today's session count with
// zero minutes, since the legacy record has no durations. The legacy key is
// removed only after the history has been stored; once a history exists it
// always takes precedence, so the legacy count is never added twice.

import { localDateKey, parseDailyRecord, STORAGE_KEY as LEGACY_KEY } from './daily.js';

export const HISTORY_KEY = 'focus-timer:history';
export const RETENTION_DAYS = 90;
export const CSV_HEADER = 'date,completed_sessions,focus_minutes';

const MINUTE = 60 * 1000;
const VERSION = 1;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Local Date at noon for a YYYY-MM-DD key, or null if the key is not a real
 * calendar date. Noon keeps day arithmetic clear of DST changes, which
 * happen around midnight.
 */
export function parseDateKey(key) {
  if (typeof key !== 'string' || !DATE_PATTERN.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return localDateKey(date) === key ? date : null;
}

/** Moves a date key by whole local calendar days (negative = earlier). */
export function addDays(key, days) {
  const date = parseDateKey(key);
  if (!date) throw new RangeError(`Invalid date key: ${key}`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/** Oldest date key that is still retained when today is `todayKey`. */
export function retentionStart(todayKey) {
  return addDays(todayKey, -(RETENTION_DAYS - 1));
}

function validDay(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Number.isSafeInteger(value.sessions) &&
    value.sessions >= 0 &&
    typeof value.minutes === 'number' &&
    Number.isFinite(value.minutes) &&
    value.minutes >= 0
  );
}

/**
 * Parses stored history. Returns null if the value is not a history at all;
 * individual invalid days are dropped.
 */
export function parseHistory(raw) {
  if (typeof raw !== 'string') return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || !value.days || typeof value.days !== 'object' || Array.isArray(value.days)) {
    return null;
  }
  const days = {};
  for (const [key, day] of Object.entries(value.days)) {
    if (parseDateKey(key) && validDay(day)) days[key] = { sessions: day.sessions, minutes: day.minutes };
  }
  return days;
}

function serialize(days) {
  return JSON.stringify({ version: VERSION, days });
}

/** Drops days older than the retention window. */
export function prune(days, todayKey) {
  const start = retentionStart(todayKey);
  const kept = {};
  let removed = false;
  for (const [key, day] of Object.entries(days)) {
    if (key >= start) kept[key] = day;
    else removed = true;
  }
  return { days: kept, removed };
}

function dayOf(days, key) {
  return days[key] ?? { sessions: 0, minutes: 0 };
}

/** The last `count` days ending today, oldest first, zero-filled. */
export function lastDays(days, todayKey, count = 7) {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(todayKey, i - (count - 1));
    return { date, ...dayOf(days, date) };
  });
}

/** First day (Monday) of the calendar week containing `todayKey`. */
export function weekStart(todayKey) {
  const weekday = parseDateKey(todayKey).getDay(); // 0 = Sunday
  return addDays(todayKey, -((weekday + 6) % 7));
}

/** Focus minutes from Monday through today. */
export function weekMinutes(days, todayKey) {
  const start = weekStart(todayKey);
  let total = 0;
  for (let key = start; key <= todayKey; key = addDays(key, 1)) total += dayOf(days, key).minutes;
  return total;
}

/**
 * Consecutive days with at least one completed session, ending today if
 * today has one, otherwise ending yesterday. Gaps are never bridged.
 */
export function streak(days, todayKey) {
  let key = dayOf(days, todayKey).sessions > 0 ? todayKey : addDays(todayKey, -1);
  let count = 0;
  while (dayOf(days, key).sessions > 0) {
    count += 1;
    key = addDays(key, -1);
  }
  return count;
}

/** Minutes for display and CSV: at most two decimals, no float noise. */
export function roundMinutes(minutes) {
  return Math.round(minutes * 100) / 100;
}

/** CSV with a header row and one row per recorded day, oldest first. */
export function toCSV(days) {
  const rows = Object.keys(days)
    .sort()
    .map((key) => `${key},${days[key].sessions},${roundMinutes(days[key].minutes)}`);
  return [CSV_HEADER, ...rows].join('\n') + '\n';
}

/**
 * @param {object} [options]
 * @param {Storage | null} [options.storage]
 * @param {() => string} [options.today] Returns the current local date key.
 */
export function createHistory({ storage = null, today = () => localDateKey() } = {}) {
  let days = {}; // authoritative whenever storage is unavailable

  function write(next) {
    days = next;
    if (!storage) return false;
    try {
      storage.setItem(HISTORY_KEY, serialize(next));
      return true;
    } catch {
      storage = null;
      return false;
    }
  }

  function removeLegacy() {
    try {
      storage?.removeItem(LEGACY_KEY);
    } catch {
      // Harmless: an existing history always takes precedence over it.
    }
  }

  function init() {
    if (!storage) return;
    let raw;
    let legacy;
    try {
      raw = storage.getItem(HISTORY_KEY);
      legacy = raw === null ? parseDailyRecord(storage.getItem(LEGACY_KEY)) : null;
    } catch {
      storage = null;
      return;
    }

    // Any stored history, even a malformed one, means the carry-over has
    // already happened; the legacy key is only removed once a valid history
    // is known to be stored.
    if (raw !== null) {
      const parsed = parseHistory(raw);
      const { days: kept, removed } = prune(parsed ?? {}, today());
      if (removed) write(kept);
      else days = kept;
      if (parsed) removeLegacy();
      return;
    }

    const next = {};
    const key = today();
    if (legacy && legacy.date === key && legacy.count > 0) {
      next[key] = { sessions: legacy.count, minutes: 0 };
    }
    // Storing even an empty history marks the carry-over as done.
    if (write(next)) removeLegacy();
  }

  // Latest retained days; picks up writes from other tabs while storage works.
  function read() {
    if (storage) {
      try {
        const stored = parseHistory(storage.getItem(HISTORY_KEY));
        if (stored) days = stored;
      } catch {
        storage = null;
      }
    }
    days = prune(days, today()).days;
    return days;
  }

  /**
   * Records one completed focus session of `durationMs` on today's date.
   * @returns {{sessions: number, minutes: number}} today's totals
   */
  function recordSession(durationMs) {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
      throw new RangeError('durationMs must be a positive number of milliseconds');
    }
    const key = today();
    const current = read();
    const day = dayOf(current, key);
    const updated = { sessions: day.sessions + 1, minutes: day.minutes + durationMs / MINUTE };
    write({ ...current, [key]: updated });
    return { ...updated };
  }

  /** Completed sessions today. */
  function todaySessions() {
    return dayOf(read(), today()).sessions;
  }

  /** Copy of all retained days keyed by date. */
  function snapshot() {
    const current = read();
    return Object.fromEntries(Object.entries(current).map(([key, day]) => [key, { ...day }]));
  }

  /** Everything the Stats view shows, computed for one consistent date. */
  function stats(count = 7) {
    const current = read();
    const key = today();
    return {
      today: key,
      todaySessions: dayOf(current, key).sessions,
      todayMinutes: dayOf(current, key).minutes,
      weekMinutes: weekMinutes(current, key),
      streak: streak(current, key),
      days: lastDays(current, key, count),
      recordedDays: Object.keys(current).length,
    };
  }

  function csv() {
    return toCSV(read());
  }

  init();

  return { recordSession, todaySessions, snapshot, stats, csv };
}
