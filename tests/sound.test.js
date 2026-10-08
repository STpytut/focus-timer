import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChime } from '../src/sound.js';

function param(log, name) {
  return {
    setValueAtTime: (v, t) => log.push([name, 'set', v, t]),
    exponentialRampToValueAtTime: (v, t) => log.push([name, 'ramp', v, t]),
  };
}

function fakeAudio({ state = 'suspended', resumeFails = false } = {}) {
  const log = [];
  const contexts = [];
  class FakeContext {
    constructor() {
      contexts.push(this);
      this.state = state;
      this.currentTime = 10;
      this.destination = { name: 'destination' };
    }
    async resume() {
      log.push(['resume']);
      if (resumeFails) throw new Error('NotAllowedError');
      this.state = 'running';
    }
    createOscillator() {
      return {
        type: '',
        frequency: param(log, 'frequency'),
        connect: () => log.push(['osc.connect']),
        start: (t) => log.push(['osc.start', t]),
        stop: (t) => log.push(['osc.stop', t]),
      };
    }
    createGain() {
      return { gain: param(log, 'gain'), connect: (d) => log.push(['gain.connect', d.name]) };
    }
  }
  return { FakeContext, log, contexts, count: () => contexts.length };
}

test('unlock creates and resumes a single context', async () => {
  const audio = fakeAudio();
  const chime = createChime({ AudioContextCtor: audio.FakeContext });
  assert.equal(await chime.unlock(), true);
  assert.equal(await chime.unlock(), true);
  assert.equal(audio.count(), 1);
  assert.equal(audio.log.filter(([e]) => e === 'resume').length, 1);
});

test('play synthesizes oscillator notes with a gain envelope', async () => {
  const audio = fakeAudio({ state: 'running' });
  const chime = createChime({ AudioContextCtor: audio.FakeContext });
  assert.equal(await chime.play(), true);
  assert.equal(audio.log.filter(([e]) => e === 'osc.start').length, 2);
  assert.equal(audio.log.filter(([e]) => e === 'osc.stop').length, 2);
  const gain = audio.log.filter(([name]) => name === 'gain');
  // Each note starts near silence, rises, and fades back out.
  assert.equal(gain.length, 6);
  assert.ok(gain[0][2] < 0.001 && gain[1][2] > 0.1 && gain[2][2] < 0.001);
  assert.ok(audio.log.some(([e, d]) => e === 'gain.connect' && d === 'destination'));
});

test('missing Web Audio, constructor errors and rejected resume fail quietly', async () => {
  const none = createChime({ AudioContextCtor: undefined });
  assert.equal(await none.unlock(), false);
  assert.equal(await none.play(), false);

  const throwing = createChime({
    AudioContextCtor: class {
      constructor() {
        throw new Error('blocked');
      }
    },
  });
  assert.equal(await throwing.unlock(), false);
  assert.equal(await throwing.play(), false);

  const audio = fakeAudio({ resumeFails: true });
  const rejected = createChime({ AudioContextCtor: audio.FakeContext });
  assert.equal(await rejected.unlock(), false);
  assert.equal(await rejected.play(), false);
  assert.equal(audio.log.filter(([e]) => e === 'osc.start').length, 0);
});

test('a closed context is replaced', async () => {
  const audio = fakeAudio({ state: 'running' });
  const chime = createChime({ AudioContextCtor: audio.FakeContext });
  await chime.unlock();
  audio.contexts[0].state = 'closed';
  assert.equal(await chime.play(), true);
  assert.equal(audio.count(), 2);
});

const peaks = (audio) => audio.log.filter(([n, k]) => n === 'gain' && k === 'ramp').filter((_, i) => i % 2 === 0).map((e) => e[2]);

test('default and full volume use the original peak gain', async () => {
  for (const args of [[], [100]]) {
    const audio = fakeAudio({ state: 'running' });
    assert.equal(await createChime({ AudioContextCtor: audio.FakeContext }).play(...args), true);
    assert.deepEqual(peaks(audio), [0.2, 0.2]);
  }
});

test('volume scales the peak gain and keeps the envelope shape', async () => {
  const audio = fakeAudio({ state: 'running' });
  await createChime({ AudioContextCtor: audio.FakeContext }).play(50);
  assert.deepEqual(peaks(audio), [0.1, 0.1]);
  const gain = audio.log.filter(([n]) => n === 'gain');
  assert.equal(gain.length, 6);
  assert.ok(gain[0][2] < 0.001 && gain[2][2] < 0.001);
});

test('volume zero is silent but still succeeds; out-of-range values are clamped', async () => {
  const silent = fakeAudio({ state: 'running' });
  assert.equal(await createChime({ AudioContextCtor: silent.FakeContext }).play(0), true);
  assert.equal(silent.log.filter(([e]) => e === 'osc.start').length, 0);

  const loud = fakeAudio({ state: 'running' });
  await createChime({ AudioContextCtor: loud.FakeContext }).play(500);
  assert.deepEqual(peaks(loud), [0.2, 0.2]);

  const negative = fakeAudio({ state: 'running' });
  await createChime({ AudioContextCtor: negative.FakeContext }).play(-3);
  assert.equal(negative.log.filter(([e]) => e === 'osc.start').length, 0);
});
