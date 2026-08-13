import { describe, expect, it } from 'vitest';
import {
  chunkIndexForToken,
  chunkTokens,
  countWords,
  stripOuterPunctuation,
  tokenize,
} from '@/lib/tokenizer';

describe('tokenize', () => {
  it('numbers tokens sequentially across the document', () => {
    const tokens = tokenize('one two three');
    expect(tokens.map((token) => token.text)).toEqual(['one', 'two', 'three']);
    expect(tokens.map((token) => token.index)).toEqual([0, 1, 2]);
  });

  it('splits paragraphs on blank lines and joins soft-wrapped lines', () => {
    const tokens = tokenize('first line\nsame paragraph\n\nsecond paragraph');
    expect(tokens.map((token) => token.paragraph)).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it('classifies trailing punctuation into pause weights', () => {
    const tokens = tokenize('Wait, stop. Really? Yes!\n\nNext');
    const pauses = Object.fromEntries(tokens.map((token) => [token.text, token.pause]));

    expect(pauses['Wait,']).toBe('minor');
    expect(pauses['stop.']).toBe('major');
    expect(pauses['Really?']).toBe('major');
    // Last word of a paragraph outranks its own punctuation.
    expect(pauses['Yes!']).toBe('paragraph');
    expect(pauses['Next']).toBe('paragraph');
  });

  it('detects numeric tokens', () => {
    const tokens = tokenize('about 1,200 people');
    expect(tokens.map((token) => token.numeric)).toEqual([false, true, false]);
  });

  it('splits on non-breaking spaces and drops zero-width ones', () => {
    const tokens = tokenize('one\u00a0two\u200btail');
    expect(tokens.map((token) => token.text)).toEqual(['one', 'twotail']);
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   \n\n  ')).toEqual([]);
  });
});

describe('chunkTokens', () => {
  it('returns one token per chunk at width 1', () => {
    const chunks = chunkTokens(tokenize('a b c'), 1);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.tokens.length === 1)).toBe(true);
  });

  it('groups tokens up to the requested width', () => {
    const chunks = chunkTokens(tokenize('a b c d e f'), 3);
    expect(chunks.map((chunk) => chunk.tokens.length)).toEqual([3, 3]);
  });

  it('cuts a chunk short at a sentence boundary', () => {
    // `stop.` ends a sentence, so it must not sit mid-frame.
    const chunks = chunkTokens(tokenize('go stop. now then'), 3);
    expect(chunks[0].tokens.map((token) => token.text)).toEqual(['go', 'stop.']);
  });

  it('clamps out-of-range widths into 1–3', () => {
    expect(chunkTokens(tokenize('a b c d'), 0)[0].tokens).toHaveLength(1);
    expect(chunkTokens(tokenize('a b c d'), 9)[0].tokens).toHaveLength(3);
  });

  it('covers every token exactly once', () => {
    const tokens = tokenize('one two three, four five. six seven eight nine');
    for (const width of [1, 2, 3]) {
      const flattened = chunkTokens(tokens, width).flatMap((chunk) => chunk.tokens);
      expect(flattened.map((token) => token.index)).toEqual(tokens.map((token) => token.index));
    }
  });
});

describe('chunkIndexForToken', () => {
  it('finds the chunk containing a token', () => {
    const tokens = tokenize('a b c d e f g h i');
    const chunks = chunkTokens(tokens, 3);

    expect(chunkIndexForToken(chunks, 0)).toBe(0);
    expect(chunkIndexForToken(chunks, 2)).toBe(0);
    expect(chunkIndexForToken(chunks, 3)).toBe(1);
    expect(chunkIndexForToken(chunks, 8)).toBe(2);
  });

  it('clamps out-of-range token indices', () => {
    const chunks = chunkTokens(tokenize('a b c'), 1);
    expect(chunkIndexForToken(chunks, -5)).toBe(0);
    expect(chunkIndexForToken(chunks, 999)).toBe(2);
    expect(chunkIndexForToken([], 3)).toBe(0);
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two  three\nfour')).toBe(4);
    expect(countWords('   ')).toBe(0);
  });
});

