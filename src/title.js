// Builds the browser tab title: "(N) Focus Timer" with today's completed
// sessions, or plain "Focus Timer" when there are none.

const BASE_TITLE = 'Focus Timer';

export function documentTitle({ sessionsToday }) {
  return sessionsToday > 0 ? `(${sessionsToday}) ${BASE_TITLE}` : BASE_TITLE;
}
