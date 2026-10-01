import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimer,
  formatTime,
  DEFAULT_DURATIONS,
  PHASES,
  STATUSES,
  SESSIONS_BEFORE_LONG_BREAK,
} from '../src/timer.js';

const MIN = 60 * 1000;

function setup(options = {}) {
  let t = 1_000_000;
  const clock = {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
  const timer = createTimer({ now: clock.now, ...options });
  const events = [];
  timer.subscribe((e) => events.push(e));
  return { timer, clock, events };
}

// Starts the current phase and lets it run out.
function finishPhase(timer, clock) {
  timer.start();
  clock.advance(timer.getState().remainingMs);
  return timer.tick();
}

test('default durations are 25/5/15 minutes with long break every 4 sessions', () => {
  assert.equal(DEFAULT_DURATIONS.work, 25 * MIN);
  assert.equal(DEFAULT_DURATIONS.shortBreak, 5 * MIN);
  assert.equal(DEFAULT_DURATIONS.longBreak, 15 * MIN);
  assert.equal(SESSIONS_BEFORE_LONG_BREAK, 4);

  const { timer } = setup();
  assert.deepEqual(timer.getState(), {
    phase: PHASES.WORK,
    status: STATUSES.IDLE,
    remainingMs: 25 * MIN,
    durationMs: 25 * MIN,
    cycleCompleted: 0,
    completedWorkSessions: 0,
    sessionsBeforeLongBreak: 4,
  });
});

test('rejects invalid configuration', () => {
  assert.throws(() => createTimer({ durations: { work: 0 } }), RangeError);
  assert.throws(() => createTimer({ durations: { shortBreak: Number.NaN } }), RangeError);
  assert.throws(() => createTimer({ sessionsBeforeLongBreak: 0 }), RangeError);
});

test('counts down from elapsed time, not from ticks', () => {
  const { timer, clock } = setup();
  timer.start();
  clock.advance(10 * MIN + 500);
  // No tick calls in between: remaining is derived from the deadline.
  assert.equal(timer.getState().remainingMs, 15 * MIN - 500);
  assert.equal(timer.getState().status, STATUSES.RUNNING);
});

test('work completes into a stopped short break, then back to stopped work', () => {
  const { timer, clock, events } = setup();
  const done = finishPhase(timer, clock);
  assert.deepEqual(done, { type: 'complete', phase: PHASES.WORK, nextPhase: PHASES.SHORT_BREAK });

  let s = timer.getState();
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.status, STATUSES.IDLE);
  assert.equal(s.remainingMs, 5 * MIN);
  assert.equal(s.completedWorkSessions, 1);
  assert.equal(s.cycleCompleted, 1);

  // Stays stopped: time passing does not start the break.
  clock.advance(60 * MIN);
  assert.equal(timer.tick(), null);
  assert.equal(timer.getState().remainingMs, 5 * MIN);

  finishPhase(timer, clock);
  s = timer.getState();
  assert.equal(s.phase, PHASES.WORK);
  assert.equal(s.status, STATUSES.IDLE);
  assert.equal(s.remainingMs, 25 * MIN);
  assert.equal(s.completedWorkSessions, 1);
  assert.deepEqual(
    events.filter((e) => e.type === 'complete').map((e) => e.phase),
    [PHASES.WORK, PHASES.SHORT_BREAK],
  );
});

test('long break after the fourth completed work session, then work again', () => {
  const { timer, clock } = setup();
  const sequence = [];
  for (let i = 0; i < 8; i++) {
    sequence.push(finishPhase(timer, clock).nextPhase);
  }
  assert.deepEqual(sequence, [
    PHASES.SHORT_BREAK, PHASES.WORK,
    PHASES.SHORT_BREAK, PHASES.WORK,
    PHASES.SHORT_BREAK, PHASES.WORK,
    PHASES.LONG_BREAK, PHASES.WORK,
  ]);
  const s = timer.getState();
  assert.equal(s.phase, PHASES.WORK);
  assert.equal(s.cycleCompleted, 0);
  assert.equal(s.completedWorkSessions, 4);
});

test('long break lasts 15 minutes and cycle progress shows 4 during it', () => {
  const { timer, clock } = setup();
  for (let i = 0; i < 7; i++) finishPhase(timer, clock);
  const s = timer.getState();
  assert.equal(s.phase, PHASES.LONG_BREAK);
  assert.equal(s.remainingMs, 15 * MIN);
  assert.equal(s.cycleCompleted, 4);
});

