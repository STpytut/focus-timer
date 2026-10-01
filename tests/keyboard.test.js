import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortcutFor } from '../src/keyboard.js';

const body = { tagName: 'BODY' };

test('Space toggles and R resets', () => {
  assert.equal(shortcutFor({ key: ' ', code: 'Space', target: body }), 'toggle');
  assert.equal(shortcutFor({ key: 'r', target: body }), 'reset');
  assert.equal(shortcutFor({ key: 'R', target: body }), 'reset');
  assert.equal(shortcutFor({ key: 'x', target: body }), null);
});

test('ignores repeats and modifier combos', () => {
  assert.equal(shortcutFor({ key: ' ', repeat: true, target: body }), null);
  assert.equal(shortcutFor({ key: 'r', repeat: true, target: body }), null);
  assert.equal(shortcutFor({ key: 'r', ctrlKey: true, target: body }), null);
  assert.equal(shortcutFor({ key: 'r', metaKey: true, target: body }), null);
  assert.equal(shortcutFor({ key: ' ', altKey: true, target: body }), null);
});

test('ignores editing fields', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(shortcutFor({ key: ' ', target: { tagName } }), null);
    assert.equal(shortcutFor({ key: 'r', target: { tagName } }), null);
  }
  assert.equal(shortcutFor({ key: 'r', target: { tagName: 'DIV', isContentEditable: true } }), null);
});

test('leaves Space to focused buttons so they act only once', () => {
  assert.equal(shortcutFor({ key: ' ', target: { tagName: 'BUTTON' } }), null);
  assert.equal(shortcutFor({ key: ' ', target: { tagName: 'DIV', getAttribute: () => 'button' } }), null);
  assert.equal(shortcutFor({ key: 'r', target: { tagName: 'BUTTON' } }), 'reset');
});

test('all shortcuts are off while a modal dialog is open', () => {
  assert.equal(shortcutFor({ key: ' ', target: body }, { modalOpen: true }), null);
  assert.equal(shortcutFor({ key: 'r', target: body }, { modalOpen: true }), null);
  assert.equal(shortcutFor({ key: 'r', target: body }, { modalOpen: false }), 'reset');
});

test('all shortcuts are off while the Stats view is shown', () => {
  assert.equal(shortcutFor({ key: ' ', target: body }, { statsOpen: true }), null);
  assert.equal(shortcutFor({ key: 'r', target: body }, { statsOpen: true }), null);
  assert.equal(shortcutFor({ key: ' ', target: body }, { statsOpen: false }), 'toggle');
});

test('? opens help, with Shift allowed but not Ctrl/Cmd/Alt or repeats', () => {
  assert.equal(shortcutFor({ key: '?', target: body }), 'help');
  assert.equal(shortcutFor({ key: '?', shiftKey: true, code: 'Slash', target: body }), 'help');
  assert.equal(shortcutFor({ key: '?', target: { tagName: 'BUTTON' } }), 'help');
  assert.equal(shortcutFor({ key: '?', repeat: true, target: body }), null);
  assert.equal(shortcutFor({ key: '?', ctrlKey: true, target: body }), null);
  assert.equal(shortcutFor({ key: '?', metaKey: true, target: body }), null);
  assert.equal(shortcutFor({ key: '?', altKey: true, target: body }), null);
  assert.equal(shortcutFor({ key: '/', target: body }), null);
});

test('? is ignored while typing', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(shortcutFor({ key: '?', target: { tagName } }), null);
  }
  assert.equal(shortcutFor({ key: '?', target: { tagName: 'DIV', isContentEditable: true } }), null);
});

test('? does not open help over Settings or a second time', () => {
  assert.equal(shortcutFor({ key: '?', target: body }, { modalOpen: true }), null);
  assert.equal(shortcutFor({ key: '?', target: body }, { helpOpen: true }), null);
});

test('? opens help from Stats while Space and R stay off', () => {
  const stats = { statsOpen: true };
  assert.equal(shortcutFor({ key: '?', target: body }, stats), 'help');
  assert.equal(shortcutFor({ key: ' ', target: body }, stats), null);
  assert.equal(shortcutFor({ key: 'r', target: body }, stats), null);
});

test('Space and R are off while help is open', () => {
  assert.equal(shortcutFor({ key: ' ', target: body }, { helpOpen: true }), null);
  assert.equal(shortcutFor({ key: 'r', target: body }, { helpOpen: true }), null);
  assert.equal(shortcutFor({ key: 'r', target: body }, { helpOpen: true, statsOpen: true }), null);
});

test('Escape closes help first, then leaves Stats, and leaves Settings to the dialog', () => {
  assert.equal(shortcutFor({ key: 'Escape', target: body }, { helpOpen: true }), 'closeHelp');
  // Closing help over Stats must not also go back to the timer.
  assert.equal(shortcutFor({ key: 'Escape', target: body }, { helpOpen: true, statsOpen: true }), 'closeHelp');
  assert.equal(shortcutFor({ key: 'Escape', target: body }, { statsOpen: true }), 'closeStats');
  assert.equal(shortcutFor({ key: 'Escape', target: body }, { modalOpen: true }), null);
  assert.equal(shortcutFor({ key: 'Escape', target: body }, { modalOpen: true, statsOpen: true }), null);
  assert.equal(shortcutFor({ key: 'Escape', target: body }), null);
});

test('Settings fields suppress every shortcut except its own Escape', () => {
  const input = { tagName: 'INPUT' };
  for (const key of [' ', 'r', '?']) {
    assert.equal(shortcutFor({ key, target: input }, { modalOpen: true }), null);
  }
  assert.equal(shortcutFor({ key: 'Escape', target: input }, { modalOpen: true }), null);
});
