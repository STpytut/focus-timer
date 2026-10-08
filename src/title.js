// Builds the browser tab title: the running countdown (if any) plus a
// "(N)" prefix with today's completed sessions.

const BASE_TITLE = 'Focus Timer';

export function documentTitle({ running, time, label, sessionsToday }) {
  const base = running ? `${time} · ${label}` : BASE_TITLE;
  return sessionsToday > 0 ? `(${sessionsToday}) ${base}` : base;
}
