import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  createHistory,
  CSV_HEADER,
  HISTORY_KEY,
  lastDays,
  parseDateKey,
  RETENTION_DAYS,
  retentionStart,
  streak,
  toCSV,
  weekMinutes,
  weekStart,
} from '../src/history.js';
import { STORAGE_KEY as LEGACY_KEY } from '../src/daily.js';

const MIN = 60 * 1000;

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

// Storage that reads fine but fails every write (e.g. quota exceeded).
function readOnlyStorage(initial) {
  const storage = memoryStorage(initial);
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  return storage;
}

function stored(storage) {
  return JSON.parse(storage.getItem(HISTORY_KEY)).days;
}

function historyJSON(days) {
  return JSON.stringify({ version: 1, days });
}

function legacyJSON(date, count) {
  return JSON.stringify({ date, count });
}

// --- Calendar arithmetic ---

test('date keys are validated as real calendar dates', () => {
  assert.ok(parseDateKey('2024-02-29'));
  assert.equal(parseDateKey('2026-02-29'), null);
  assert.equal(parseDateKey('2026-13-01'), null);
  assert.equal(parseDateKey('2026-1-01'), null);
  assert.equal(parseDateKey('yesterday'), null);
  assert.equal(parseDateKey(20261001), null);
});

test('addDays crosses month, year and leap-day boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2026-10-01', 0), '2026-10-01');
});

test('addDays steps exactly one calendar day across DST changes', () => {
  // Every day of two years one by one: any DST shift in the local zone would
  // show up as a skipped or repeated date.
  let key = '2025-01-01';
  let date = new Date(2025, 0, 1);
  for (let i = 0; i < 730; i++) {
    key = addDays(key, 1);
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    assert.equal(key, expected);
  }
  assert.equal(key, '2027-01-01');
  assert.equal(addDays('2027-01-01', -730), '2025-01-01');
});

test('retention keeps today plus the previous 89 days', () => {
  assert.equal(RETENTION_DAYS, 90);
  assert.equal(retentionStart('2026-10-01'), '2026-07-04');
  assert.equal(retentionStart('2026-03-01'), '2025-12-02');
});

test('week starts on Monday', () => {
  assert.equal(weekStart('2026-10-01'), '2026-09-28'); // Thursday
  assert.equal(weekStart('2026-09-28'), '2026-09-28'); // Monday
  assert.equal(weekStart('2026-10-04'), '2026-09-28'); // Sunday
  assert.equal(weekStart('2027-01-01'), '2026-12-28'); // across a year
});

// --- Pure metrics ---

test('lastDays returns seven zero-filled days ending today', () => {
  const days = { '2026-09-29': { sessions: 2, minutes: 50 }, '2026-10-01': { sessions: 1, minutes: 25 } };
  assert.deepEqual(lastDays(days, '2026-10-01'), [
    { date: '2026-09-25', sessions: 0, minutes: 0 },
    { date: '2026-09-26', sessions: 0, minutes: 0 },
    { date: '2026-09-27', sessions: 0, minutes: 0 },
    { date: '2026-09-28', sessions: 0, minutes: 0 },
    { date: '2026-09-29', sessions: 2, minutes: 50 },
    { date: '2026-09-30', sessions: 0, minutes: 0 },
    { date: '2026-10-01', sessions: 1, minutes: 25 },
  ]);
  assert.deepEqual(lastDays({}, '2026-03-02', 3).map((d) => d.date), ['2026-02-28', '2026-03-01', '2026-03-02']);
});

test('weekMinutes sums Monday through today only', () => {
  const days = {
    '2026-09-27': { sessions: 4, minutes: 100 }, // previous Sunday
    '2026-09-28': { sessions: 1, minutes: 25 }, // Monday
    '2026-09-30': { sessions: 2, minutes: 30 },
    '2026-10-01': { sessions: 1, minutes: 15 },
    '2026-10-02': { sessions: 9, minutes: 999 }, // after today
  };
  assert.equal(weekMinutes(days, '2026-10-01'), 70);
  assert.equal(weekMinutes(days, '2026-09-28'), 25);
  assert.equal(weekMinutes(days, '2026-09-27'), 100);
});

