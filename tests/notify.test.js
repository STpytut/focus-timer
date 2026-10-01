import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, PERMISSION } from '../src/notify.js';

function fakeNotification({ permission = 'default', answer = 'granted', mode = 'promise', ctorThrows = false } = {}) {
  const shown = [];
  let requests = 0;
  class FakeNotification {
    static permission = permission;
    static requestPermission(callback) {
      requests += 1;
      if (mode === 'throws') throw new Error('not allowed');
      if (mode === 'rejects') return Promise.reject(new Error('not allowed'));
      FakeNotification.permission = answer;
      if (mode === 'callback') {
        callback(answer);
        return undefined;
      }
      return Promise.resolve(answer);
    }
    constructor(title, options) {
      if (ctorThrows) throw new TypeError('Illegal constructor');
      shown.push({ title, ...options });
    }
  }
  return { FakeNotification, shown, requests: () => requests };
}

test('reports unsupported when the API is missing', async () => {
  const notifier = createNotifier({ NotificationCtor: undefined });
  assert.equal(notifier.permission(), PERMISSION.UNSUPPORTED);
  assert.equal(await notifier.requestPermission(), PERMISSION.UNSUPPORTED);
  assert.equal(notifier.notify({ hidden: true, title: 't', body: 'b' }), false);
});

test('reflects default, granted and denied states without asking', () => {
  for (const state of ['default', 'granted', 'denied']) {
    const fake = fakeNotification({ permission: state });
    const notifier = createNotifier({ NotificationCtor: fake.FakeNotification });
    assert.equal(notifier.permission(), state);
    assert.equal(fake.requests(), 0, 'creating the notifier never requests permission');
  }
});

test('requests permission with promise and callback forms', async () => {
  for (const mode of ['promise', 'callback']) {
    for (const answer of ['granted', 'denied']) {
      const fake = fakeNotification({ mode, answer });
      const notifier = createNotifier({ NotificationCtor: fake.FakeNotification });
      assert.equal(await notifier.requestPermission(), answer, `${mode}/${answer}`);
      assert.equal(notifier.permission(), answer);
      assert.equal(fake.requests(), 1);
    }
  }
});

test('request failures resolve to the current state', async () => {
  for (const mode of ['throws', 'rejects']) {
    const fake = fakeNotification({ mode });
    const notifier = createNotifier({ NotificationCtor: fake.FakeNotification });
    assert.equal(await notifier.requestPermission(), PERMISSION.DEFAULT, mode);
  }
});

test('notifies only when hidden and granted', () => {
  const granted = fakeNotification({ permission: 'granted' });
  const notifier = createNotifier({ NotificationCtor: granted.FakeNotification });
  assert.equal(notifier.notify({ hidden: false, title: 'Focus finished.', body: 'x' }), false);
  assert.equal(notifier.notify({ hidden: true, title: 'Focus finished.', body: 'Short break is ready to start.' }), true);
  assert.deepEqual(granted.shown, [{ title: 'Focus finished.', body: 'Short break is ready to start.', tag: 'focus-timer' }]);

  for (const permission of ['default', 'denied']) {
    const fake = fakeNotification({ permission });
    const n = createNotifier({ NotificationCtor: fake.FakeNotification });
    assert.equal(n.notify({ hidden: true, title: 't', body: 'b' }), false);
    assert.equal(fake.shown.length, 0);
  }
});

test('constructor failures are handled', () => {
  const fake = fakeNotification({ permission: 'granted', ctorThrows: true });
  const notifier = createNotifier({ NotificationCtor: fake.FakeNotification });
  assert.equal(notifier.notify({ hidden: true, title: 't', body: 'b' }), false);
});
