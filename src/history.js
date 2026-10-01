// Focus history: completed focus sessions and focus minutes per local
// calendar day (YYYY-MM-DD), kept for today plus the previous 89 days.
//
// Storage is optional and handled like the daily count: if it is missing,
// throws, or holds invalid data, the history lives in memory for the current
// page. After any read or write failure storage is no longer used, so a stale
// stored value can never override newer in-memory data.
//
// Individual completed sessions (focus and breaks) are stored next to the
// daily totals, each with its local date, ISO completion time, kind and
// length in minutes, and follow the same retention and Reset today rules.
// Daily totals stay focus-only. Sessions completed before records existed
// are only known as aggregates, so no individual rows are invented for them.
//
// Carry-over: the first time a history is created, a valid legacy daily
// count (focus-timer:daily) dated today becomes today's session count with
// zero minutes, since the legacy record has no durations. The legacy key is
// removed only after the history has been stored; once a history exists it
// always takes precedence, so the legacy count is never added twice.

import { buildSessionsCSV } from './csv.js';
import { localDateKey, parseDailyRecord, STORAGE_KEY as LEGACY_KEY } from './daily.js';

export const HISTORY_KEY = 'focus-timer:history';
export const RETENTION_DAYS = 90;
export const CSV_HEADER = 'date,completed_sessions,focus_minutes';

export const KINDS = Object.freeze({
  FOCUS: 'focus',
  SHORT_BREAK: 'short break',
  LONG_BREAK: 'long break',
});
const KIND_VALUES = new Set(Object.values(KINDS));

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

function validSession(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    parseDateKey(value.date) !== null &&
    KIND_VALUES.has(value.kind) &&
    typeof value.minutes === 'number' &&
    Number.isFinite(value.minutes) &&
    value.minutes > 0 &&
    typeof value.completedAt === 'string' &&
    !Number.isNaN(Date.parse(value.completedAt))
  );
}

/**
 * Parses stored history into `{ days, sessions }`, or null if the value is
 * not a history at all. Invalid individual days and sessions are dropped; a
 * history without sessions (older versions) has an empty list.
 */
export function parseStored(raw) {
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
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.filter(validSession).map((s) => ({
        date: s.date,
        kind: s.kind,
        minutes: s.minutes,
        completedAt: s.completedAt,
      }))
    : [];
  return { days, sessions };
}

/** Parses stored history days only; see parseStored. */
export function parseHistory(raw) {
  return parseStored(raw)?.days ?? null;
}

function serialize(days, sessions) {
  return JSON.stringify({ version: VERSION, days, sessions });
}

/** Drops sessions older than the retention window. */
export function pruneSessions(sessions, todayKey) {
  const start = retentionStart(todayKey);
  const kept = sessions.filter((s) => s.date >= start);
  return { sessions: kept, removed: kept.length !== sessions.length };
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
 * @param {() => Date | number} [options.now] Time source for completion times.
 */
export function createHistory({ storage = null, today = () => localDateKey(), now = () => new Date() } = {}) {
  let days = {}; // authoritative whenever storage is unavailable
  let sessions = []; // individual completed sessions, oldest first

  function write(nextDays, nextSessions = sessions) {
    days = nextDays;
    sessions = nextSessions;
    if (!storage) return false;
    try {
      storage.setItem(HISTORY_KEY, serialize(nextDays, nextSessions));
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
      const parsed = parseStored(raw);
      const pruned = prune(parsed?.days ?? {}, today());
      const prunedSessions = pruneSessions(parsed?.sessions ?? [], today());
      if (pruned.removed || prunedSessions.removed) write(pruned.days, prunedSessions.sessions);
      else {
        days = pruned.days;
        sessions = prunedSessions.sessions;
      }
      if (parsed) removeLegacy();
      return;
    }

    const next = {};
    const key = today();
    if (legacy && legacy.date === key && legacy.count > 0) {
      next[key] = { sessions: legacy.count, minutes: 0 };
    }
    // Storing even an empty history marks the carry-over as done.
    if (write(next, [])) removeLegacy();
  }

  // Latest retained days; picks up writes from other tabs while storage works.
  // Days that aged out are removed from storage too, but only when there is
  // something to remove, so repeated reads do not rewrite the history.
  function read() {
    if (storage) {
      try {
        const stored = parseStored(storage.getItem(HISTORY_KEY));
        if (stored) {
          days = stored.days;
          sessions = stored.sessions;
        }
      } catch {
        storage = null;
      }
    }
    const pruned = prune(days, today());
    const prunedSessions = pruneSessions(sessions, today());
    if (pruned.removed || prunedSessions.removed) write(pruned.days, prunedSessions.sessions); // on failure, memory (already pruned) takes over
    else {
      days = pruned.days;
      sessions = prunedSessions.sessions;
    }
    return days;
  }

  /**
   * Records one completed phase of `durationMs` on today's date. Every kind
   * gets an individual session record; only focus counts towards the daily
   * totals, streak and weekly minutes.
   * @returns {{sessions: number, minutes: number}} today's focus totals
   */
  function recordCompletion(kind, durationMs) {
    if (!KIND_VALUES.has(kind)) throw new RangeError(`Unknown session kind: ${kind}`);
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
      throw new RangeError('durationMs must be a positive number of milliseconds');
    }
    const key = today();
    const current = read();
    const day = dayOf(current, key);
    const updated =
      kind === KINDS.FOCUS ? { sessions: day.sessions + 1, minutes: day.minutes + durationMs / MINUTE } : day;
    const record = {
      date: key,
      kind,
      minutes: durationMs / MINUTE,
      completedAt: new Date(now()).toISOString(),
    };
    write(kind === KINDS.FOCUS ? { ...current, [key]: updated } : current, [...sessions, record]);
    return { ...updated };
  }

  /** Records one completed focus session; see recordCompletion. */
  function recordSession(durationMs) {
    return recordCompletion(KINDS.FOCUS, durationMs);
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
      exportableSessions: sessions.length,
    };
  }

  /**
   * Removes only the current local day's record, resolved when called, so a
   * confirmation that straddles midnight never clears yesterday. Other days
   * and the streak rules are untouched.
   * @returns {{date: string, cleared: boolean}} the day acted on and whether
   *   it had a record
   */
  function resetToday() {
    const key = today();
    const current = read();
    const hasSessions = sessions.some((s) => s.date === key);
    if (!(key in current) && !hasSessions) return { date: key, cleared: false };
    const { [key]: _removed, ...rest } = current;
    write(rest, sessions.filter((s) => s.date !== key));
    return { date: key, cleared: true };
  }

  function csv() {
    return toCSV(read());
  }

  /** Copies of all retained individual session records, oldest first. */
  function sessionRecords() {
    read();
    return sessions.map((s) => ({ ...s }));
  }

  /** Per-session CSV (RFC 4180) of every retained completed session. */
  function sessionsCSV() {
    return buildSessionsCSV(sessionRecords());
  }

  init();

  return { recordCompletion, sessionRecords, sessionsCSV, recordSession, resetToday, todaySessions, snapshot, stats, csv };
}