test('streak ends today when today is active', () => {
  const days = {
    '2026-09-29': { sessions: 1, minutes: 25 },
    '2026-09-30': { sessions: 3, minutes: 75 },
    '2026-10-01': { sessions: 1, minutes: 25 },
  };
  assert.equal(streak(days, '2026-10-01'), 3);
});

test('streak ends yesterday when today has no session yet', () => {
  const days = {
    '2026-09-29': { sessions: 1, minutes: 25 },
    '2026-09-30': { sessions: 3, minutes: 75 },
  };
  assert.equal(streak(days, '2026-10-01'), 2);
  // A day with zero sessions is not active even if it has an entry.
  assert.equal(streak({ ...days, '2026-10-01': { sessions: 0, minutes: 0 } }, '2026-10-01'), 2);
});

test('streak is zero when neither today nor yesterday is active', () => {
  const days = { '2026-09-28': { sessions: 5, minutes: 125 }, '2026-09-29': { sessions: 1, minutes: 25 } };
  assert.equal(streak(days, '2026-10-01'), 0);
  assert.equal(streak({}, '2026-10-01'), 0);
});

test('streak does not bridge gaps', () => {
  const days = {
    '2026-09-27': { sessions: 1, minutes: 25 },
    '2026-09-28': { sessions: 1, minutes: 25 },
    '2026-09-30': { sessions: 1, minutes: 25 },
    '2026-10-01': { sessions: 1, minutes: 25 },
  };
  assert.equal(streak(days, '2026-10-01'), 2);
});

test('streak crosses month and year boundaries', () => {
  const days = {
    '2026-12-30': { sessions: 1, minutes: 25 },
    '2026-12-31': { sessions: 1, minutes: 25 },
    '2027-01-01': { sessions: 2, minutes: 50 },
  };
  assert.equal(streak(days, '2027-01-01'), 3);
  assert.equal(streak(days, '2027-01-02'), 3);
  const spring = { '2024-02-28': { sessions: 1, minutes: 5 }, '2024-02-29': { sessions: 1, minutes: 5 }, '2024-03-01': { sessions: 1, minutes: 5 } };
  assert.equal(streak(spring, '2024-03-01'), 3);
});

test('CSV has a header and chronologically sorted rows', () => {
  const days = {
    '2026-10-01': { sessions: 2, minutes: 50 },
    '2026-09-03': { sessions: 1, minutes: 0 },
    '2026-09-30': { sessions: 1, minutes: 12.5 },
  };
  assert.equal(
    toCSV(days),
    `${CSV_HEADER}\n2026-09-03,1,0\n2026-09-30,1,12.5\n2026-10-01,2,50\n`,
  );
  assert.equal(CSV_HEADER, 'date,completed_sessions,focus_minutes');
  assert.equal(toCSV({}), `${CSV_HEADER}\n`);
});

// --- Store ---

test('records completed sessions with their minutes and persists them', () => {
  const storage = memoryStorage();
  const history = createHistory({ storage, today: () => '2026-10-01' });
  assert.equal(history.todaySessions(), 0);
  assert.deepEqual(history.recordSession(25 * MIN), { sessions: 1, minutes: 25 });
  assert.deepEqual(history.recordSession(50 * MIN), { sessions: 2, minutes: 75 });
  assert.deepEqual(stored(storage), { '2026-10-01': { sessions: 2, minutes: 75 } });

  const reloaded = createHistory({ storage, today: () => '2026-10-01' });
  assert.equal(reloaded.todaySessions(), 2);
  assert.deepEqual(reloaded.snapshot(), { '2026-10-01': { sessions: 2, minutes: 75 } });
  assert.equal(reloaded.stats().todayMinutes, 75);
});

test('rejects invalid durations without recording', () => {
  const history = createHistory({ today: () => '2026-10-01' });
  for (const value of [0, -1, Number.NaN, Infinity, '25']) {
    assert.throws(() => history.recordSession(value), RangeError);
  }
  assert.equal(history.todaySessions(), 0);
});

