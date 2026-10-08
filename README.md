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
- A row of dots shows the focus sessions you completed today. It starts
  again at zero on a new local day.
- **Stats** (the bar-chart button next to the gear) shows the last seven
  days, focus time today and this week, your daily streak, and exports your
  completed sessions as CSV. History is kept for 90 days in `localStorage`.
- **Keyboard shortcuts** (the `?` button after the gear, or press `?`) lists
  every shortcut.

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

## Stats and history

Open Stats with the bar-chart button next to the gear. The Stats view
replaces the timer on the page; **Back to timer** (or `Escape`) returns to
it. The timer keeps running and keeps all its state while Stats is shown, and
a session that finishes meanwhile shows up in Stats immediately. Opening
Stats moves keyboard focus to its heading; going back returns focus to the
Stats button. The `Space` / `R` timer shortcuts are off while Stats is shown;
`?` still opens the shortcut help, and `Escape` then closes only the help.

What it shows (all by your device's local calendar day):

- **Focus today** — minutes of focus completed today, with the number of
  completed sessions.
- **This week** — focus minutes from Monday through today.
- **Daily streak** — consecutive days with at least one completed focus
  session. It ends today if you have completed a session today, otherwise
  yesterday (so the streak is not lost before you start today); it is 0 if
  neither today nor yesterday has a session. Days without a session are never
  bridged.
- **Last 7 days** — one bar per day, ending with today; days without
  sessions show as an empty bar with a 0. The number above each bar is the
  count of completed focus sessions; every bar has a screen-reader label with
  the full date, session count and focus minutes.

What counts: only focus sessions that run to the end, each once, on the day
the page notices it finished. A session counts the length it was started
with — even if you changed the length in Settings while it was running or
paused. Skipped or reset focus time, breaks, paused time and time a
background tab ran past the end are not counted.

### Reset today

**Reset today** (a small button at the bottom of Stats) removes today's
completed sessions and focus minutes, including today's individual session
records (breaks too). It opens a confirmation dialog that
says so and that previous days are kept; focus starts on **Cancel**.
**Cancel** or `Escape` closes only the dialog, leaves the history unchanged
and keeps Stats shown, returning focus to the Reset today button. **Reset
today** in the dialog clears the current local day (resolved when you
confirm, so it never clears yesterday after midnight) and immediately
refreshes the dots, totals, chart, empty state and streak. Earlier days stay
and the streak rule is unchanged: with no sessions today it ends yesterday,
so a streak that only consisted of today becomes 0. The timer keeps running
and is not affected, and later sessions are recorded as usual. Timer
shortcuts and help do not fire while the confirmation is open.

### Clear history

**Clear history** (next to Reset today at the bottom of Stats) deletes every
recorded session on every date: all daily totals and all individual focus and
break records. It uses the same confirmation dialog behaviour as Reset today:
focus starts on **Cancel**; **Cancel** or `Escape` closes only the dialog,
changes nothing and returns focus to the Clear history button. Confirming
immediately refreshes the dots, Stats totals, chart, empty state, streak
(0), tab title (plain `Focus Timer`) and disables Export CSV. The timer and
settings are not affected. If storage is unavailable or fails, the emptied
history is kept in memory for the page, like every other history change.
Programmatically this is `history.clearAll()`.

### Storage and retention

History is saved in `localStorage` under `focus-timer:history` as one record
per local date (`YYYY-MM-DD`) with completed focus sessions and focus
minutes, plus a list of individual completed sessions (local date, ISO
completion time, kind and minutes) for all three phase kinds. Invalid session
entries are ignored. Today plus the previous 89 days are kept. Older days and sessions are removed — from
storage as well as from what is shown and exported — when the page loads and
whenever the history is read after a day has aged out (the dots and Stats
refresh every minute, so this also happens if the page stays open past
midnight). Storage is only rewritten when something was actually removed. If storage is unavailable, holds invalid data, or a read or write
fails (for example when full), the history is kept in memory for the current
page and the stored copy is left alone. Invalid individual days in an
otherwise valid history are ignored. Open tabs pick up sessions recorded in
other tabs.

### Carrying over the old daily count

Earlier versions stored only today's session count (`focus-timer:daily`).
The first time this version loads, a valid count dated today becomes
today's history entry; a count from an earlier day is ignored. **Limitation:** the old
count has no durations, so those sessions are recorded with 0 focus minutes —
they count towards sessions and the streak but not towards focus minutes.
The carry-over happens once: the old key is removed only after the history
has been saved, and once any history exists it always takes precedence, so a
reload (or an old version still open in another tab) can never add the old
count again.

### CSV export

**Export CSV** downloads `focus-timer-sessions-YYYY-MM-DD.csv` with one row
per completed session (focus, short break and long break), oldest first, as
RFC 4180 CSV with CRLF line endings:

```csv
date,kind,length_minutes
2026-09-30,focus,25
2026-09-30,short break,5
2026-10-01,focus,25
2026-10-01,long break,15
```

- `date` — local calendar date the session completed, `YYYY-MM-DD`.
- `kind` — `focus`, `short break` or `long break`.
- `length_minutes` — the length the phase actually ran with (at most two
  decimals).

Skipped, reset or paused-and-abandoned phases are not recorded. Fields
containing commas, double quotes or line breaks are quoted with quotes
doubled. With no recorded sessions the button is disabled and nothing is
downloaded; the Stats page says when there are no completed sessions.

**Limitation:** sessions recorded before individual records existed (daily
totals, or the old daily count) keep counting in the Stats metrics but have
no per-session data, so they are not exported; rows are never invented from
totals.

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
  from the history (`focus-timer:history`), so neither can damage the other.
  An unreadable or malformed stored value falls back to the defaults (invalid
  individual fields fall back on their own). If storage is unavailable or a
  save fails, the new settings still apply for the current page.

- **Reset to defaults** (in Settings) opens a confirmation. Settings close
  first, so two dialogs never stack, and unsaved edits are discarded. Only
  **Reset to defaults** in the confirmation changes anything; **Cancel** or
  `Escape` leaves the saved settings as they were, and focus returns to the
  gear button. Confirming saves the defaults under `focus-timer:settings` and
  applies them like **Save** does (see below), and announces whether they were
  stored or only applied for this visit. Today's count and the history are not
  touched.

### Changing settings while the timer runs

- A phase that has already been started — running or paused — keeps the
  length and remaining time it started with. New lengths apply to the
  following phases, and to the current phase when you press **Reset**.
- A phase that has not been started yet switches to the new length at once.
- Completed sessions, progress in the current cycle, today's count and the
  history are kept. A new "sessions before a long break" value is checked the next time a
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

| Key      | Action                                   |
| -------- | ---------------------------------------- |
| `Space`  | Start / pause / resume                   |
| `R`      | Reset the current phase                  |
| `?`      | Show the keyboard shortcut help          |
| `Escape` | Close the open dialog, or leave Stats    |

`?` is usually typed as `Shift` + `/`; Shift is fine, but the shortcuts are
ignored for held-down (repeated) keys, with Ctrl/Cmd/Alt, and while typing in
a text field, select or editable area. When a button has keyboard focus,
`Space` activates that button as usual rather than also triggering the
shortcut. `Space` and `R` are off while the Stats view is shown or a dialog
is open; `?` works from the timer and from Stats, but not while a dialog is
open.

`Escape` acts on the topmost layer only: it closes the shortcut help first
(so closing help over Stats stays on Stats), otherwise it closes Settings like
Cancel, otherwise it leaves Stats.

The dialogs (Settings, shortcuts and the confirmations) are native modal `<dialog>` elements sharing one look, and only
one is open at a time: the rest of the page is inert so `Tab` cannot reach
it, and the timer keeps running underneath.

- **Settings** — focus moves to the first field when it opens; `Escape`
  closes it like Cancel, and closing it in any way returns focus to the gear
  button.
- **Keyboard shortcuts** — opens from the `?` button or the `?` key; focus
  moves to its **Close** button. Closing it with Close or `Escape` returns
  focus to whatever had focus before it opened (the `?` button if that is no
  longer available).

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
This is separate from today's count, which includes every completed focus
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
- `src/history.js` — per-day focus history: recording, 90-day retention,
  legacy carry-over, local calendar arithmetic, week/streak/7-day metrics
  and per-session records; safe storage with in-memory fallback.
- `src/csv.js` — pure RFC 4180 session CSV builder.
- `src/export.js` — Export CSV button behaviour with injected browser APIs.
- `src/daily.js` — local date keys, safe storage detection and the legacy
  daily count format (still exported, no longer used by the page).
- `src/sound.js` — Web Audio chime.
- `src/notify.js` — notification permission and display.
- `src/keyboard.js` — keyboard shortcut mapping, including which layer
  `Escape` closes.
- `src/help.js` — keyboard shortcut help dialog: open/close and focus
  restoration.
- `src/app.js` — connects the above to the page, including the Settings
  and help dialogs and the Stats view.
- `tests/` — `node:test` suites, one per module: `timer.test.js` (including
  the completed-duration contract used by the history), `csv.test.js` (CSV and export wiring), `history.test.js`
  (rollover, 90-day pruning, legacy carry-over, streak/week/7-day metrics,
  CSV, reload and storage failures), `settings.test.js`, `daily.test.js`,
  `sound.test.js`, `notify.test.js`, `keyboard.test.js` and `help.test.js`
  (help dialog wiring and focus restoration driven through the shortcut
  mapping, on a small fake DOM). `app.js` is browser-only and not covered by
  them.