test('later cycles repeat the same pattern', () => {
  const { timer, clock } = setup();
  const breaks = [];
  for (let i = 0; i < 24; i++) {
    const e = finishPhase(timer, clock);
    if (e.phase === PHASES.WORK) breaks.push(e.nextPhase);
  }
  const L = PHASES.LONG_BREAK;
  const S = PHASES.SHORT_BREAK;
  assert.deepEqual(breaks, [S, S, S, L, S, S, S, L, S, S, S, L]);
  assert.equal(timer.getState().completedWorkSessions, 12);
});

test('pause preserves remaining time and resume continues from it', () => {
  const { timer, clock } = setup();
  timer.start();
  clock.advance(7 * MIN + 250);
  assert.equal(timer.pause(), true);
  let s = timer.getState();
  assert.equal(s.status, STATUSES.PAUSED);
  assert.equal(s.remainingMs, 18 * MIN - 250);

  clock.advance(3 * 60 * MIN); // long pause does not consume time
  assert.equal(timer.tick(), null);
  assert.equal(timer.getState().remainingMs, 18 * MIN - 250);

  assert.equal(timer.resume(), true);
  clock.advance(18 * MIN - 251);
  assert.equal(timer.tick(), null);
  assert.equal(timer.getState().remainingMs, 1);
  clock.advance(1);
  assert.equal(timer.tick().phase, PHASES.WORK);
});

test('toggle starts, pauses and resumes', () => {
  const { timer, clock } = setup();
  timer.toggle();
  assert.equal(timer.getState().status, STATUSES.RUNNING);
  clock.advance(MIN);
  timer.toggle();
  assert.equal(timer.getState().status, STATUSES.PAUSED);
  timer.toggle();
  assert.equal(timer.getState().status, STATUSES.RUNNING);
  assert.equal(timer.getState().remainingMs, 24 * MIN);
});

test('invalid transitions are no-ops', () => {
  const { timer, clock, events } = setup();
  assert.equal(timer.pause(), false);
  assert.equal(timer.resume(), false);
  timer.start();
  assert.equal(timer.start(), false, 'second start does not restart');
  assert.equal(timer.resume(), false);
  clock.advance(MIN);
  timer.pause();
  assert.equal(timer.pause(), false);
  assert.equal(timer.start(), false, 'start does not resume a pause');
  assert.deepEqual(events.map((e) => e.type), ['start', 'pause']);
  assert.equal(timer.getState().remainingMs, 24 * MIN);
});

test('reset restarts the current phase stopped and keeps completed sessions', () => {
  const { timer, clock } = setup();
  finishPhase(timer, clock); // work done
  finishPhase(timer, clock); // short break done
  timer.start();
  clock.advance(10 * MIN);
  assert.equal(timer.reset(), true);
  let s = timer.getState();
  assert.equal(s.phase, PHASES.WORK);
  assert.equal(s.status, STATUSES.IDLE);
  assert.equal(s.remainingMs, 25 * MIN);
  assert.equal(s.completedWorkSessions, 1);
  assert.equal(s.cycleCompleted, 1);

  // From paused, and during a break.
  finishPhase(timer, clock);
  timer.start();
  clock.advance(2 * MIN);
  timer.pause();
  timer.reset();
  s = timer.getState();
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.status, STATUSES.IDLE);
  assert.equal(s.remainingMs, 5 * MIN);
  assert.equal(s.completedWorkSessions, 2);

  // Stays stopped after reset.
  clock.advance(10 * MIN);
  assert.equal(timer.tick(), null);
});

test('skipping work does not count it and leads to a short break', () => {
  const { timer, clock, events } = setup();
  timer.start();
  clock.advance(24 * MIN);
  assert.equal(timer.skip(), true);
  const s = timer.getState();
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.status, STATUSES.IDLE);
  assert.equal(s.remainingMs, 5 * MIN);
  assert.equal(s.completedWorkSessions, 0);
  assert.equal(s.cycleCompleted, 0);
  assert.equal(events.filter((e) => e.type === 'complete').length, 0);
  assert.deepEqual(events.at(-1), { type: 'skip', phase: PHASES.WORK, nextPhase: PHASES.SHORT_BREAK });
});

