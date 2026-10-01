// Maps keydown events to page shortcuts: Space toggles, R resets, ? opens the
// shortcut help and Escape closes help or leaves Stats. Space and R are off
// while a modal dialog (Settings or help) is open and while the Stats view
// replaces the timer; ? still works from Stats.

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
 * @param {{modalOpen?: boolean, helpOpen?: boolean, statsOpen?: boolean}} [context]
 *   `modalOpen` is true while any modal dialog (Settings or help) is open.
 * @returns {'toggle' | 'reset' | 'help' | 'closeHelp' | 'closeStats' | null}
 */
export function shortcutFor(event, { modalOpen = false, helpOpen = false, statsOpen = false } = {}) {
  const anyModal = modalOpen || helpOpen;

  // Escape closes the topmost layer only: help first, so closing help over
  // Stats stays on Stats. Settings handles its own Escape natively.
  if (event.key === 'Escape') {
    if (helpOpen) return 'closeHelp';
    if (anyModal) return null;
    return statsOpen ? 'closeStats' : null;
  }

  if (anyModal) return null;
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target;
  if (isEditable(target)) return null;

  // Shift is needed to type ? on many layouts, so it is not a suppressor.
  if (event.key === '?') return 'help';
  if (statsOpen) return null;

  if (event.key === ' ' || event.code === 'Space') {
    if (target && (SPACE_ACTIVATED.has(target.tagName) || target.getAttribute?.('role') === 'button')) {
      return null;
    }
    return 'toggle';
  }
  if (event.key === 'r' || event.key === 'R') return 'reset';
  return null;
}