describe('stripOuterPunctuation', () => {
  it('removes punctuation that surrounds a word', () => {
    expect(stripOuterPunctuation('word,')).toBe('word');
    expect(stripOuterPunctuation('word.')).toBe('word');
    expect(stripOuterPunctuation('word;')).toBe('word');
    expect(stripOuterPunctuation('word:')).toBe('word');
    expect(stripOuterPunctuation('word!')).toBe('word');
    expect(stripOuterPunctuation('word?')).toBe('word');
    expect(stripOuterPunctuation('(word)')).toBe('word');
    expect(stripOuterPunctuation('"word."')).toBe('word');
    expect(stripOuterPunctuation('\u201eslowo\u201d')).toBe('slowo');
  });

  it('keeps punctuation that lives inside a word', () => {
    // These are load-bearing: removing them changes the word or the number.
    expect(stripOuterPunctuation("don't")).toBe("don't");
    expect(stripOuterPunctuation('well-known')).toBe('well-known');
    expect(stripOuterPunctuation('1,200')).toBe('1,200');
    expect(stripOuterPunctuation('3.14')).toBe('3.14');
    expect(stripOuterPunctuation('and/or')).toBe('and/or');
    expect(stripOuterPunctuation('e.g.')).toBe('e.g');
  });

  it('keeps a leading sign that belongs to a number', () => {
    // Stripping here would not be a formatting choice, it would be a wrong value.
    expect(stripOuterPunctuation('-5')).toBe('-5');
    expect(stripOuterPunctuation('+3.5')).toBe('+3.5');
    // A dash not attached to a digit is just punctuation.
    expect(stripOuterPunctuation('-word')).toBe('word');
  });

  it('empties tokens that are nothing but punctuation', () => {
    for (const token of ['\u2014', '\u2013', '-', '...', '\u2026', '*', '\u2022', '"']) {
      expect(stripOuterPunctuation(token), token).toBe('');
    }
  });
});

describe('punctuation-only words', () => {
  it('are dropped from the stream instead of becoming blank frames', () => {
    // A spaced em dash is ordinary Polish and English typography.
    const tokens = tokenize('slowo \u2014 inne slowo');
    expect(tokens.map((token) => token.display)).toEqual(['slowo', 'inne', 'slowo']);
    expect(tokens.every((token) => token.display.length > 0)).toBe(true);
  });

  it('hand their pause to the word before them', () => {
    const [first] = tokenize('slowo \u2014 inne slowo');
    // The dash implies a beat; losing the character must not lose the rhythm.
    expect(first.pause).toBe('minor');
  });

  it('do not break the paragraph pause when they end a paragraph', () => {
    const tokens = tokenize('one two \u2014\n\nnext');
    expect(tokens.map((token) => token.display)).toEqual(['one', 'two', 'next']);
    expect(tokens[1].pause).toBe('paragraph');
  });

  it('leave token indices contiguous', () => {
    const tokens = tokenize('a \u2014 b \u2014 c');
    expect(tokens.map((token) => token.index)).toEqual([0, 1, 2]);
  });

  it('keep sourceIndex pointing at the original word position', () => {
    const tokens = tokenize('a \u2014 b');
    // 'b' is the third word in the source even though it is the second token.
    expect(tokens.map((token) => token.sourceIndex)).toEqual([0, 2]);
  });
});

describe('token display', () => {
  it('keeps the original text alongside the cleaned form', () => {
    const [token] = tokenize('word,');
    expect(token.text).toBe('word,');
    expect(token.display).toBe('word');
  });

  it('still classifies the pause from the original punctuation', () => {
    const [comma, stop] = tokenize('one, two. three\n\nx');
    expect(comma.pause).toBe('minor');
    expect(stop.pause).toBe('major');
  });
});
