import { describe, expect, it } from 'vitest';
import { bionicHeadLength, bionicParagraphs, bionicSplit } from '@/lib/bionic';
import { tokenize } from '@/lib/tokenizer';

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
  it('produces one entry per word, aligned with the tokenizer', () => {
    const text = 'first paragraph here\n\nsecond one follows now';
    const words = bionicParagraphs(text).flat();
    expect(words).toHaveLength(tokenize(text).length);
  });

  it('drops empty paragraphs so token indices stay aligned', () => {
    const text = 'one two\n\n\n\nthree four';
    expect(bionicParagraphs(text)).toHaveLength(2);
    expect(bionicParagraphs(text).flat()).toHaveLength(tokenize(text).length);
  });

  it('returns nothing for empty input', () => {
    expect(bionicParagraphs('')).toEqual([]);
  });
});
