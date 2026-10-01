// Pure CSV construction for the per-session export (RFC 4180). No DOM,
// storage or clock access.

export const SESSION_CSV_HEADER = 'date,kind,length_minutes';

const EOL = '\r\n';

/** Minutes for CSV: at most two decimals, no float noise. */
function roundMinutes(minutes) {
  return Math.round(minutes * 100) / 100;
}

/**
 * One RFC 4180 field: quoted when it contains a comma, double quote, CR or
 * LF, with embedded double quotes doubled.
 */
export function escapeField(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Header plus one CRLF-terminated row per session. Rows are ordered by date,
 * then completion time, then input order, without touching the input.
 * @param {Array<{date: string, kind: string, minutes: number, completedAt?: string}>} sessions
 */
export function buildSessionsCSV(sessions) {
  const rows = sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => {
      const x = a.session;
      const y = b.session;
      if (x.date !== y.date) return x.date < y.date ? -1 : 1;
      const xt = x.completedAt ?? '';
      const yt = y.completedAt ?? '';
      if (xt !== yt) return xt < yt ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ session }) =>
      [session.date, session.kind, roundMinutes(session.minutes)].map(escapeField).join(','),
    );
  return [SESSION_CSV_HEADER, ...rows].map((line) => line + EOL).join('');
}
