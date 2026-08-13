/**
 * Turns raw text into the token stream the RSVP player walks over.
 *
 * Tokens keep enough context (paragraph boundaries, trailing punctuation,
 * position in the source) that the pacing engine can slow down at natural
 * pauses and the full-text view can map back to the original prose.
 */

/** Punctuation weight classes, ordered by how long a reader naturally pauses. */
export type PauseKind = 'none' | 'minor' | 'major' | 'paragraph';

export interface Token {
  /** The word as it appears in the source, punctuation included. */
  text: string;
  /**
   * The word with surrounding punctuation removed — what the RSVP frame shows.
   *
   * A trailing comma shifts a word's centre of mass, which is precisely what
   * the ORP alignment exists to hold still, so the frame renders this instead.
   * Never empty: punctuation-only tokens are dropped rather than blanked.
   */
  display: string;
  /** Index of this token in the token stream. Contiguous. */
  index: number;
  /**
   * Index of the word in the raw source, before punctuation-only words were
   * dropped. Lets the full-text view highlight the right word even though it
   * renders every word, including the ones the reader never sees as a frame.
   */
  sourceIndex: number;
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

const MINOR_PAUSE = /[,;:)\]}"'”’»–—]$/;
const MAJOR_PAUSE = /[.!?…]["'”’»)\]]*$/;
const HAS_DIGIT = /\d/;

/**
 * Characters stripped from the front of a word. A `-` or `+` is included, but
 * the stripper puts it back when a digit follows it — otherwise `-5°C` would be
 * displayed as `5°C`, which is not a formatting nicety but a wrong number.
 */
const LEADING_PUNCTUATION = new Set('"\'“”‘’„‚«»‹›([{¿¡–—-*_#·•');

/** Characters stripped from the end of a word. */
const TRAILING_PUNCTUATION = new Set('"\'“”‘’„‚«»‹›)]}.,;:!?…–—-*_·•');

const SIGN_CHARACTERS = new Set('-+−');

const PAUSE_RANK: Record<PauseKind, number> = {
  none: 0,
  minor: 1,
  major: 2,
  paragraph: 3,
};

/**
 * Remove punctuation that surrounds a word, keeping anything inside it.
 *
 * Inner punctuation is load-bearing and must survive: `don't`, `well-known`,
 * `1,200`, `3.14`, `and/or`. Only the outer shell comes off, so `„słowo”` and
 * `słowo,` both reduce to `słowo`.
 *
 * Returns an empty string for tokens that are nothing but punctuation — a lone
 * em dash, `...`, a stray bullet. Those are dropped from the stream by
 * `tokenize` rather than being shown as an empty frame; spaced em dashes are
 * ordinary Polish and English typography, so this is a common case, not an
 * exotic one.
 */
export function stripOuterPunctuation(word: string): string {
  let start = 0;

  while (start < word.length && LEADING_PUNCTUATION.has(word[start])) {
    const signOfNumber = SIGN_CHARACTERS.has(word[start]) && HAS_DIGIT.test(word[start + 1] ?? '');
    if (signOfNumber) break;
    start++;
  }

  let end = word.length;
  while (end > start && TRAILING_PUNCTUATION.has(word[end - 1])) {
    end--;
  }

  return word.slice(start, end);
}

function classifyPause(text: string, endsParagraph: boolean): PauseKind {
  if (endsParagraph) return 'paragraph';
  if (MAJOR_PAUSE.test(text)) return 'major';
  if (MINOR_PAUSE.test(text)) return 'minor';
  return 'none';
}

function strongerPause(a: PauseKind, b: PauseKind): PauseKind {
  return PAUSE_RANK[a] >= PAUSE_RANK[b] ? a : b;
}

/**
 * Normalize whitespace that would otherwise corrupt word boundaries.
 *
 * Non-breaking, narrow and zero-width spaces are common in scraped HTML and in
 * PDF extraction; left alone they glue two words into a single token.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\ufeff]/g, '');
}

/**
 * Split text into paragraphs of raw words.
 *
 * Blank lines separate paragraphs; single newlines are treated as soft wraps
 * (which is what EPUB and PDF extraction tend to produce mid-sentence).
 *
 * Shared by the tokenizer and the full-text view so the two can never disagree
 * about where a word starts.
 */
export function splitParagraphs(text: string): string[][] {
  return normalizeText(text)
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.split(/\s+/).filter(Boolean))
    .filter((paragraph) => paragraph.length > 0);
}

/** Split `text` into the tokens the player steps through. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let sourceIndex = 0;

  splitParagraphs(text).forEach((words, paragraphIndex) => {
    words.forEach((word, wordIndex) => {
      const current = sourceIndex++;
      const pause = classifyPause(word, wordIndex === words.length - 1);
      const display = stripOuterPunctuation(word);

      if (!display) {
        // Punctuation-only word. It carries no reading value of its own, but it
        // does imply a beat, so hand its pause to the token before it rather
        // than losing the rhythm along with the character.
        const previous = tokens[tokens.length - 1];
        if (previous) previous.pause = strongerPause(previous.pause, pause);
        return;
      }

      tokens.push({
        text: word,
        display,
        index: 0, // assigned below, once the dropped words are known
        sourceIndex: current,
        paragraph: paragraphIndex,
        pause,
        numeric: HAS_DIGIT.test(word),
      });
    });
  });

  tokens.forEach((token, index) => {
    token.index = index;
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
