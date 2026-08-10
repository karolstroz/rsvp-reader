/**
 * Turns raw text into the token stream the RSVP player walks over.
 *
 * Tokens keep enough context (paragraph boundaries, trailing punctuation,
 * character offset in the source) that the pacing engine can slow down at
 * natural pauses and the bionic full-text view can map back to the original.
 */

/** Punctuation weight classes, ordered by how long a reader naturally pauses. */
export type PauseKind = 'none' | 'minor' | 'major' | 'paragraph';

export interface Token {
  /** The word as displayed, punctuation included. */
  text: string;
  /** Index of this token in the document. */
  index: number;
  /** Index of the paragraph the token belongs to. */
  paragraph: number;
  /** Pause implied by the token's trailing punctuation / position. */
  pause: PauseKind;
  /** Token contains at least one digit — numbers take longer to read. */
  numeric: boolean;
}

/** A group of 1–3 tokens shown in a single RSVP frame. */
export interface Chunk {
  tokens: Token[];
  /** Index of the first token, used for seeking and progress. */
  startIndex: number;
}

const MINOR_PAUSE = /[,;:)\]}"'”’»]$/;
const MAJOR_PAUSE = /[.!?…]["'”’»)\]]*$/;
const HAS_DIGIT = /\d/;

function classifyPause(text: string, endsParagraph: boolean): PauseKind {
  if (endsParagraph) return 'paragraph';
  if (MAJOR_PAUSE.test(text)) return 'major';
  if (MINOR_PAUSE.test(text)) return 'minor';
  return 'none';
}

/**
 * Split `text` into tokens.
 *
 * Blank lines separate paragraphs; single newlines are treated as soft wraps
 * (which is what EPUB and PDF extraction tend to produce mid-sentence).
 */
export function tokenize(text: string): Token[] {
  // Non-breaking, narrow and zero-width spaces are common in scraped HTML and
  // in PDF extraction; left alone they glue two words into a single token.
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\ufeff]/g, '');
  const paragraphs = normalized.split(/\n\s*\n+/);

  const tokens: Token[] = [];
  let index = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.split(/\s+/).filter(Boolean);

    words.forEach((word, wordIndex) => {
      const endsParagraph = wordIndex === words.length - 1;
      tokens.push({
        text: word,
        index: index++,
        paragraph: paragraphIndex,
        pause: classifyPause(word, endsParagraph),
        numeric: HAS_DIGIT.test(word),
      });
    });
  });

  return tokens;
}

/**
 * Group tokens into frames of `size` words.
 *
 * A chunk is cut short at a major pause or a paragraph end so that a sentence
 * boundary never gets buried in the middle of a frame — that boundary is
 * exactly where the reader needs the extra beat.
 */
export function chunkTokens(tokens: Token[], size: number): Chunk[] {
  const width = Math.max(1, Math.min(3, Math.floor(size) || 1));
  if (width === 1) {
    return tokens.map((token) => ({ tokens: [token], startIndex: token.index }));
  }

  const chunks: Chunk[] = [];
  let current: Token[] = [];

  for (const token of tokens) {
    current.push(token);

    const full = current.length >= width;
    const breaks = token.pause === 'major' || token.pause === 'paragraph';

    if (full || breaks) {
      chunks.push({ tokens: current, startIndex: current[0].index });
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push({ tokens: current, startIndex: current[0].index });
  }

  return chunks;
}

/** Index of the chunk containing `tokenIndex`. Used when seeking. */
export function chunkIndexForToken(chunks: Chunk[], tokenIndex: number): number {
  if (chunks.length === 0) return 0;

  let low = 0;
  let high = chunks.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (chunks[mid].startIndex <= tokenIndex) low = mid;
    else high = mid - 1;
  }

  return low;
}

/** Rough word count used for the reading-time estimate on library cards. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
