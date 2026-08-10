/**
 * ORP — Optimal Recognition Point.
 *
 * When the eye fixates on a word it does not land in the geometric centre but
 * slightly left of it. RSVP readers exploit this: if every word is rendered so
 * that its ORP letter sits at the same horizontal pixel, the eye never has to
 * saccade between words and reading speed is bounded only by recognition.
 *
 * Pivot position for a word of length N (1-based) is `floor((N - 1) / 3) + 1`,
 * i.e. the 0-based index is `floor((N - 1) / 3)`.
 */

/** A word split around its ORP letter, ready to be rendered in three columns. */
export interface OrpSplit {
  /** Everything before the pivot letter. Rendered right-aligned. */
  before: string;
  /** The single pivot character. Rendered in the fixed centre column. */
  pivot: string;
  /** Everything after the pivot letter. Rendered left-aligned. */
  after: string;
  /** 0-based index of the pivot within the original word. */
  pivotIndex: number;
}

export interface OrpOptions {
  /**
   * Upper bound on the pivot index. Without a cap, very long words push the
   * pivot so far right that the surrounding text overflows the display on the
   * left. Set to `Infinity` to follow the raw formula.
   * @default 4
   */
  maxPivotIndex?: number;
  /**
   * Skip leading punctuation (opening quotes, brackets, dashes) when locating
   * the pivot, so the highlight lands on a letter rather than on `"` or `(`.
   * @default true
   */
  ignoreLeadingPunctuation?: boolean;
}

const LEADING_PUNCTUATION = /^[\s"'“‘„«(\[{¿¡\-–—*_]+/;
const TRAILING_PUNCTUATION = /[\s"'”’»)\]}.,!?;:…\-–—*_]+$/;

/**
 * Position of the ORP letter within `word`, as a 0-based index.
 *
 * The formula is applied to the *core* of the word (the part left after
 * stripping surrounding punctuation) and the result is then mapped back onto
 * the full token, so `"hello,` highlights the same letter as `hello`.
 */
export function orpIndex(word: string, options: OrpOptions = {}): number {
  const { maxPivotIndex = 4, ignoreLeadingPunctuation = true } = options;

  if (word.length === 0) return 0;

  let offset = 0;
  let core = word;

  if (ignoreLeadingPunctuation) {
    const leading = word.match(LEADING_PUNCTUATION);
    if (leading && leading[0].length < word.length) {
      offset = leading[0].length;
      core = word.slice(offset);
    }
    core = core.replace(TRAILING_PUNCTUATION, '') || core;
  }

  // A token made entirely of punctuation has no core; fall back to the token.
  if (core.length === 0) {
    core = word;
    offset = 0;
  }

  const raw = Math.floor((core.length - 1) / 3);
  const capped = Math.min(raw, maxPivotIndex);

  return Math.min(offset + capped, word.length - 1);
}

/** Split `word` into the three parts needed to render it centred on its ORP. */
export function splitOnOrp(word: string, options: OrpOptions = {}): OrpSplit {
  if (word.length === 0) {
    return { before: '', pivot: '', after: '', pivotIndex: 0 };
  }

  const pivotIndex = orpIndex(word, options);

  return {
    before: word.slice(0, pivotIndex),
    pivot: word[pivotIndex],
    after: word.slice(pivotIndex + 1),
    pivotIndex,
  };
}

/**
 * Split a chunk of one or more words so that a single pivot is highlighted.
 *
 * With multi-word chunks the eye still needs one anchor, so the pivot is taken
 * from the *longest* word in the chunk — that is the word that costs the most
 * to recognise, and anchoring it keeps the chunk visually balanced.
 */
export function splitChunkOnOrp(words: string[], options: OrpOptions = {}): OrpSplit {
  if (words.length === 0) return { before: '', pivot: '', after: '', pivotIndex: 0 };
  if (words.length === 1) return splitOnOrp(words[0], options);

  let anchor = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i].length > words[anchor].length) anchor = i;
  }

  const local = splitOnOrp(words[anchor], options);
  const head = words.slice(0, anchor).join(' ');
  const tail = words.slice(anchor + 1).join(' ');

  const before = head ? `${head} ${local.before}` : local.before;
  const after = tail ? `${local.after} ${tail}` : local.after;

  return { before, pivot: local.pivot, after, pivotIndex: before.length };
}