test('day rollover starts a new day and preserves past days', () => {
  let day = '2026-10-01';
  const storage = memoryStorage();
  const history = createHistory({ storage, today: () => day });
  history.recordSession(25 * MIN);
  history.recordSession(25 * MIN);
  day = '2026-10-02';
  assert.equal(history.todaySessions(), 0);
  history.recordSession(30 * MIN);
  assert.equal(history.todaySessions(), 1);
  assert.deepEqual(stored(storage), {
    '2026-10-01': { sessions: 2, minutes: 50 },
    '2026-10-02': { sessions: 1, minutes: 30 },
  });
  const stats = history.stats();
  assert.equal(stats.streak, 2);
  assert.equal(stats.weekMinutes, 80);
  assert.deepEqual(stats.days.slice(-2).map((d) => d.sessions), [2, 1]);
});

test('stats summarises today, the week, the streak and seven days', () => {
  const storage = memoryStorage({
    [HISTORY_KEY]: historyJSON({
      '2026-09-27': { sessions: 1, minutes: 25 },
      '2026-09-29': { sessions: 2, minutes: 50 },
      '2026-09-30': { sessions: 1, minutes: 25 },
      '2026-10-01': { sessions: 3, minutes: 60 },
    }),
  });
  const stats = createHistory({ storage, today: () => '2026-10-01' }).stats();
  assert.equal(stats.today, '2026-10-01');
  assert.equal(stats.todaySessions, 3);
  assert.equal(stats.todayMinutes, 60);
  assert.equal(stats.weekMinutes, 135);
  assert.equal(stats.streak, 3);
  assert.equal(stats.days.length, 7);
  assert.deepEqual(stats.days.map((d) => d.sessions), [0, 0, 1, 0, 2, 1, 3]);
  assert.equal(stats.recordedDays, 4);
  assert.equal(createHistory({ today: () => '2026-10-01' }).stats().recordedDays, 0);
});

test('prunes exactly at the 90-day boundary on load, and stores the result', () => {
  const storage = memoryStorage({
    [HISTORY_KEY]: historyJSON({
      '2026-07-02': { sessions: 1, minutes: 25 }, // 91 days ago
      '2026-07-03': { sessions: 1, minutes: 25 }, // 90 days ago: dropped
      '2026-07-04': { sessions: 2, minutes: 50 }, // 89 days ago: kept
      '2026-10-01': { sessions: 1, minutes: 25 },
    }),
  });
  const history = createHistory({ storage, today: () => '2026-10-01' });
  const expected = {
    '2026-07-04': { sessions: 2, minutes: 50 },
    '2026-10-01': { sessions: 1, minutes: 25 },
  };
  assert.deepEqual(history.snapshot(), expected);
  assert.deepEqual(stored(storage), expected);
  assert.equal(history.csv(), `${CSV_HEADER}\n2026-07-04,2,50\n2026-10-01,1,25\n`);
});

test('prunes days that age out while the page stays open', () => {
  let day = '2026-10-01';
  const storage = memoryStorage({
    [HISTORY_KEY]: historyJSON({ '2026-07-04': { sessions: 2, minutes: 50 } }),
  });
  const history = createHistory({ storage, today: () => day });
  assert.deepEqual(Object.keys(history.snapshot()), ['2026-07-04']);
  day = '2026-10-02';
  assert.deepEqual(history.snapshot(), {});
  history.recordSession(25 * MIN);
  assert.deepEqual(stored(storage), { '2026-10-02': { sessions: 1, minutes: 25 } });
});

test('keeps a full 90-day window across a year boundary', () => {
  const days = {};
  for (let i = 0; i < 100; i++) days[addDays('2027-01-15', -i)] = { sessions: 1, minutes: 25 };
  const storage = memoryStorage({ [HISTORY_KEY]: historyJSON(days) });
  const snapshot = createHistory({ storage, today: () => '2027-01-15' }).snapshot();
  const keys = Object.keys(snapshot).sort();
  assert.equal(keys.length, 90);
  assert.equal(keys[0], '2026-10-18');
  assert.equal(keys.at(-1), '2027-01-15');
});

