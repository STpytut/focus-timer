// User settings: validation and persistence, independent of the DOM.
// Settings live under their own storage key, separate from the daily count.
// Storage is optional: if it is missing, throws, or holds invalid data, the
// defaults (or the last saved settings) are kept in memory for the page.

import { PHASES } from './timer.js';

export const SETTINGS_KEY = 'focus-timer:settings';

export const DEFAULT_SETTINGS = Object.freeze({
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  autoStart: false,
  sound: false,
});

export const LIMITS = Object.freeze({
  minutes: Object.freeze({ min: 1, max: 90 }),
  sessions: Object.freeze({ min: 2, max: 8 }),
});

const INTEGER_FIELDS = {
  workMinutes: LIMITS.minutes,
  shortBreakMinutes: LIMITS.minutes,
  longBreakMinutes: LIMITS.minutes,
  sessionsBeforeLongBreak: LIMITS.sessions,
};
const BOOLEAN_FIELDS = ['autoStart', 'sound'];

function integerError(value, { min, max }) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return `Enter a whole number from ${min} to ${max}.`;
  }
  return null;
}

/**
 * Strictly validates a complete settings object.
 * @returns {{ok: true, value: typeof DEFAULT_SETTINGS} | {ok: false, errors: Record<string, string>}}
 */
export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { form: 'Settings must be an object.' } };
  }
  const errors = {};
  const value = {};
  for (const [name, range] of Object.entries(INTEGER_FIELDS)) {
    const error = integerError(input[name], range);
    if (error) errors[name] = error;
    else value[name] = input[name];
  }
  for (const name of BOOLEAN_FIELDS) {
    if (typeof input[name] !== 'boolean') errors[name] = 'Must be on or off.';
    else value[name] = input[name];
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value };
}

/** Parses a text field as a whole number; anything else becomes NaN. */
export function parseWholeNumber(text) {
  if (typeof text !== 'string') return Number.NaN;
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/**
 * Validates raw form values: text for the number fields and booleans for
 * the switches.
 */
export function parseSettingsForm(fields) {
  const draft = {};
  for (const name of Object.keys(INTEGER_FIELDS)) draft[name] = parseWholeNumber(fields[name]);
  for (const name of BOOLEAN_FIELDS) draft[name] = fields[name];
  return validateSettings(draft);
}

/** Keeps each stored field that is valid and falls back to the default for the rest. */
function fromStored(raw) {
  if (typeof raw !== 'string') return null;
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  const settings = { ...DEFAULT_SETTINGS };
  for (const [name, range] of Object.entries(INTEGER_FIELDS)) {
    if (!integerError(stored[name], range)) settings[name] = stored[name];
  }
  for (const name of BOOLEAN_FIELDS) {
    if (typeof stored[name] === 'boolean') settings[name] = stored[name];
  }
  return settings;
}

const MINUTE = 60 * 1000;

/** Converts settings to the options accepted by createTimer / configure. */
export function toTimerConfig(settings) {
  return {
    durations: {
      [PHASES.WORK]: settings.workMinutes * MINUTE,
      [PHASES.SHORT_BREAK]: settings.shortBreakMinutes * MINUTE,
      [PHASES.LONG_BREAK]: settings.longBreakMinutes * MINUTE,
    },
    sessionsBeforeLongBreak: settings.sessionsBeforeLongBreak,
    autoStart: settings.autoStart,
  };
}

/**
 * @param {object} [options]
 * @param {Storage | null} [options.storage]
 */
export function createSettingsStore({ storage = null } = {}) {
  let current = { ...DEFAULT_SETTINGS };

  if (storage) {
    try {
      const stored = fromStored(storage.getItem(SETTINGS_KEY));
      if (stored) current = stored;
    } catch {
      storage = null;
    }
  }

  /** The current settings (a copy). */
  function get() {
    return { ...current };
  }

  /**
   * Validates and applies new settings. Invalid settings change nothing.
   * After a storage failure the settings stay in memory for this page and
   * storage is no longer used, so stale stored values cannot come back.
   * @returns {{ok: true, value: object, persisted: boolean} | {ok: false, errors: object}}
   */
  function save(next) {
    const result = validateSettings(next);
    if (!result.ok) return result;
    current = { ...result.value };
    let persisted = false;
    if (storage) {
      try {
        storage.setItem(SETTINGS_KEY, JSON.stringify(current));
        persisted = true;
      } catch {
        storage = null;
      }
    }
    return { ok: true, value: get(), persisted };
  }

  return { get, save };
}

/**
 * Restores DEFAULT_SETTINGS through the same save + configure path as the
 * Settings form. Only the settings key is touched. `unlock` is called when
 * the defaults enable sound, so the chime is ready like after a normal Save.
 * @returns {{ok: boolean, persisted: boolean, message: string}}
 */
export function resetSettingsToDefaults({ settings, timer, unlock = () => {} }) {
  const saved = settings.save({ ...DEFAULT_SETTINGS });
  if (!saved.ok) return { ok: false, persisted: false, message: 'Settings could not be reset.' };
  if (saved.value.sound) unlock();
  timer.configure(toTimerConfig(saved.value));
  return {
    ok: true,
    persisted: saved.persisted,
    message: saved.persisted
      ? 'Settings reset to defaults.'
      : 'Settings reset to defaults for this visit; they could not be stored.',
  };
}
