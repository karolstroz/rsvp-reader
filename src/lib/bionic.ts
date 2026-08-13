import { splitParagraphs } from './tokenizer';

/**
 * Bionic Reading — bold the leading letters of each word so the eye can jump
 * between fixation points in normal, self-paced prose. Used for the full-text
 * preview shown before (and after) an RSVP session.
 */

export interface BionicWord {
  /** Leading characters to render bold. */
  head: string;
  /** Remainder, rendered at normal weight. */
  tail: string;
}

/**
 * How many leading characters to embolden.
 *
 * Short function words get a single bold letter, mid-length words get roughly
 * the first 40%, and long words are capped so the effect stays a cue rather
 * than turning the paragraph into solid bold.
 */
export function bionicHeadLength(word: string, intensity = 0.4): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  if (letters === 0) return 0;
  if (letters <= 3) return 1;
  return Math.max(1, Math.min(letters - 1, Math.round(letters * intensity)));
}

/** Split a word into its bold head and plain tail. */
export function bionicSplit(word: string, intensity = 0.4): BionicWord {
  // Leading punctuation should not consume the bold budget.
  const leading = word.match(/^[^\p{L}\p{N}]*/u)?.[0] ?? '';
  const rest = word.slice(leading.length);
  const head = bionicHeadLength(rest, intensity);

  return {
    head: leading + rest.slice(0, head),
    tail: rest.slice(head),
  };
}

/** Split a whole text into paragraphs of bionic words, for rendering. */
export function bionicParagraphs(text: string, intensity = 0.4): BionicWord[][] {
  // Uses the tokenizer's splitter so the full-text view and the token stream can
  // never disagree about where a word begins — the RSVP cursor is mapped onto
  // this rendering by source position.
  return splitParagraphs(text).map((paragraph) =>
    paragraph.map((word) => bionicSplit(word, intensity)),
  );
}
