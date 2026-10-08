import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentTitle } from '../src/title.js';

const idle = { running: false, time: '25:00', label: 'Focus' };

test('title stays plain with no sessions today', () => {
  assert.equal(documentTitle({ ...idle, sessionsToday: 0 }), 'Focus Timer');
});

test('title shows the completed session count', () => {
  assert.equal(documentTitle({ ...idle, sessionsToday: 3 }), '(3) Focus Timer');
});

test('title drops the count again after a reset', () => {
  assert.equal(documentTitle({ ...idle, sessionsToday: 2 }), '(2) Focus Timer');
  assert.equal(documentTitle({ ...idle, sessionsToday: 0 }), 'Focus Timer');
});

test('title combines the countdown and the count while running', () => {
  const running = { running: true, time: '12:34', label: 'Short break' };
  assert.equal(documentTitle({ ...running, sessionsToday: 0 }), '12:34 · Short break');
  assert.equal(documentTitle({ ...running, sessionsToday: 4 }), '(4) 12:34 · Short break');
});
