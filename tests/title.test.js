import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentTitle } from '../src/title.js';

test('title is exactly "Focus Timer" with no sessions today', () => {
  assert.equal(documentTitle({ sessionsToday: 0 }), 'Focus Timer');
});

test('title ignores timer state when there are no sessions', () => {
  for (const status of ['idle', 'running', 'paused']) {
    assert.equal(
      documentTitle({ sessionsToday: 0, status, time: '12:34', label: 'Short break' }),
      'Focus Timer',
      status,
    );
  }
});

test('title shows the completed session count', () => {
  assert.equal(documentTitle({ sessionsToday: 1 }), '(1) Focus Timer');
  assert.equal(documentTitle({ sessionsToday: 3 }), '(3) Focus Timer');
});

test('title keeps the count format while a timer is active', () => {
  assert.equal(
    documentTitle({ sessionsToday: 4, status: 'running', time: '12:34', label: 'Focus' }),
    '(4) Focus Timer',
  );
});

test('title drops the count again after a reset', () => {
  assert.equal(documentTitle({ sessionsToday: 2 }), '(2) Focus Timer');
  assert.equal(documentTitle({ sessionsToday: 0 }), 'Focus Timer');
});

test('title returns to plain "Focus Timer" once the history is cleared', async () => {
  const { createHistory } = await import('../src/history.js');
  const history = createHistory({ storage: null, today: () => '2026-10-01' });
  history.recordSession(25 * 60 * 1000);
  assert.equal(documentTitle({ sessionsToday: history.todaySessions() }), '(1) Focus Timer');
  history.clearAll();
  assert.equal(documentTitle({ sessionsToday: history.todaySessions() }), 'Focus Timer');
});
