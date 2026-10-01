import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionsCSV, escapeField, SESSION_CSV_HEADER } from '../src/csv.js';
import { createExporter } from '../src/export.js';

test('empty input gives only the header', () => {
  assert.equal(SESSION_CSV_HEADER, 'date,kind,length_minutes');
  assert.equal(buildSessionsCSV([]), 'date,kind,length_minutes\r\n');
});

test('one CRLF row per session, sorted, minutes rounded, input untouched', () => {
  const input = [
    { date: '2026-10-01', kind: 'short break', minutes: 5, completedAt: '2026-10-01T10:00:00.000Z' },
    { date: '2026-09-30', kind: 'long break', minutes: 15, completedAt: '2026-09-30T10:00:00.000Z' },
    { date: '2026-10-01', kind: 'focus', minutes: 25 + 1 / 3, completedAt: '2026-10-01T09:00:00.000Z' },
  ];
  const copy = structuredClone(input);
  assert.equal(
    buildSessionsCSV(input),
    'date,kind,length_minutes\r\n2026-09-30,long break,15\r\n2026-10-01,focus,25.33\r\n2026-10-01,short break,5\r\n',
  );
  assert.deepEqual(input, copy);
});

test('fields are escaped per RFC 4180', () => {
  assert.equal(escapeField('plain'), 'plain');
  assert.equal(escapeField('a,b'), '"a,b"');
  assert.equal(escapeField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeField('a\nb'), '"a\nb"');
  assert.equal(escapeField('a\r\nb'), '"a\r\nb"');
  assert.equal(escapeField('a\rb'), '"a\rb"');
  assert.equal(buildSessionsCSV([{ date: 'x,y', kind: 'k"q', minutes: 1 }]), 'date,kind,length_minutes\r\n"x,y","k""q",1\r\n');
});

// --- Export button wiring on a fake DOM ---

function setup(initial) {
  let sessions = initial;
  const events = { clicks: 0, blobs: [], revoked: [], announced: [], appended: [], removed: 0, timers: [] };
  const button = { disabled: false, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
  const link = { click() { events.clicks += 1; }, remove() { events.removed += 1; } };
  const document = { createElement: () => link, body: { append: (n) => events.appended.push(n) } };
  class FakeBlob { constructor(parts, opts) { events.blobs.push({ parts, opts }); } }
  const exporter = createExporter({
    button,
    count: () => sessions,
    csv: () => 'csv-data',
    filename: () => 'f.csv',
    announce: (m) => events.announced.push(m),
    document,
    url: { createObjectURL: () => 'blob:1', revokeObjectURL: (u) => events.revoked.push(u) },
    Blob: FakeBlob,
    setTimeout: (fn) => events.timers.push(fn),
  });
  return { button, link, events, exporter, set: (n) => { sessions = n; } };
}

test('export is disabled with no sessions and enabled after sync', () => {
  const t = setup(0);
  assert.equal(t.button.disabled, true);
  t.set(2);
  t.exporter.sync();
  assert.equal(t.button.disabled, false);
  t.set(0);
  t.exporter.sync();
  assert.equal(t.button.disabled, true);
});

test('click downloads via object URL and cleans up', () => {
  const t = setup(2);
  t.button.listeners.click();
  assert.equal(t.events.clicks, 1);
  assert.equal(t.link.download, 'f.csv');
  assert.equal(t.link.href, 'blob:1');
  assert.deepEqual(t.events.blobs[0].parts, ['csv-data']);
  assert.equal(t.events.removed, 1);
  t.events.timers[0]();
  assert.deepEqual(t.events.revoked, ['blob:1']);
  assert.deepEqual(t.events.announced, ['Exported 2 sessions.']);
});

test('click with no data does nothing but announce', () => {
  const t = setup(0);
  t.button.disabled = false; // e.g. stale state
  t.button.listeners.click();
  assert.equal(t.events.clicks, 0);
  assert.equal(t.events.blobs.length, 0);
  assert.equal(t.button.disabled, true);
  assert.deepEqual(t.events.announced, ['No completed sessions to export.']);
});