// --- Legacy carry-over ---

test("carries over today's legacy count once, with zero minutes", () => {
  const storage = memoryStorage({ [LEGACY_KEY]: legacyJSON('2026-10-01', 3) });
  const history = createHistory({ storage, today: () => '2026-10-01' });
  assert.equal(history.todaySessions(), 3);
  assert.deepEqual(stored(storage), { '2026-10-01': { sessions: 3, minutes: 0 } });
  assert.equal(storage.getItem(LEGACY_KEY), null);

  history.recordSession(25 * MIN);
  const reloaded = createHistory({ storage, today: () => '2026-10-01' });
  assert.deepEqual(reloaded.snapshot(), { '2026-10-01': { sessions: 4, minutes: 25 } });
});

test('carry-over is idempotent even if the legacy key could not be removed', () => {
  const storage = memoryStorage({ [LEGACY_KEY]: legacyJSON('2026-10-01', 3) });
  storage.removeItem = () => {
    throw new Error('denied');
  };
  for (let i = 0; i < 3; i++) {
    const history = createHistory({ storage, today: () => '2026-10-01' });
    assert.equal(history.todaySessions(), 3);
  }
  assert.deepEqual(stored(storage), { '2026-10-01': { sessions: 3, minutes: 0 } });
});

test('a legacy count written later never resurrects into an existing history', () => {
  const storage = memoryStorage({ [LEGACY_KEY]: legacyJSON('2026-10-01', 2) });
  createHistory({ storage, today: () => '2026-10-01' });
  // e.g. an old version of the app still open in another tab
  storage.setItem(LEGACY_KEY, legacyJSON('2026-10-01', 7));
  const reloaded = createHistory({ storage, today: () => '2026-10-01' });
  assert.equal(reloaded.todaySessions(), 2);
  assert.equal(storage.getItem(LEGACY_KEY), null);
});

test('an existing history takes precedence over the legacy count', () => {
  const storage = memoryStorage({
    [HISTORY_KEY]: historyJSON({ '2026-10-01': { sessions: 1, minutes: 25 } }),
    [LEGACY_KEY]: legacyJSON('2026-10-01', 5),
  });
  const history = createHistory({ storage, today: () => '2026-10-01' });
  assert.deepEqual(history.snapshot(), { '2026-10-01': { sessions: 1, minutes: 25 } });
  assert.equal(storage.getItem(LEGACY_KEY), null);
});

test('ignores a stale or invalid legacy count', () => {
  for (const raw of [legacyJSON('2026-09-30', 4), legacyJSON('2026-10-02', 4), legacyJSON('2026-10-01', 0), '{"date":"2026-10-01","count":-2}', 'not json']) {
    const storage = memoryStorage({ [LEGACY_KEY]: raw });
    const history = createHistory({ storage, today: () => '2026-10-01' });
    assert.deepEqual(history.snapshot(), {}, raw);
    assert.deepEqual(stored(storage), {}, raw); // carry-over marked as done
    assert.equal(storage.getItem(LEGACY_KEY), null, raw);
  }
});

test('keeps the legacy count when the history cannot be stored', () => {
  const storage = readOnlyStorage({ [LEGACY_KEY]: legacyJSON('2026-10-01', 3) });
  const history = createHistory({ storage, today: () => '2026-10-01' });
  assert.equal(history.todaySessions(), 3); // carried over in memory
  history.recordSession(25 * MIN);
  assert.equal(history.todaySessions(), 4);
  assert.equal(storage.getItem(HISTORY_KEY), null);
  assert.equal(storage.getItem(LEGACY_KEY), legacyJSON('2026-10-01', 3));
});

// --- Invalid storage and failures ---

