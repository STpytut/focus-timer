// Wires the timer core, daily counter, settings, sound, notifications and
// keyboard shortcuts to the page.

import { createTimer, cycleText, formatTime, PHASES, STATUSES } from './timer.js';
import { createDailyCounter, getSafeStorage } from './daily.js';
import { createSettingsStore, parseSettingsForm, toTimerConfig } from './settings.js';
import { createChime } from './sound.js';
import { createNotifier, PERMISSION } from './notify.js';
import { shortcutFor } from './keyboard.js';

const TICK_MS = 250;
const MAX_DOTS = 12;

const PHASE_LABELS = {
  [PHASES.WORK]: 'Focus',
  [PHASES.SHORT_BREAK]: 'Short break',
  [PHASES.LONG_BREAK]: 'Long break',
};

const NUMBER_FIELDS = ['workMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'sessionsBeforeLongBreak'];

const PERMISSION_TEXT = {
  [PERMISSION.DEFAULT]: 'Get a notification when a phase ends while this tab is in the background.',
  [PERMISSION.GRANTED]: 'Notifications are allowed. You will be notified when a phase ends while this tab is in the background.',
  [PERMISSION.DENIED]: 'Notifications are blocked. You can allow them in your browser’s site settings.',
  [PERMISSION.UNSUPPORTED]: 'This browser does not support notifications for this page.',
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
  settingsOpen: document.getElementById('settings-open'),
  settings: document.getElementById('settings'),
  settingsForm: document.getElementById('settings-form'),
  settingsCancel: document.getElementById('settings-cancel'),
  notifyStatus: document.getElementById('notify-status'),
  notifyRequest: document.getElementById('notify-request'),
};

const storage = getSafeStorage();
const settings = createSettingsStore({ storage });
const timer = createTimer(toTimerConfig(settings.get()));
const daily = createDailyCounter({ storage });
const chime = createChime();
const notifier = createNotifier();

let loopId = null;
let lastDailyCount = -1;

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

function onComplete(event) {
  if (event.phase === PHASES.WORK) daily.increment();
  const finished = `${PHASE_LABELS[event.phase]} finished.`;
  const next = event.autoStarted
    ? `${PHASE_LABELS[event.nextPhase]} has started.`
    : `${PHASE_LABELS[event.nextPhase]} is ready to start.`;
  announce(`${finished} ${next}`);
  if (settings.get().sound) chime.play();
  notifier.notify({ hidden: document.visibilityState === 'hidden', title: finished, body: next });
}

timer.subscribe((event) => {
  if (event.type === 'complete') {
    onComplete(event);
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
  const action = shortcutFor(event, { modalOpen: el.settings.open });
  if (!action) return;
  event.preventDefault();
  if (action === 'toggle') timer.toggle();
  else timer.reset();
});

// Browsers only allow audio after a user gesture, so prepare the chime on
// any click or key press while sound is on; completion can then play it.
for (const type of ['pointerdown', 'keydown']) {
  document.addEventListener(type, () => {
    if (settings.get().sound) chime.unlock();
  }, { capture: true });
}

// --- Settings dialog ---

function field(name) {
  return el.settingsForm.elements.namedItem(name);
}

function showErrors(errors) {
  for (const name of NUMBER_FIELDS) {
    const input = field(name);
    const error = document.getElementById(`${input.id}-error`);
    const message = errors[name];
    error.textContent = message ?? '';
    error.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function fillForm(values) {
  for (const name of NUMBER_FIELDS) field(name).value = String(values[name]);
  field('autoStart').checked = values.autoStart;
  field('sound').checked = values.sound;
  showErrors({});
}

function renderPermission() {
  const state = notifier.permission();
  el.notifyStatus.textContent = PERMISSION_TEXT[state];
  el.notifyRequest.hidden = state !== PERMISSION.DEFAULT;
}

function openSettings() {
  fillForm(settings.get()); // always start from the saved values
  renderPermission();
  el.settings.showModal();
  field('workMinutes').focus();
}

el.settingsOpen.addEventListener('click', openSettings);

// Covers Save, Cancel and Escape: focus goes back to the gear.
el.settings.addEventListener('close', () => el.settingsOpen.focus());

el.settingsCancel.addEventListener('click', () => el.settings.close());

el.settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const result = parseSettingsForm({
    ...Object.fromEntries(NUMBER_FIELDS.map((name) => [name, field(name).value])),
    autoStart: field('autoStart').checked,
    sound: field('sound').checked,
  });
  if (!result.ok) {
    showErrors(result.errors);
    const first = NUMBER_FIELDS.find((name) => result.errors[name]);
    if (first) field(first).focus();
    return;
  }
  const saved = settings.save(result.value);
  if (!saved.ok) return;
  if (saved.value.sound) chime.unlock(); // Save is a user gesture.
  timer.configure(toTimerConfig(saved.value));
  el.settings.close();
  announce(saved.persisted ? 'Settings saved.' : 'Settings applied for this visit; they could not be stored.');
});

el.notifyRequest.addEventListener('click', async () => {
  el.notifyRequest.disabled = true;
  await notifier.requestPermission();
  el.notifyRequest.disabled = false;
  renderPermission();
  // The button hides once a choice is made; keep focus inside the dialog.
  if (el.notifyRequest.hidden && el.settings.open) el.notifyStatus.focus();
});

// Catch up immediately when returning to a throttled background tab.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onTick();
});

// Refresh the daily count occasionally so it rolls over at midnight.
setInterval(renderDaily, 60 * 1000);

render();
