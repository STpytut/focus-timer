// Wires the timer core, focus history, settings, sound, notifications and
// keyboard shortcuts to the page, including the Settings dialog and the
// Stats view.

import { createTimer, cycleText, formatTime, PHASES, STATUSES } from './timer.js';
import { getSafeStorage, localDateKey } from './daily.js';
import { createHistory, parseDateKey } from './history.js';
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
  timerView: document.getElementById('timer-view'),
  statsOpen: document.getElementById('stats-open'),
  statsView: document.getElementById('stats-view'),
  statsTitle: document.getElementById('stats-title'),
  statsBack: document.getElementById('stats-back'),
  statToday: document.getElementById('stat-today'),
  statTodaySessions: document.getElementById('stat-today-sessions'),
  statWeek: document.getElementById('stat-week'),
  statStreak: document.getElementById('stat-streak'),
  chart: document.getElementById('chart'),
  statsEmpty: document.getElementById('stats-empty'),
  statsExport: document.getElementById('stats-export'),
};

const storage = getSafeStorage();
const settings = createSettingsStore({ storage });
const timer = createTimer(toTimerConfig(settings.get()));
const history = createHistory({ storage });
const chime = createChime();
const notifier = createNotifier();

let loopId = null;
let lastDailyCount = -1;

function toggleLabel(status) {
  if (status === STATUSES.RUNNING) return 'Pause';
  if (status === STATUSES.PAUSED) return 'Resume';
  return 'Start';
}

function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function renderDaily() {
  const count = history.todaySessions();
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
  if (event.phase === PHASES.WORK) {
    history.recordSession(event.durationMs);
    if (statsShown()) renderStats();
  }
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
  if (event.key === 'Escape' && statsShown() && !el.settings.open) {
    event.preventDefault();
    showTimer();
    return;
  }
  const action = shortcutFor(event, { modalOpen: el.settings.open, statsOpen: statsShown() });
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

// --- Stats view ---

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

function statsShown() {
  return !el.statsView.hidden;
}

function formatMinutes(minutes) {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const rest = total % 60;
  return rest === 0 ? `${Math.floor(total / 60)} h` : `${Math.floor(total / 60)} h ${rest} min`;
}

function chartDay(day, isToday, max) {
  const date = parseDateKey(day.date);
  const item = document.createElement('li');
  item.className = isToday ? 'chart-day is-today' : 'chart-day';

  const count = document.createElement('span');
  count.className = 'chart-count';
  count.setAttribute('aria-hidden', 'true');
  count.textContent = String(day.sessions);

  // The track is always full height, so every day (zero too) has a labelled
  // graphic for assistive technology.
  const track = document.createElement('span');
  track.className = 'chart-track';
  track.setAttribute('role', 'img');
  track.setAttribute(
    'aria-label',
    `${fullDate.format(date)}${isToday ? ' (today)' : ''}: ${plural(day.sessions, 'session')}, ${formatMinutes(day.minutes)}`,
  );
  const bar = document.createElement('span');
  bar.className = 'chart-bar';
  bar.style.height = `${(day.sessions / max) * 100}%`;
  track.append(bar);

  const label = document.createElement('span');
  label.className = 'chart-label';
  label.setAttribute('aria-hidden', 'true');
  const weekday = document.createElement('span');
  weekday.textContent = isToday ? 'Today' : weekdayShort.format(date);
  const short = document.createElement('span');
  short.textContent = monthDay.format(date);
  label.append(weekday, short);

  item.append(count, track, label);
  return item;
}

function renderStats() {
  const stats = history.stats(7);
  el.statToday.textContent = formatMinutes(stats.todayMinutes);
  el.statTodaySessions.textContent = plural(stats.todaySessions, 'session');
  el.statWeek.textContent = formatMinutes(stats.weekMinutes);
  el.statStreak.textContent = plural(stats.streak, 'day');
  const max = Math.max(1, ...stats.days.map((day) => day.sessions));
  el.chart.replaceChildren(...stats.days.map((day) => chartDay(day, day.date === stats.today, max)));
  el.statsEmpty.hidden = stats.recordedDays > 0;
}

// The timer keeps running while Stats is shown; only the view changes.
function showStats() {
  renderStats();
  el.timerView.hidden = true;
  el.statsOpen.hidden = true;
  el.statsView.hidden = false;
  el.statsTitle.focus();
}

function showTimer() {
  el.statsView.hidden = true;
  el.timerView.hidden = false;
  el.statsOpen.hidden = false;
  render();
  el.statsOpen.focus();
}

el.statsOpen.addEventListener('click', showStats);
el.statsBack.addEventListener('click', showTimer);

el.statsExport.addEventListener('click', () => {
  const csv = history.csv();
  const days = csv.trimEnd().split('\n').length - 1;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `focus-timer-history-${localDateKey()}.csv`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(days === 0
    ? 'No history yet. Exported a CSV with only the header row.'
    : `Exported ${plural(days, 'day')} of history.`);
});

// Catch up immediately when returning to a throttled background tab.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onTick();
});

// Refresh the daily count and stats occasionally so they roll over at midnight.
setInterval(() => {
  renderDaily();
  if (statsShown()) renderStats();
}, 60 * 1000);

render();
