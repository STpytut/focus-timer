// Maps keydown events to timer shortcuts: Space toggles, R resets.
// Shortcuts are off while a modal dialog (Settings) is open and while the
// Stats view replaces the timer.

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
// Elements that already activate on Space; handling Space globally there
// would trigger a second action.
const SPACE_ACTIVATED = new Set(['BUTTON', 'A', 'SUMMARY', 'INPUT', 'SELECT', 'TEXTAREA']);

function isEditable(target) {
  if (!target) return false;
  return EDITABLE.has(target.tagName) || target.isContentEditable === true;
}

/**
 * @param {{key: string, code?: string, repeat?: boolean, ctrlKey?: boolean,
 *   metaKey?: boolean, altKey?: boolean, target?: any}} event
 * @param {{modalOpen?: boolean, statsOpen?: boolean}} [context]
 * @returns {'toggle' | 'reset' | null}
 */
export function shortcutFor(event, { modalOpen = false, statsOpen = false } = {}) {
  if (modalOpen || statsOpen) return null;
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target;
  if (isEditable(target)) return null;

  if (event.key === ' ' || event.code === 'Space') {
    if (target && (SPACE_ACTIVATED.has(target.tagName) || target.getAttribute?.('role') === 'button')) {
      return null;
    }
    return 'toggle';
  }
  if (event.key === 'r' || event.key === 'R') return 'reset';
  return null;
}
