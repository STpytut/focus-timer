import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streakText } from '../src/streak.js';
import { createHistory } from '../src/history.js';
import { localDateKey } from '../src/daily.js';

const DAY = 24 * 60 * 60 * 1000;
const FOCUS = 25 * 60 * 1000;

function historyAt(clock) {
  return createHistory({ today: () => localDateKey(new Date(clock.t)) });
}

test('streak text shows the flame and day count', () => {
  assert.equal(streakText(1), '🔥 1-day streak');
  assert.equal(streakText(12), '🔥 12-day streak');
});

test('streak text is empty (hidden) at zero or invalid values', () => {
  for (const v of [0, -1, NaN, undefined, null, 1.5]) assert.equal(streakText(v), '', String(v));
});

test('history.streak counts today and consecutive earlier days', () => {
  const clock = { t: new Date(2026, 9, 1, 12).getTime() };
  const h = historyAt(clock);
  assert.equal(streakText(h.streak()), '');
  h.recordSession(FOCUS);
  assert.equal(streakText(h.streak()), '🔥 1-day streak');
  clock.t += DAY;
  h.recordSession(FOCUS);
  h.recordSession(FOCUS);
  assert.equal(streakText(h.streak()), '🔥 2-day streak');
});

test('history.streak survives a day without sessions yet, then ends after a gap', () => {
  const clock = { t: new Date(2026, 9, 1, 12).getTime() };
  const h = historyAt(clock);
  h.recordSession(FOCUS);
  clock.t += DAY;
  assert.equal(h.streak(), 1); // ends yesterday
  clock.t += DAY;
  assert.equal(h.streak(), 0);
  assert.equal(streakText(h.streak()), '');
});

test('break sessions do not count towards the streak', () => {
  const clock = { t: new Date(2026, 9, 1, 12).getTime() };
  const h = historyAt(clock);
  h.recordCompletion('short break', 5 * 60 * 1000);
  assert.equal(h.streak(), 0);
});

test('a gap is not bridged and reset today drops the streak back', () => {
  const clock = { t: new Date(2026, 9, 1, 12).getTime() };
  const h = historyAt(clock);
  h.recordSession(FOCUS);
  clock.t += 2 * DAY;
  h.recordSession(FOCUS);
  assert.equal(h.streak(), 1);
  h.resetToday();
  assert.equal(h.streak(), 0);
});
