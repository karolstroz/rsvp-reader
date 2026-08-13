import { describe, expect, it } from 'vitest';
import { bionicHeadLength, bionicParagraphs, bionicSplit } from '@/lib/bionic';
import { splitParagraphs, tokenize } from '@/lib/tokenizer';

describe('bionicHeadLength', () => {
  it('bolds a single letter of short function words', () => {
    expect(bionicHeadLength('a')).toBe(1);
    expect(bionicHeadLength('to')).toBe(1);
    expect(bionicHeadLength('the')).toBe(1);
  });

  it('bolds roughly the first 40% of longer words', () => {
    expect(bionicHeadLength('reading')).toBe(3);
    expect(bionicHeadLength('recognition')).toBe(4);
  });

  it('always leaves at least one plain character', () => {
    for (const word of ['ab', 'abcd', 'recognition', 'x'.repeat(40)]) {
      expect(bionicHeadLength(word)).toBeLessThan(word.length);
    }
  });

  it('returns zero for a token with no letters or digits', () => {
    expect(bionicHeadLength('—')).toBe(0);
  });
});

describe('bionicSplit', () => {
  it('reassembles into the original word', () => {
    for (const word of ['a', 'reading', '"quoted"', '(parenthesised)', '1,200']) {
      const { head, tail } = bionicSplit(word);
      expect(head + tail).toBe(word);
    }
  });

  it('does not spend the bold budget on leading punctuation', () => {
    expect(bionicSplit('"reading').head).toBe('"rea');
  });
});

describe('bionicParagraphs', () => {
  it('renders every word in the source, including punctuation-only ones', () => {
    // The full-text view is ordinary prose and keeps what the RSVP frame drops.
    const text = 'first \u2014 paragraph here';
    expect(bionicParagraphs(text).flat()).toHaveLength(splitParagraphs(text).flat().length);
  });

  it('drops empty paragraphs', () => {
    expect(bionicParagraphs('one two\n\n\n\nthree four')).toHaveLength(2);
  });

  it('stays aligned with sourceIndex, which is how the cursor is mapped onto it', () => {
    // This is the contract the reader depends on: highlighting token N in the
    // full-text view means highlighting the word at its sourceIndex.
    const text = 'alpha \u2014 beta gamma.\n\ndelta';
    const words = bionicParagraphs(text).flat();
    const raw = splitParagraphs(text).flat();

    for (const token of tokenize(text)) {
      const word = words[token.sourceIndex];
      expect(word.head + word.tail, `token ${token.index}`).toBe(raw[token.sourceIndex]);
      expect(word.head + word.tail).toBe(token.text);
    }
  });

  it('returns nothing for empty input', () => {
    expect(bionicParagraphs('')).toEqual([]);
  });
});