test('skipped work grants no progress toward the long break', () => {
  const { timer, clock } = setup();
  for (let i = 0; i < 3; i++) {
    finishPhase(timer, clock); // work
    finishPhase(timer, clock); // short break
  }
  assert.equal(timer.getState().cycleCompleted, 3);

  timer.skip(); // skip the would-be fourth work session
  assert.equal(timer.getState().phase, PHASES.SHORT_BREAK);
  timer.skip(); // skip the break
  assert.equal(timer.getState().phase, PHASES.WORK);
  assert.equal(timer.getState().cycleCompleted, 3);

  assert.equal(finishPhase(timer, clock).nextPhase, PHASES.LONG_BREAK);
  assert.equal(timer.getState().completedWorkSessions, 4);
});

test('skipping breaks returns to work; skipping a long break starts a new cycle', () => {
  const { timer, clock } = setup();
  finishPhase(timer, clock);
  timer.skip();
  assert.equal(timer.getState().phase, PHASES.WORK);
  assert.equal(timer.getState().cycleCompleted, 1);

  for (let i = 0; i < 3; i++) {
    finishPhase(timer, clock);
    if (timer.getState().phase === PHASES.SHORT_BREAK) timer.skip();
  }
  assert.equal(timer.getState().phase, PHASES.LONG_BREAK);
  timer.skip();
  const s = timer.getState();
  assert.equal(s.phase, PHASES.WORK);
  assert.equal(s.cycleCompleted, 0);
  assert.equal(s.completedWorkSessions, 4);
});

test('phase completes exactly at the deadline, not before', () => {
  const { timer, clock } = setup();
  timer.start();
  clock.advance(25 * MIN - 1);
  assert.equal(timer.tick(), null);
  assert.equal(timer.getState().remainingMs, 1);
  clock.advance(1);
  assert.equal(timer.getState().remainingMs, 0);
  assert.equal(timer.tick().type, 'complete');
});

test('completion fires once even with repeated or late ticks', () => {
  const { timer, clock, events } = setup();
  timer.start();
  clock.advance(3 * 60 * MIN); // e.g. a long-throttled background tab
  assert.ok(timer.tick());
  assert.equal(timer.tick(), null);
  assert.equal(timer.tick(), null);
  const completes = events.filter((e) => e.type === 'complete');
  assert.equal(completes.length, 1);
  // Late tick does not cascade through the following break.
  const s = timer.getState();
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.status, STATUSES.IDLE);
  assert.equal(s.remainingMs, 5 * MIN);
  assert.equal(s.completedWorkSessions, 1);
});

test('actions after an overdue deadline settle the completion first', () => {
  for (const action of ['pause', 'toggle', 'reset', 'skip', 'start']) {
    const { timer, clock, events } = setup();
    timer.start();
    clock.advance(25 * MIN + 10);
    assert.equal(timer[action](), false, action);
    const s = timer.getState();
    assert.equal(s.phase, PHASES.SHORT_BREAK, action);
    assert.equal(s.status, STATUSES.IDLE, action);
    assert.equal(s.remainingMs, 5 * MIN, action);
    assert.equal(s.completedWorkSessions, 1, action);
    assert.equal(events.filter((e) => e.type === 'complete').length, 1, action);
  }
});

test('remaining time never goes negative', () => {
  const { timer, clock } = setup();
  timer.start();
  clock.advance(30 * MIN);
  assert.equal(timer.getState().remainingMs, 0);
});

test('custom durations are honoured', () => {
  const { timer, clock } = setup({ durations: { work: 1000, shortBreak: 200 } });
  assert.equal(timer.getState().remainingMs, 1000);
  finishPhase(timer, clock);
  assert.equal(timer.getState().remainingMs, 200);
});

test('unsubscribe stops events', () => {
  const timer = createTimer({ now: () => 0 });
  const seen = [];
  const off = timer.subscribe((e) => seen.push(e.type));
  timer.start();
  off();
  timer.pause();
  assert.deepEqual(seen, ['start']);
});

test('formatTime rounds up to whole seconds', () => {
  assert.equal(formatTime(25 * MIN), '25:00');
  assert.equal(formatTime(25 * MIN - 1), '25:00');
  assert.equal(formatTime(24 * MIN + 59_001), '25:00');
  assert.equal(formatTime(24 * MIN + 59_000), '24:59');
  assert.equal(formatTime(1), '00:01');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(-50), '00:00');
});
