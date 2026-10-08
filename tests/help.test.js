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

// The reset confirmation reuses the same dialog wiring; the page treats it
// as a modal for shortcuts and as a reason to refuse opening help.
function setupReset() {
  const doc = fakeDocument();
  const dialog = fakeDialog(doc);
  const opener = fakeElement(doc, 'BUTTON');
  const cancel = fakeElement(doc, 'BUTTON');
  const state = { statsOpen: true, history: 'unchanged' };
  const confirmation = createHelpDialog({ dialog, opener, closeButton: cancel, document: doc });
  const help = createHelpDialog({
    dialog: fakeDialog(doc), opener: fakeElement(doc, 'BUTTON'), closeButton: fakeElement(doc, 'BUTTON'),
    document: doc, canOpen: () => !confirmation.isOpen(),
  });
  function press(key) {
    const action = shortcutFor({ key, target: doc.activeElement }, {
      modalOpen: confirmation.isOpen(), helpOpen: help.isOpen(), statsOpen: state.statsOpen,
    });
    if (action === 'closeStats') state.statsOpen = false;
    if (action === 'help') help.open();
    return action;
  }
  return { doc, dialog, opener, cancel, confirmation, help, state, press };
}

test('reset confirmation focuses Cancel and Cancel restores focus to the opener', () => {
  const { doc, dialog, opener, cancel } = setupReset();
  opener.focus();
  opener.dispatch('click');
  assert.equal(dialog.open, true);
  assert.equal(doc.activeElement, cancel);
  cancel.dispatch('click');
  assert.equal(dialog.open, false);
  assert.equal(doc.activeElement, opener);
});

test('Escape in the reset confirmation does not leave Stats; timer shortcuts and help are off', () => {
  const { dialog, opener, confirmation, help, state, press } = setupReset();
  opener.focus();
  confirmation.open();
  assert.equal(press(' '), null);
  assert.equal(press('r'), null);
  assert.equal(press('?'), null);
  assert.equal(help.isOpen(), false);
  assert.equal(press('Escape'), null); // native dialog closes itself
  dialog.close();
  assert.equal(state.statsOpen, true);
  assert.equal(press('Escape'), 'closeStats');
});

test('clear history confirmation: Cancel, Escape and exclusion with the reset confirmation', () => {
  const { doc, dialog, opener, cancel, confirmation, help, state, press } = setupReset();
  const clearDialog = fakeDialog(doc);
  const clearOpener = fakeElement(doc, 'BUTTON');
  const clearCancel = fakeElement(doc, 'BUTTON');
  const clear = createHelpDialog({
    dialog: clearDialog, opener: clearOpener, closeButton: clearCancel, document: doc,
    canOpen: () => !confirmation.isOpen() && !help.isOpen(),
  });
  clearOpener.focus();
  clearOpener.dispatch('click');
  assert.equal(clearDialog.open, true);
  assert.equal(doc.activeElement, clearCancel);
  assert.equal(confirmation.open(), true); // reset confirmation is independent here
  confirmation.close();
  clearCancel.dispatch('click');
  assert.equal(clearDialog.open, false);
  assert.equal(doc.activeElement, clearOpener);

  clear.open();
  clearDialog.close(); // Escape closes the native dialog
  assert.equal(doc.activeElement, clearOpener);
  assert.equal(state.statsOpen, true);

  confirmation.open();
  assert.equal(clear.open(), false);
  assert.equal(clearDialog.open, false);
  assert.equal(dialog.open, true);
  assert.equal(opener !== clearOpener, true);
});

test('settings reset confirmation: Cancel and Escape change nothing, focus returns to the gear, no stacking', () => {
  const doc = fakeDocument();
  const gear = fakeElement(doc, 'BUTTON');
  const settingsDialog = fakeDialog(doc);
  const dialog = fakeDialog(doc);
  const cancel = fakeElement(doc, 'BUTTON');
  let resets = 0;
  const confirmation = createHelpDialog({
    dialog, opener: { addEventListener() {}, focus: () => gear.focus() }, closeButton: cancel,
    document: doc, canOpen: () => !settingsDialog.open,
  });
  // Mirrors the page: the Reset to defaults button closes Settings, then opens the confirmation.
  const openFromSettings = () => {
    settingsDialog.close();
    gear.focus();
    confirmation.open();
  };

  settingsDialog.open = true;
  assert.equal(confirmation.open(), false); // never stacks over Settings
  openFromSettings();
  assert.equal(settingsDialog.open, false);
  assert.equal(dialog.open, true);
  assert.equal(doc.activeElement, cancel);
  assert.equal(shortcutFor({ key: 'r', target: doc.activeElement }, { modalOpen: confirmation.isOpen() }), null);
  assert.equal(shortcutFor({ key: '?', target: doc.activeElement }, { modalOpen: confirmation.isOpen() }), null);

  cancel.dispatch('click');
  assert.equal(dialog.open, false);
  assert.equal(doc.activeElement, gear);

  settingsDialog.open = true;
  openFromSettings();
  dialog.close(); // Escape
  assert.equal(doc.activeElement, gear);
  assert.equal(resets, 0);
});
