import { describe, expect, it } from 'vitest';
import {
  PAUSE_MULTIPLIER,
  baseDuration,
  chunkDuration,
  formatDuration,
  lengthMultiplier,
  remainingTime,
  tokenDuration,
} from '@/lib/pacing';
import { chunkTokens, tokenize } from '@/lib/tokenizer';

const FAST = { wpm: 600, smartPacing: true };
const FLAT = { wpm: 600, smartPacing: false };

describe('baseDuration', () => {
  it('converts WPM into milliseconds per word', () => {
    expect(baseDuration(300)).toBe(200);
    expect(baseDuration(600)).toBe(100);
    expect(baseDuration(1000)).toBe(60);
  });

  it('does not divide by zero', () => {
    expect(Number.isFinite(baseDuration(0))).toBe(true);
    expect(Number.isFinite(baseDuration(-100))).toBe(true);
  });
});

describe('lengthMultiplier', () => {
  it('leaves short words untouched', () => {
    expect(lengthMultiplier('word')).toBe(1);
    expect(lengthMultiplier('speeding')).toBe(1); // exactly 8 letters
  });

  it('stretches long words and caps the stretch', () => {
    expect(lengthMultiplier('recognition')).toBeGreaterThan(1);
    expect(lengthMultiplier('x'.repeat(80))).toBeLessThanOrEqual(1.6);
  });

  it('ignores punctuation when measuring length', () => {
    expect(lengthMultiplier('recognition,')).toBe(lengthMultiplier('recognition'));
  });
});

describe('tokenDuration', () => {
  it('holds a word after a full stop longer than a bare word', () => {
    const [bare, stopped] = tokenize('word stop.\n\nx');
    expect(tokenDuration(stopped, FAST)).toBeGreaterThan(tokenDuration(bare, FAST));
  });

  it('orders the pause classes as none < minor < major < paragraph', () => {
    expect(PAUSE_MULTIPLIER.none).toBeLessThan(PAUSE_MULTIPLIER.minor);
    expect(PAUSE_MULTIPLIER.minor).toBeLessThan(PAUSE_MULTIPLIER.major);
    expect(PAUSE_MULTIPLIER.major).toBeLessThan(PAUSE_MULTIPLIER.paragraph);
  });

  it('is uniform when smart pacing is off', () => {
    const tokens = tokenize('a stop. lengthy-word 1,200');
    const durations = tokens.map((token) => tokenDuration(token, FLAT));
    expect(new Set(durations).size).toBe(1);
    expect(durations[0]).toBe(baseDuration(FLAT.wpm));
  });

  it('gives numbers extra time', () => {
    const [word, number] = tokenize('total 4096');
    expect(tokenDuration(number, FAST)).toBeGreaterThan(tokenDuration(word, FAST));
  });
});

describe('chunkDuration', () => {
  it('scales with the number of words in the frame', () => {
    const single = chunkTokens(tokenize('a b c'), 1)[0];
    const triple = chunkTokens(tokenize('a b c'), 3)[0];
    expect(chunkDuration(triple, FLAT)).toBe(chunkDuration(single, FLAT) * 3);
  });

  it('applies only the final word’s pause, not an interior one', () => {
    // `one, two three` — the comma is interior, so it must not add a beat.
    const withInteriorComma = chunkTokens(tokenize('one, two three go'), 3)[0];
    const plain = chunkTokens(tokenize('one two three go'), 3)[0];
    expect(chunkDuration(withInteriorComma, FAST)).toBeCloseTo(chunkDuration(plain, FAST), 5);
  });

  it('never returns zero for an empty chunk', () => {
    expect(chunkDuration({ tokens: [], startIndex: 0 }, FAST)).toBeGreaterThan(0);
  });
});

describe('remainingTime', () => {
  it('shrinks as the reader advances', () => {
    const chunks = chunkTokens(tokenize('one two three four five six'), 1);
    expect(remainingTime(chunks, 0, FAST)).toBeGreaterThan(remainingTime(chunks, 3, FAST));
    expect(remainingTime(chunks, chunks.length, FAST)).toBe(0);
  });

  it('roughly matches the nominal WPM for plain prose', () => {
    const words = Array.from({ length: 600 }, () => 'word').join(' ');
    const chunks = chunkTokens(tokenize(words), 1);
    // 600 words at 600 WPM ≈ 1 minute; smart pacing adds the paragraph beat only.
    expect(remainingTime(chunks, 0, { wpm: 600, smartPacing: true })).toBeGreaterThan(59_000);
    expect(remainingTime(chunks, 0, { wpm: 600, smartPacing: true })).toBeLessThan(62_000);
  });

  it('clamps a negative starting index', () => {
    const chunks = chunkTokens(tokenize('one two'), 1);
    expect(remainingTime(chunks, -4, FAST)).toBe(remainingTime(chunks, 0, FAST));
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9_000)).toBe('0:09');
    expect(formatDuration(90_000)).toBe('1:30');
  });

  it('adds an hours field past 60 minutes', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });

  it('never renders a negative duration', () => {
    expect(formatDuration(-5000)).toBe('0:00');
  });
});
