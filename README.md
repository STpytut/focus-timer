# Focus Timer

A calm, dependency-free Pomodoro timer for the browser. Plain HTML, CSS and
ES modules — no build step, no external assets or fonts. It follows your
system's light/dark preference and works on narrow phone screens.

- **Focus** for 25 minutes, then a **short break** of 5 minutes.
- After every fourth *completed* focus session the break is a **long break**
  of 15 minutes; then a new cycle begins with focus.
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
waiting.

## Keyboard shortcuts

| Key     | Action                       |
| ------- | ---------------------------- |
| `Space` | Start / pause / resume       |
| `R`     | Reset the current phase      |

Shortcuts are ignored for held-down (repeated) keys, with Ctrl/Cmd/Alt, and
while typing in a text field. When a button has keyboard focus, `Space`
activates that button as usual rather than also triggering the shortcut.

## How the controls behave

- **Start / Pause / Resume** — one button. Pausing keeps the exact remaining
  time; resuming continues from it.
- **Reset** — restarts the current phase from its full length and stops it.
  Completed sessions and progress toward the long break are kept.
- **Skip** — moves to the next phase, stopped. A skipped focus session is not
  counted as completed and gives no progress toward the long break, so
  skipping focus always leads to a short break. Skipping a break goes back to
  focus; skipping a long break starts a new cycle.
- **When a phase ends**, it counts once and the next phase is shown stopped,
  so each phase is started intentionally.

Under the phase name, "Session N of 4" shows progress in the current cycle.
This is separate from the daily count, which includes every completed focus
session today across cycles.

The countdown is computed from a deadline rather than by counting interval
ticks, so it stays accurate in throttled background tabs. If any action
arrives after the deadline has already passed, the phase completes first and
the action has no further effect.

## Files

- `index.html`, `styles.css` — page and styles.
- `src/timer.js` — timer state machine; no DOM or storage access.
- `src/daily.js` — daily completed-session count with safe storage.
- `src/keyboard.js` — keyboard shortcut mapping.
- `src/app.js` — connects the above to the page.
- `tests/` — `node:test` suites.
