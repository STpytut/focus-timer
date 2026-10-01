# Focus Timer

A calm, dependency-free Pomodoro timer for the browser. Plain HTML, CSS and
ES modules — no build step, no external assets or fonts. It follows your
system's light/dark preference and works on narrow phone screens.

- **Focus** for 25 minutes, then a **short break** of 5 minutes.
- After every fourth *completed* focus session the break is a **long break**
  of 15 minutes; then a new cycle begins with focus.
- All of these lengths can be changed in **Settings** (the gear button), along
  with optional auto-start, an end-of-phase chime and background
  notifications.
- A row of dots shows the focus sessions you completed today. The count is
  saved in `localStorage` and starts again at zero on a new local day. If
  storage is unavailable, holds invalid data, or fails later (for example when
  full), the count is kept in memory for the current page.

## Run it

ES modules do not load from `file://`, so serve the folder with any static
server, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Tests

Requires Node.js 18 or newer; there is nothing to install.

```sh
node --test
```

Tests use an injected clock, so they are deterministic and run without real
waiting. Storage, Web Audio and the Notification API are replaced with small
fakes, so the suites run in Node without a browser.

## Settings

Open Settings with the gear button in the top-right corner.

| Setting                             | Default | Allowed            |
| ----------------------------------- | ------- | ------------------ |
| Focus length                        | 25 min  | whole minutes 1–90 |
| Short break length                  | 5 min   | whole minutes 1–90 |
| Long break length                   | 15 min  | whole minutes 1–90 |
| Focus sessions before a long break  | 4       | whole number 2–8   |
| Start the next phase automatically  | off     | on / off           |
| Play a chime when a phase ends      | off     | on / off           |

- **Save** applies the settings; **Cancel** (or `Escape`) discards the
  changes. Invalid values are explained next to the field and nothing is
  applied or stored until every field is valid.
- Settings are saved in `localStorage` under `focus-timer:settings`, separate
  from the daily count (`focus-timer:daily`), so neither can damage the other.
  An unreadable or malformed stored value falls back to the defaults (invalid
  individual fields fall back on their own). If storage is unavailable or a
  save fails, the new settings still apply for the current page.

### Changing settings while the timer runs

- A phase that has already been started — running or paused — keeps the
  length and remaining time it started with. New lengths apply to the
  following phases, and to the current phase when you press **Reset**.
- A phase that has not been started yet switches to the new length at once.
- Completed sessions, progress in the current cycle and today's count are
  kept. A new "sessions before a long break" value is checked the next time a
  focus session completes: if you lower it below the progress you have
  already made, the next completed focus session leads to the long break.

### Auto-start

When on, the next phase starts by itself when a phase *finishes*. Skip and
Reset still leave the timer stopped. The next phase is timed from when the
page notices the completion, so a background tab that was throttled for a
long time does not race through phases that nobody saw; it completes the one
phase that ran out and starts the next one fresh.

### Sound

The chime is synthesized with the Web Audio API (two short sine tones); there
are no audio files. Browsers only allow audio after you interact with the
page, so the audio is prepared when you save with sound on and on any click
or key press while it is on. If Web Audio is unavailable or blocked, the
timer simply stays silent. The chime plays only when a phase finishes, not on
Skip or Reset.

### Notifications

The **Allow notifications** button in Settings asks the browser for
permission; the page never asks on load or when Settings opens. Settings
shows whether notifications are allowed, blocked, not yet decided, or not
supported. When allowed, a notification appears when a phase finishes while
the tab is in the background (hidden) — not when the page is visible, and not
on Skip or Reset. To stop them, block notifications for the site in your
browser.

Limitations: notifications need a secure context (`https://` or
`localhost`). Some browsers (for example Chrome on Android) only show
notifications from a service worker, which this app does not use; there the
button may work but no notification appears. Browsers throttle timers in
background tabs, so a background chime or notification can arrive late (up
to about a minute in some browsers); the countdown itself stays accurate.

## Keyboard shortcuts

| Key     | Action                       |
| ------- | ---------------------------- |
| `Space` | Start / pause / resume       |
| `R`     | Reset the current phase      |

Shortcuts are ignored for held-down (repeated) keys, with Ctrl/Cmd/Alt, and
while typing in a text field. When a button has keyboard focus, `Space`
activates that button as usual rather than also triggering the shortcut.

The Settings dialog is a native modal `<dialog>`: focus moves to the first
field when it opens, the rest of the page is inert so `Tab` cannot reach
it, `Escape` closes the dialog like
Cancel, and closing it in any way returns focus to the gear button. Timer
shortcuts are off while it is open.

## How the controls behave

- **Start / Pause / Resume** — one button. Pausing keeps the exact remaining
  time; resuming continues from it.
- **Reset** — restarts the current phase from its full length (using the
  latest settings) and stops it. Completed sessions and progress toward the
  long break are kept.
- **Skip** — moves to the next phase, stopped. A skipped focus session is not
  counted as completed and gives no progress toward the long break, so
  skipping focus always leads to a short break. Skipping a break goes back to
  focus; skipping a long break starts a new cycle.
- **When a phase ends**, it counts once and the next phase is shown stopped,
  so each phase is started intentionally — unless auto-start is on.

Under the phase name, "Session N of 4" shows progress in the current cycle
(the 4 follows your setting).
This is separate from the daily count, which includes every completed focus
session today across cycles.

The countdown is computed from a deadline rather than by counting interval
ticks, so it stays accurate in throttled background tabs. If any action
arrives after the deadline has already passed, the phase completes first and
the action has no further effect.

## Files

- `index.html`, `styles.css` — page and styles.
- `src/timer.js` — timer state machine with live `configure()`; no DOM or
  storage access.
- `src/settings.js` — settings defaults, validation and safe persistence.
- `src/daily.js` — daily completed-session count with safe storage.
- `src/sound.js` — Web Audio chime.
- `src/notify.js` — notification permission and display.
- `src/keyboard.js` — keyboard shortcut mapping.
- `src/app.js` — connects the above to the page, including the Settings
  dialog.
- `tests/` — `node:test` suites for the timer, settings, daily count, sound,
  notifications and keyboard modules (`app.js` is browser-only and not
  covered by them).
