import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  parseSettingsForm,
  parseWholeNumber,
  SETTINGS_KEY,
  toTimerConfig,
  validateSettings,
} from '../src/settings.js';
import { createDailyCounter, STORAGE_KEY as DAILY_KEY } from '../src/daily.js';
import { createTimer, PHASES } from '../src/timer.js';

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

const valid = () => ({ ...DEFAULT_SETTINGS });

test('defaults are 25/5/15 minutes, 4 sessions, auto-start and sound off', () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    autoStart: false,
    sound: false,
  });
  assert.equal(SETTINGS_KEY === DAILY_KEY, false);
});

test('minute fields accept whole numbers from 1 to 90 only', () => {
  for (const name of ['workMinutes', 'shortBreakMinutes', 'longBreakMinutes']) {
    for (const ok of [1, 2, 45, 89, 90]) {
      assert.equal(validateSettings({ ...valid(), [name]: ok }).ok, true, `${name}=${ok}`);
    }
    for (const bad of [0, 91, -1, 1.5, Number.NaN, Infinity, -Infinity, '25', null, undefined, true]) {
      const result = validateSettings({ ...valid(), [name]: bad });
      assert.equal(result.ok, false, `${name}=${String(bad)}`);
      assert.match(result.errors[name], /1 to 90/);
    }
  }
});

test('sessions before a long break accept whole numbers from 2 to 8 only', () => {
  for (const ok of [2, 3, 7, 8]) {
    assert.equal(validateSettings({ ...valid(), sessionsBeforeLongBreak: ok }).ok, true);
  }
  for (const bad of [1, 9, 0, 4.5, Number.NaN, '4']) {
    const result = validateSettings({ ...valid(), sessionsBeforeLongBreak: bad });
    assert.equal(result.ok, false);
    assert.match(result.errors.sessionsBeforeLongBreak, /2 to 8/);
  }
});

test('boolean settings must be real booleans', () => {
  for (const name of ['autoStart', 'sound']) {
    assert.equal(validateSettings({ ...valid(), [name]: true }).ok, true);
    for (const bad of ['true', 1, 0, null, undefined]) {
      assert.equal(validateSettings({ ...valid(), [name]: bad }).ok, false, `${name}=${String(bad)}`);
    }
  }
  assert.equal(validateSettings(null).ok, false);
  assert.equal(validateSettings([]).ok, false);
});

test('validation reports every invalid field at once', () => {
  const result = validateSettings({ ...valid(), workMinutes: 0, sessionsBeforeLongBreak: 9 });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['sessionsBeforeLongBreak', 'workMinutes']);
});

test('form text is parsed strictly as whole numbers', () => {
  assert.equal(parseWholeNumber('25'), 25);
  assert.equal(parseWholeNumber(' 7 '), 7);
  for (const bad of ['', ' ', '1.5', '1e1', '-3', '0x10', 'abc', '2 5']) {
    assert.ok(Number.isNaN(parseWholeNumber(bad)), bad);
  }
  assert.ok(Number.isNaN(parseWholeNumber(25)));

  const ok = parseSettingsForm({
    workMinutes: '50',
    shortBreakMinutes: '10',
    longBreakMinutes: '30',
    sessionsBeforeLongBreak: '3',
    autoStart: true,
    sound: false,
  });
  assert.deepEqual(ok, {
    ok: true,
    value: { workMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, sessionsBeforeLongBreak: 3, autoStart: true, sound: false },
  });
  const bad = parseSettingsForm({ ...ok.value, workMinutes: '', shortBreakMinutes: '5', longBreakMinutes: '15', sessionsBeforeLongBreak: '4' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.workMinutes);
});

test('saves and reloads settings under their own key without touching the daily record', () => {
  const daily = JSON.stringify({ date: '2026-10-01', count: 3 });
  const storage = memoryStorage({ [DAILY_KEY]: daily });
  const store = createSettingsStore({ storage });
  assert.deepEqual(store.get(), DEFAULT_SETTINGS);

  const next = { ...valid(), workMinutes: 50, sound: true };
  assert.deepEqual(store.save(next), { ok: true, value: next, persisted: true });
  assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_KEY)), next);
  assert.equal(storage.getItem(DAILY_KEY), daily);

  assert.deepEqual(createSettingsStore({ storage }).get(), next);
  assert.equal(createDailyCounter({ storage, today: () => '2026-10-01' }).get(), 3);
});