test('ignores malformed stored history and invalid days', () => {
  for (const raw of ['not json', 'null', '[]', '{"days":[]}', '{"days":"x"}', '{}']) {
    const storage = memoryStorage({ [HISTORY_KEY]: raw, [LEGACY_KEY]: legacyJSON('2026-10-01', 2) });
    const history = createHistory({ storage, today: () => '2026-10-01' });
    assert.deepEqual(history.snapshot(), {}, raw);
    assert.equal(storage.getItem(LEGACY_KEY), legacyJSON('2026-10-01', 2), raw);
    history.recordSession(25 * MIN);
    assert.deepEqual(stored(storage), { '2026-10-01': { sessions: 1, minutes: 25 } }, raw);
    // The now-valid history wins on reload; the legacy count is not added.
    assert.equal(createHistory({ storage, today: () => '2026-10-01' }).todaySessions(), 1, raw);
    assert.equal(storage.getItem(LEGACY_KEY), null, raw);
  }

  const storage = memoryStorage({
    [HISTORY_KEY]: historyJSON({
      '2026-09-30': { sessions: 2, minutes: 50 },
      '2026-09-31': { sessions: 1, minutes: 25 },
      'today': { sessions: 1, minutes: 25 },
      '2026-09-29': { sessions: 1.5, minutes: 25 },
      '2026-09-28': { sessions: 1, minutes: -5 },
      '2026-09-27': { sessions: 1 },
      '2026-09-26': null,
    }),
  });
  const history = createHistory({ storage, today: () => '2026-10-01' });
  assert.deepEqual(history.snapshot(), { '2026-09-30': { sessions: 2, minutes: 50 } });
});

test('works in memory when storage is missing or throws', () => {
  const none = createHistory({ storage: null, today: () => '2026-10-01' });
  none.recordSession(25 * MIN);
  assert.equal(none.todaySessions(), 1);

  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
  };
  const history = createHistory({ storage: throwing, today: () => '2026-10-01' });
  history.recordSession(25 * MIN);
  history.recordSession(25 * MIN);
  assert.deepEqual(history.snapshot(), { '2026-10-01': { sessions: 2, minutes: 50 } });
});

test('keeps recording in memory after a write failure, ignoring the stale stored value', () => {
  let day = '2026-10-01';
  const storage = readOnlyStorage({
    [HISTORY_KEY]: historyJSON({ '2026-10-01': { sessions: 2, minutes: 50 } }),
  });
  const history = createHistory({ storage, today: () => day });
  assert.equal(history.todaySessions(), 2);
  history.recordSession(25 * MIN);
  assert.equal(history.todaySessions(), 3);
  history.recordSession(25 * MIN);
  assert.deepEqual(history.snapshot(), { '2026-10-01': { sessions: 4, minutes: 100 } });
  assert.deepEqual(stored(storage), { '2026-10-01': { sessions: 2, minutes: 50 } });

  day = '2026-10-02';
  assert.equal(history.todaySessions(), 0);
  history.recordSession(10 * MIN);
  assert.equal(history.stats().streak, 2);
  assert.equal(history.csv(), `${CSV_HEADER}\n2026-10-01,4,100\n2026-10-02,1,10\n`);
});

test('stops trusting storage after a failed read', () => {
  let failRead = false;
  const storage = memoryStorage({
    [HISTORY_KEY]: historyJSON({ '2026-10-01': { sessions: 5, minutes: 125 } }),
  });
  const getItem = storage.getItem;
  storage.getItem = (k) => {
    if (failRead) throw new Error('denied');
    return getItem(k);
  };
  const history = createHistory({ storage, today: () => '2026-10-01' });
  assert.equal(history.todaySessions(), 5);
  failRead = true;
  history.recordSession(25 * MIN);
  failRead = false;
  storage.setItem(HISTORY_KEY, historyJSON({}));
  assert.equal(history.todaySessions(), 6);
});

test('picks up sessions recorded by another tab', () => {
  const storage = memoryStorage();
  const a = createHistory({ storage, today: () => '2026-10-01' });
  const b = createHistory({ storage, today: () => '2026-10-01' });
  a.recordSession(25 * MIN);
  b.recordSession(25 * MIN);
  assert.equal(a.todaySessions(), 2);
  assert.deepEqual(stored(storage), { '2026-10-01': { sessions: 2, minutes: 50 } });
});
