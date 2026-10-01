// Focus Timer core: a DOM- and storage-independent Pomodoro state machine.
//
// Timing is deadline-based. While running, the timer stores the absolute
// time at which the phase ends and derives the remaining time from the
// injected clock, so a throttled or late interval never makes it drift.
// Nothing here schedules work; the caller drives it by calling `tick()`.
//
// Rules:
// - Phases: work (25 min) -> short break (5 min) -> work ... After each
//   fourth *completed* work session the break is a long break (15 min),
//   after which the cycle starts over with work.
// - When a phase runs out it completes exactly once and the timer moves to
//   the next phase, stopped, waiting for an intentional start.
// - pause() keeps the exact remaining time; resume() continues from it.
// - reset() restarts the current phase from its full duration and stops it.
//   Completed sessions and cycle progress are kept.
// - skip() moves to the next phase, stopped. Skipped work is not counted as
//   completed and does not advance progress toward the long break; skipping
//   a work session therefore always leads to a short break. Skipping a long
//   break starts a fresh cycle.
// - Every action first settles an overdue deadline: if the phase has already
//   run out, it completes (and counts), and the action is consumed by that
//   completion instead of acting on the next phase.

export const PHASES = Object.freeze({
  WORK: 'work',
  SHORT_BREAK: 'shortBreak',
  LONG_BREAK: 'longBreak',
});

export const STATUSES = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
});

const MINUTE = 60 * 1000;

export const DEFAULT_DURATIONS = Object.freeze({
  [PHASES.WORK]: 25 * MINUTE,
  [PHASES.SHORT_BREAK]: 5 * MINUTE,
  [PHASES.LONG_BREAK]: 15 * MINUTE,
});

export const SESSIONS_BEFORE_LONG_BREAK = 4;

function validDuration(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Duration for ${name} must be a positive number of milliseconds`);
  }
  return value;
}

/**
 * @param {object} [options]
 * @param {() => number} [options.now] Clock returning milliseconds.
 * @param {Partial<typeof DEFAULT_DURATIONS>} [options.durations]
 * @param {number} [options.sessionsBeforeLongBreak]
 */
export function createTimer({
  now = () => Date.now(),
  durations = {},
  sessionsBeforeLongBreak = SESSIONS_BEFORE_LONG_BREAK,
} = {}) {
  const lengths = {};
  for (const phase of Object.values(PHASES)) {
    lengths[phase] = validDuration(durations[phase] ?? DEFAULT_DURATIONS[phase], phase);
  }
  if (!Number.isInteger(sessionsBeforeLongBreak) || sessionsBeforeLongBreak < 1) {
    throw new RangeError('sessionsBeforeLongBreak must be a positive integer');
  }

  let phase = PHASES.WORK;
  let status = STATUSES.IDLE;
  let remaining = lengths[phase]; // authoritative unless running
  let deadline = null; // authoritative while running
  let cycleCompleted = 0; // completed work sessions toward the next long break
  let completedWorkSessions = 0; // completed work sessions for this timer
  const listeners = new Set();

  function emit(event) {
    for (const listener of [...listeners]) listener(event);
  }

  function remainingMs() {
    if (status === STATUSES.RUNNING) return Math.max(0, deadline - now());
    return remaining;
  }

  function enter(nextPhase) {
    phase = nextPhase;
    status = STATUSES.IDLE;
    remaining = lengths[nextPhase];
    deadline = null;
  }

  function complete() {
    const finished = phase;
    let next;
    if (finished === PHASES.WORK) {
      completedWorkSessions += 1;
      cycleCompleted += 1;
      next = cycleCompleted >= sessionsBeforeLongBreak ? PHASES.LONG_BREAK : PHASES.SHORT_BREAK;
    } else {
      if (finished === PHASES.LONG_BREAK) cycleCompleted = 0;
      next = PHASES.WORK;
    }
    enter(next);
    const event = { type: 'complete', phase: finished, nextPhase: next };
    emit(event);
    return event;
  }

  /** Completes the running phase if its deadline has passed. */
  function tick() {
    if (status === STATUSES.RUNNING && now() >= deadline) return complete();
    return null;
  }

  function run(type) {
    status = STATUSES.RUNNING;
    deadline = now() + remaining;
    emit({ type, phase });
    return true;
  }

  function start() {
    if (tick()) return false;
    if (status !== STATUSES.IDLE) return false;
    return run('start');
  }

  function resume() {
    if (status !== STATUSES.PAUSED) return false;
    return run('resume');
  }

  function pause() {
    if (tick()) return false;
    if (status !== STATUSES.RUNNING) return false;
    remaining = Math.max(0, deadline - now());
    deadline = null;
    status = STATUSES.PAUSED;
    emit({ type: 'pause', phase });
    return true;
  }

  /** Start, pause or resume depending on the current status. */
  function toggle() {
    if (status === STATUSES.RUNNING) return pause();
    if (status === STATUSES.PAUSED) return resume();
    return start();
  }

  function reset() {
    if (tick()) return false;
    enter(phase);
    emit({ type: 'reset', phase });
    return true;
  }

  function skip() {
    if (tick()) return false;
    const skipped = phase;
    let next;
    if (skipped === PHASES.WORK) {
      next = PHASES.SHORT_BREAK;
    } else {
      if (skipped === PHASES.LONG_BREAK) cycleCompleted = 0;
      next = PHASES.WORK;
    }
    enter(next);
    emit({ type: 'skip', phase: skipped, nextPhase: next });
    return true;
  }

  function getState() {
    return {
      phase,
      status,
      remainingMs: remainingMs(),
      durationMs: lengths[phase],
      cycleCompleted,
      completedWorkSessions,
      sessionsBeforeLongBreak,
    };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { start, pause, resume, toggle, reset, skip, tick, getState, subscribe };
}

/** Formats milliseconds as M:SS, rounding up so 0:00 only shows at the end. */
export function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