test('invalid drafts change neither memory nor storage', () => {
  const storage = memoryStorage();
  const store = createSettingsStore({ storage });
  store.save({ ...valid(), workMinutes: 30 });
  const stored = storage.getItem(SETTINGS_KEY);

  const result = store.save({ ...valid(), workMinutes: 91 });
  assert.equal(result.ok, false);
  assert.equal(store.get().workMinutes, 30);
  assert.equal(storage.getItem(SETTINGS_KEY), stored);
});

test('get returns a copy', () => {
  const store = createSettingsStore();
  store.get().workMinutes = 1;
  assert.equal(store.get().workMinutes, 25);
});

test('invalid stored JSON or shape falls back to defaults', () => {
  for (const raw of ['not json', '{', 'null', '[]', '"text"', '42']) {
    const store = createSettingsStore({ storage: memoryStorage({ [SETTINGS_KEY]: raw }) });
    assert.deepEqual(store.get(), DEFAULT_SETTINGS, raw);
  }
});

test('invalid stored fields fall back individually', () => {
  const raw = JSON.stringify({
    workMinutes: 40,
    shortBreakMinutes: 0,
    longBreakMinutes: '20',
    sessionsBeforeLongBreak: 6,
    autoStart: 'yes',
    sound: true,
    extra: 'ignored',
  });
  const store = createSettingsStore({ storage: memoryStorage({ [SETTINGS_KEY]: raw }) });
  assert.deepEqual(store.get(), {
    ...DEFAULT_SETTINGS,
    workMinutes: 40,
    sessionsBeforeLongBreak: 6,
    sound: true,
  });
});

test('works without storage', () => {
  const store = createSettingsStore({ storage: null });
  const next = { ...valid(), longBreakMinutes: 20 };
  assert.deepEqual(store.save(next), { ok: true, value: next, persisted: false });
  assert.deepEqual(store.get(), next);
});

test('a failing read falls back to defaults and stops using storage', () => {
  let writes = 0;
  const storage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      writes += 1;
    },
  };
  const store = createSettingsStore({ storage });
  assert.deepEqual(store.get(), DEFAULT_SETTINGS);
  assert.equal(store.save({ ...valid(), workMinutes: 30 }).persisted, false);
  assert.equal(store.get().workMinutes, 30);
  assert.equal(writes, 0);
});

test('a failing write keeps the new settings in memory', () => {
  const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ ...valid(), workMinutes: 30 }) });
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  const store = createSettingsStore({ storage });
  assert.equal(store.get().workMinutes, 30);

  const result = store.save({ ...valid(), workMinutes: 45 });
  assert.equal(result.ok, true);
  assert.equal(result.persisted, false);
  // The stale stored value never overrides the newer in-memory one.
  assert.equal(store.get().workMinutes, 45);
});

test('toTimerConfig converts minutes and applies to a timer', () => {
  const settings = { ...valid(), workMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, sessionsBeforeLongBreak: 2, autoStart: true };
  const config = toTimerConfig(settings);
  assert.deepEqual(config, {
    durations: { [PHASES.WORK]: 50 * MIN, [PHASES.SHORT_BREAK]: 10 * MIN, [PHASES.LONG_BREAK]: 30 * MIN },
    sessionsBeforeLongBreak: 2,
    autoStart: true,
  });
  const timer = createTimer({ now: () => 0, ...toTimerConfig(DEFAULT_SETTINGS) });
  timer.configure(config);
  const s = timer.getState();
  assert.equal(s.durationMs, 50 * MIN);
  assert.equal(s.sessionsBeforeLongBreak, 2);
  assert.equal(s.autoStart, true);
});
