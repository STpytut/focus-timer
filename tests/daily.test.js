import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDailyCounter, localDateKey, STORAGE_KEY } from '../src/daily.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

test('localDateKey uses the local calendar date', () => {
  assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDateKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('increments and persists the count for today', () => {
  const storage = memoryStorage();
  const counter = createDailyCounter({ storage, today: () => '2026-10-01' });
  assert.equal(counter.get(), 0);
  assert.equal(counter.increment(), 1);
  assert.equal(counter.increment(), 2);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { date: '2026-10-01', count: 2 });

  const reloaded = createDailyCounter({ storage, today: () => '2026-10-01' });
  assert.equal(reloaded.get(), 2);
});

test('rolls over to zero on a new day', () => {
  let day = '2026-10-01';
  const storage = memoryStorage();
  const counter = createDailyCounter({ storage, today: () => day });
  counter.increment();
  counter.increment();
  day = '2026-10-02';
  assert.equal(counter.get(), 0);
  assert.equal(counter.increment(), 1);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { date: '2026-10-02', count: 1 });
});

test('ignores invalid stored data', () => {
  for (const raw of ['not json', '{"date":"2026-10-01","count":-1}', '{"date":"2026-10-01","count":1.5}', 'null', '{"count":3}']) {
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    const counter = createDailyCounter({ storage, today: () => '2026-10-01' });
    assert.equal(counter.get(), 0, raw);
    assert.equal(counter.increment(), 1, raw);
  }
});

test('works in memory when storage is missing or throws', () => {
  const none = createDailyCounter({ storage: null, today: () => '2026-10-01' });
  none.increment();
  assert.equal(none.get(), 1);

  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() {},
  };
  const counter = createDailyCounter({ storage: throwing, today: () => '2026-10-01' });
  assert.equal(counter.increment(), 1);
  assert.equal(counter.increment(), 2);
  assert.equal(counter.get(), 2);
});

// Storage that reads fine but fails every write (e.g. quota exceeded).
function readOnlyStorage(initial) {
  const storage = memoryStorage(initial);
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  return storage;
}

test('keeps counting in memory when writes fail on readable existing storage', () => {
  const storage = readOnlyStorage({
    [STORAGE_KEY]: JSON.stringify({ date: '2026-10-01', count: 2 }),
  });
  const counter = createDailyCounter({ storage, today: () => '2026-10-01' });
  assert.equal(counter.get(), 2);
  assert.equal(counter.increment(), 3);
  assert.equal(counter.get(), 3);
  assert.equal(counter.increment(), 4);
  assert.equal(counter.get(), 4);
  // Stale persisted value is untouched and ignored.
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { date: '2026-10-01', count: 2 });
});

test('rolls over while in memory fallback after a failed write', () => {
  let day = '2026-10-01';
  const storage = readOnlyStorage({
    [STORAGE_KEY]: JSON.stringify({ date: '2026-10-01', count: 2 }),
  });
  const counter = createDailyCounter({ storage, today: () => day });
  assert.equal(counter.increment(), 3);
  day = '2026-10-02';
  assert.equal(counter.get(), 0);
  assert.equal(counter.increment(), 1);
  assert.equal(counter.get(), 1);
  day = '2026-10-03';
  assert.equal(counter.get(), 0);
});

test('stops trusting storage after a failed read', () => {
  let failRead = false;
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({ date: '2026-10-01', count: 5 }),
  });
  const getItem = storage.getItem;
  storage.getItem = (k) => {
    if (failRead) throw new Error('denied');
    return getItem(k);
  };
  const counter = createDailyCounter({ storage, today: () => '2026-10-01' });
  assert.equal(counter.get(), 5);
  failRead = true;
  assert.equal(counter.increment(), 6);
  failRead = false;
  assert.equal(counter.get(), 6);
});
