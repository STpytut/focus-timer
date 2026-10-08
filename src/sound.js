// A short synthesized chime using Web Audio; no audio files.
// Browsers only let audio start after a user gesture, so call unlock() from
// a click or key handler; play() can then sound later, at completion.
// Every failure (no Web Audio, rejected resume, closed context) is silent.

const NOTES = [
  { frequency: 880, offset: 0 }, // A5
  { frequency: 1318.51, offset: 0.18 }, // E6
];
const PEAK_GAIN = 0.2; // at 100% volume
const DEFAULT_VOLUME = 100;
const ATTACK = 0.02;
const DECAY = 0.9;
const SILENT = 0.0001;

/**
 * @param {object} [options]
 * @param {typeof AudioContext | undefined} [options.AudioContextCtor]
 */
export function createChime({
  AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
} = {}) {
  let context = null;

  function ensureContext() {
    if (context && context.state !== 'closed') return context;
    context = null;
    if (typeof AudioContextCtor !== 'function') return null;
    try {
      context = new AudioContextCtor();
    } catch {
      context = null;
    }
    return context;
  }

  async function resume(ctx) {
    if (ctx.state !== 'suspended') return true;
    try {
      await ctx.resume();
    } catch {
      return false;
    }
    return ctx.state !== 'suspended';
  }

  /** Creates and resumes the audio context; call from a user gesture. */
  async function unlock() {
    const ctx = ensureContext();
    if (!ctx) return false;
    return resume(ctx);
  }

  /**
   * Plays the chime at a 0-100 volume (100 is the full level; invalid values
   * play at full level). Resolves to false when audio is unavailable.
   */
  async function play(volume = DEFAULT_VOLUME) {
    const ctx = ensureContext();
    if (!ctx) return false;
    try {
      if (!(await resume(ctx))) return false;
      const level = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : DEFAULT_VOLUME;
      if (level === 0) return true;
      const peak = Math.max(SILENT * 2, (PEAK_GAIN * level) / 100);
      const start = ctx.currentTime + 0.01;
      for (const { frequency, offset } of NOTES) {
        const t = start + offset;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, t);
        gain.gain.setValueAtTime(SILENT, t);
        gain.gain.exponentialRampToValueAtTime(peak, t + ATTACK);
        gain.gain.exponentialRampToValueAtTime(SILENT, t + DECAY);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(t);
        oscillator.stop(t + DECAY + 0.05);
      }
      return true;
    } catch {
      return false;
    }
  }

  return { unlock, play };
}
