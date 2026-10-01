// Browser notifications for phase completion while the page is hidden.
// Permission is only ever requested through requestPermission(), which the
// page calls from an explicit user click.

export const PERMISSION = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',
  DEFAULT: 'default',
  UNSUPPORTED: 'unsupported',
});

const KNOWN = new Set([PERMISSION.GRANTED, PERMISSION.DENIED, PERMISSION.DEFAULT]);

/**
 * @param {object} [options]
 * @param {typeof Notification | undefined} [options.NotificationCtor]
 */
export function createNotifier({ NotificationCtor = globalThis.Notification } = {}) {
  const supported = typeof NotificationCtor === 'function';

  function permission() {
    if (!supported) return PERMISSION.UNSUPPORTED;
    try {
      const value = NotificationCtor.permission;
      return KNOWN.has(value) ? value : PERMISSION.DEFAULT;
    } catch {
      return PERMISSION.UNSUPPORTED;
    }
  }

  /** Asks the browser for permission; resolves to the resulting state. */
  async function requestPermission() {
    if (!supported || typeof NotificationCtor.requestPermission !== 'function') {
      return permission();
    }
    try {
      // Older Safari only supports the callback form and returns undefined.
      const result = await new Promise((resolve, reject) => {
        const returned = NotificationCtor.requestPermission(resolve);
        if (returned && typeof returned.then === 'function') returned.then(resolve, reject);
      });
      return KNOWN.has(result) ? result : permission();
    } catch {
      return permission();
    }
  }

  /**
   * Shows a notification if the page is hidden and permission is granted.
   * @returns {boolean} whether a notification was shown
   */
  function notify({ hidden, title, body, tag = 'focus-timer' }) {
    if (!hidden || permission() !== PERMISSION.GRANTED) return false;
    try {
      new NotificationCtor(title, { body, tag });
      return true;
    } catch {
      // e.g. Chrome on Android requires a service worker for notifications.
      return false;
    }
  }

  return { permission, requestPermission, notify };
}
