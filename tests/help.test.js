// Exercises the help dialog wiring with a small fake DOM: the same click,
// keydown and close event flow the page uses, without a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHelpDialog } from '../src/help.js';
import { shortcutFor } from '../src/keyboard.js';

function fakeDocument() {
  const doc = { activeElement: null };
  doc.body = fakeElement(doc, 'BODY');
  doc.activeElement = doc.body;
  return doc;
}

function fakeElement(doc, tagName) {
  const listeners = {};
  return {
    tagName,
    isConnected: true,
    hidden: false,
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    dispatch(type) {
      for (const fn of listeners[type] ?? []) fn({ type });
    },
    focus() {
      doc.activeElement = this;
    },
    closest(selector) {
      return selector === '[hidden]' && this.hidden ? this : null;
    },
  };
}

function fakeDialog(doc) {
  const dialog = fakeElement(doc, 'DIALOG');
  dialog.open = false;
  dialog.showModalCalls = 0;
  dialog.showModal = () => {
    if (dialog.open) throw new Error('InvalidStateError: already open');
    dialog.open = true;
    dialog.showModalCalls += 1;
  };
  dialog.close = () => {
    if (!dialog.open) return;
    dialog.open = false;
    dialog.dispatch('close');
  };
  return dialog;
}

function setup({ settingsOpen = false } = {}) {
  const doc = fakeDocument();
  const dialog = fakeDialog(doc);
  const opener = fakeElement(doc, 'BUTTON');
  const closeButton = fakeElement(doc, 'BUTTON');
  const toggle = fakeElement(doc, 'BUTTON');
  const state = { settingsOpen, statsOpen: false };
  const help = createHelpDialog({
    dialog, opener, closeButton, document: doc, canOpen: () => !state.settingsOpen,
  });
  // Mirrors the page's keydown dispatch.
  const actions = [];
  function press(key, extra = {}) {
    const action = shortcutFor({ key, target: doc.activeElement, ...extra }, {
      modalOpen: state.settingsOpen, helpOpen: help.isOpen(), statsOpen: state.statsOpen,
    });
    if (action) actions.push(action);
    if (action === 'help') help.open();
    if (action === 'closeHelp') help.close();
    return action;
  }
  return { doc, dialog, opener, closeButton, toggle, help, state, press, actions };
}

test('? opens help, focuses Close, and Escape restores the previous focus', () => {
  const { doc, dialog, closeButton, toggle, press } = setup();
  toggle.focus();
  assert.equal(press('?', { shiftKey: true }), 'help');
  assert.equal(dialog.open, true);
  assert.equal(doc.activeElement, closeButton);

  assert.equal(press('Escape'), 'closeHelp');
  assert.equal(dialog.open, false);
  assert.equal(doc.activeElement, toggle);
});

test('the ? button opens help and Close returns focus to it', () => {
  const { doc, dialog, opener, closeButton } = setup();
  opener.focus();
  opener.dispatch('click');
  assert.equal(dialog.open, true);
  assert.equal(doc.activeElement, closeButton);
  closeButton.dispatch('click');
  assert.equal(dialog.open, false);
  assert.equal(doc.activeElement, opener);
});

test('falls back to the ? button when the previous element is gone', () => {
  const { doc, opener, toggle, help } = setup();
  help.open(); // nothing focused (body)
  help.close();
  assert.equal(doc.activeElement, opener);

  toggle.focus();
  help.open();
  toggle.hidden = true;
  help.close();
  assert.equal(doc.activeElement, opener);

  toggle.hidden = false;
  toggle.focus();
  help.open();
  toggle.isConnected = false;
  help.close();
  assert.equal(doc.activeElement, opener);
});

test('help does not open twice or over Settings', () => {
  const open = setup();
  open.toggle.focus();
  assert.equal(open.help.open(), true);
  assert.equal(open.help.open(), false);
  open.opener.dispatch('click');
  assert.equal(open.press('?'), null);
  assert.equal(open.dialog.showModalCalls, 1);
  // The first opener is still the one restored.
  open.help.close();
  assert.equal(open.doc.activeElement, open.toggle);

  const blocked = setup({ settingsOpen: true });
  assert.equal(blocked.help.open(), false);
  assert.equal(blocked.press('?'), null);
  assert.equal(blocked.dialog.open, false);
});

test('Space and R do nothing while help is open; closing help over Stats stays on Stats', () => {
  const { help, press, state, actions } = setup();
  help.open();
  assert.equal(press(' '), null);
  assert.equal(press('r'), null);

  help.close();
  state.statsOpen = true;
  assert.equal(press('?'), 'help');
  assert.equal(press('Escape'), 'closeHelp');
  assert.equal(help.isOpen(), false);
  assert.deepEqual(actions, ['help', 'closeHelp']);
  assert.equal(press('Escape'), 'closeStats');
});
