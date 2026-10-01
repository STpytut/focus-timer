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
