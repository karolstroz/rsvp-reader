import { describe, expect, it } from 'vitest';
import { orpIndex, splitChunkOnOrp, splitOnOrp } from '@/lib/orp';

describe('orpIndex', () => {
  it('follows floor((N - 1) / 3) for short words', () => {
    // 1-based positions from the spec: 1,1,1,2,2,2,3,3,3,4...
    const expected: Record<string, number> = {
      a: 0,
      at: 0,
      the: 0,
      word: 1,
      words: 1,
      lengthy: 2,
    };

    for (const [word, index] of Object.entries(expected)) {
      expect(orpIndex(word), word).toBe(index);
    }
  });

  it('matches the formula across a range of lengths', () => {
    for (let length = 1; length <= 13; length++) {
      const word = 'x'.repeat(length);
      expect(orpIndex(word, { maxPivotIndex: Infinity })).toBe(Math.floor((length - 1) / 3));
    }
  });

  it('caps the pivot so very long words do not overflow the left column', () => {
    expect(orpIndex('internationalisation')).toBe(4);
    expect(orpIndex('internationalisation', { maxPivotIndex: Infinity })).toBe(6);
  });

  it('skips leading punctuation so the pivot lands on a letter', () => {
    // `"hello` should highlight the same letter as `hello`.
    expect(orpIndex('hello')).toBe(1);
    expect(orpIndex('"hello')).toBe(2);
    expect(orpIndex('(hello)')).toBe(2);
  });

  it('ignores trailing punctuation when sizing the word', () => {
    expect(orpIndex('word,')).toBe(orpIndex('word'));
    expect(orpIndex('word."')).toBe(orpIndex('word'));
  });

  it('never returns an out-of-range index', () => {
    for (const word of ['', 'a', '...', '—', '“', 'x'.repeat(60)]) {
      const index = orpIndex(word);
      expect(index).toBeGreaterThanOrEqual(0);
      if (word.length > 0) expect(index).toBeLessThan(word.length);
    }
  });
});

describe('splitOnOrp', () => {
  it('reassembles into the original word', () => {
    for (const word of ['a', 'to', 'reading', 'extraordinary', '“quoted”', '42,000']) {
      const { before, pivot, after } = splitOnOrp(word);
      expect(before + pivot + after).toBe(word);
    }
  });

  it('exposes a single pivot character', () => {
    const split = splitOnOrp('reading');
    expect(split.pivot).toHaveLength(1);
    expect(split.pivot).toBe('a');
    expect(split.before).toBe('re');
    expect(split.after).toBe('ding');
  });

  it('handles the empty string without throwing', () => {
    expect(splitOnOrp('')).toEqual({ before: '', pivot: '', after: '', pivotIndex: 0 });
  });
});

describe('splitChunkOnOrp', () => {
  it('anchors a multi-word chunk on its longest word', () => {
    const split = splitChunkOnOrp(['of', 'recognition', 'the']);
    expect(split.pivot).toHaveLength(1);
    expect(`${split.before}${split.pivot}${split.after}`).toBe('of recognition the');
    // Pivot sits inside `recognition`, not inside `of`.
    expect(split.before.startsWith('of ')).toBe(true);
  });

  it('degrades to the single-word split for a chunk of one', () => {
    expect(splitChunkOnOrp(['reading'])).toEqual(splitOnOrp('reading'));
  });

  it('returns an empty split for an empty chunk', () => {
    expect(splitChunkOnOrp([])).toEqual({ before: '', pivot: '', after: '', pivotIndex: 0 });
  });
});
