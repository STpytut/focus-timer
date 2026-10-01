// Wires the timer core, daily counter and keyboard shortcuts to the page.

import { createTimer, formatTime, PHASES, STATUSES } from './timer.js';
import { createDailyCounter, getSafeStorage } from './daily.js';
import { shortcutFor } from './keyboard.js';

const TICK_MS = 250;
const MAX_DOTS = 12;

const PHASE_LABELS = {
  [PHASES.WORK]: 'Focus',
  [PHASES.SHORT_BREAK]: 'Short break',
  [PHASES.LONG_BREAK]: 'Long break',
};

const el = {
  phase: document.getElementById('phase'),
  cycle: document.getElementById('cycle'),
  time: document.getElementById('time'),
  toggle: document.getElementById('toggle'),
  reset: document.getElementById('reset'),
  skip: document.getElementById('skip'),
  dots: document.getElementById('dots'),
  todayCount: document.getElementById('today-count'),
  announcer: document.getElementById('announcer'),
};

const timer = createTimer();
const daily = createDailyCounter({ storage: getSafeStorage() });

let loopId = null;
let lastDailyCount = -1;

function cycleText(state) {
  const { phase, cycleCompleted, sessionsBeforeLongBreak: total } = state;
  if (phase === PHASES.WORK) return `Session ${cycleCompleted + 1} of ${total}`;
  if (phase === PHASES.LONG_BREAK) return `${total} of ${total} done · cycle complete`;
  return `${cycleCompleted} of ${total} done`;
}

function toggleLabel(status) {
  if (status === STATUSES.RUNNING) return 'Pause';
  if (status === STATUSES.PAUSED) return 'Resume';
  return 'Start';
}

function renderDaily() {
  const count = daily.get();
  if (count === lastDailyCount) return;
  lastDailyCount = count;

  const shown = Math.min(count, MAX_DOTS);
  el.dots.replaceChildren(
    ...Array.from({ length: shown }, () => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      return dot;
    }),
  );
  if (count > MAX_DOTS) {
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = `+${count - MAX_DOTS}`;
    el.dots.append(more);
  }
  el.todayCount.textContent =
    count === 0
      ? 'No sessions completed yet today'
      : `${count} ${count === 1 ? 'session' : 'sessions'} completed today`;
}

function render() {
  const state = timer.getState();
  const time = formatTime(state.remainingMs);
  const label = PHASE_LABELS[state.phase];

  document.body.dataset.phase = state.phase;
  document.body.dataset.status = state.status;
  el.phase.textContent = label;
  el.cycle.textContent = cycleText(state);
  if (el.time.textContent !== time) el.time.textContent = time;
  el.toggle.textContent = toggleLabel(state.status);
  el.skip.textContent = state.phase === PHASES.WORK ? 'Skip to break' : 'Skip to focus';
  document.title = state.status === STATUSES.IDLE ? 'Focus Timer' : `${time} · ${label}`;
  renderDaily();
}

function announce(message) {
  el.announcer.textContent = message;
}

// One loop at most, running only while the timer runs.
function syncLoop() {
  const running = timer.getState().status === STATUSES.RUNNING;
  if (running && loopId === null) {
    loopId = setInterval(onTick, TICK_MS);
  } else if (!running && loopId !== null) {
    clearInterval(loopId);
    loopId = null;
  }
}

function onTick() {
  timer.tick();
  render();
}

timer.subscribe((event) => {
  if (event.type === 'complete') {
    if (event.phase === PHASES.WORK) daily.increment();
    announce(`${PHASE_LABELS[event.phase]} finished. ${PHASE_LABELS[event.nextPhase]} is ready to start.`);
  } else if (event.type === 'skip') {
    announce(`Skipped. ${PHASE_LABELS[event.nextPhase]} is ready to start.`);
  } else if (event.type === 'reset') {
    announce(`${PHASE_LABELS[event.phase]} reset.`);
  }
  syncLoop();
  render();
});

el.toggle.addEventListener('click', () => timer.toggle());
el.reset.addEventListener('click', () => timer.reset());
el.skip.addEventListener('click', () => timer.skip());

document.addEventListener('keydown', (event) => {
  const action = shortcutFor(event);
  if (!action) return;
  event.preventDefault();
  if (action === 'toggle') timer.toggle();
  else timer.reset();
});

// Catch up immediately when returning to a throttled background tab.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onTick();
});

// Refresh the daily count occasionally so it rolls over at midnight.
setInterval(renderDaily, 60 * 1000);

render();
