/**
 * Pacing engine — how long a single RSVP frame stays on screen.
 *
 * A naive player shows every word for exactly 60000/WPM ms. That reads as
 * robotic: sentence boundaries vanish and long words flash past before they are
 * recognised. Here the base duration is modulated by punctuation, word length
 * and paragraph structure so the rhythm approximates natural prose.
 */

import type { Chunk, PauseKind, Token } from './tokenizer';

export interface PacingOptions {
  /** Target reading speed in words per minute. */
  wpm: number;
  /** Apply punctuation and long-word modulation. When false, every frame is uniform. */
  smartPacing: boolean;
}

/** Multipliers applied to the base duration for each pause class. */
export const PAUSE_MULTIPLIER: Record<PauseKind, number> = {
  none: 1,
  minor: 1.5, // comma, semicolon, colon — a short beat
  major: 2, // full stop, question mark, exclamation mark
  paragraph: 2.5, // end of a paragraph: the longest natural rest
};

/** Words longer than this get proportionally more time. */
const LONG_WORD_THRESHOLD = 8;
const LONG_WORD_STEP = 0.05;
const LONG_WORD_CAP = 1.6;

/** Digits are read slower than letters. */
const NUMERIC_MULTIPLIER = 1.3;

/** Base milliseconds per word at a given speed. */
export function baseDuration(wpm: number): number {
  const safe = Math.max(1, wpm);
  return 60_000 / safe;
}

/** Length-based stretch factor for a single word. */
export function lengthMultiplier(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  if (letters <= LONG_WORD_THRESHOLD) return 1;
  return Math.min(LONG_WORD_CAP, 1 + (letters - LONG_WORD_THRESHOLD) * LONG_WORD_STEP);
}

/** Time in milliseconds that a single token should be visible. */
export function tokenDuration(token: Token, options: PacingOptions): number {
  const base = baseDuration(options.wpm);
  if (!options.smartPacing) return base;

  let duration = base * lengthMultiplier(token.text);
  if (token.numeric) duration *= NUMERIC_MULTIPLIER;
  duration *= PAUSE_MULTIPLIER[token.pause];

  return duration;
}

/**
 * Time a whole frame stays on screen.
 *
 * Multi-word frames cost the sum of their words, but only the *last* word's
 * punctuation pause is applied — an interior comma does not stop a frame the
 * reader is taking in as one unit.
 */
export function chunkDuration(chunk: Chunk, options: PacingOptions): number {
  if (chunk.tokens.length === 0) return baseDuration(options.wpm);

  if (!options.smartPacing) {
    return baseDuration(options.wpm) * chunk.tokens.length;
  }

  const last = chunk.tokens[chunk.tokens.length - 1];
  const body = chunk.tokens.reduce((total, token) => {
    const base = baseDuration(options.wpm) * lengthMultiplier(token.text);
    return total + (token.numeric ? base * NUMERIC_MULTIPLIER : base);
  }, 0);

  return body * PAUSE_MULTIPLIER[last.pause];
}

/** Total milliseconds remaining from `fromChunk` to the end of the document. */
export function remainingTime(
  chunks: Chunk[],
  fromChunk: number,
  options: PacingOptions,
): number {
  let total = 0;
  for (let i = Math.max(0, fromChunk); i < chunks.length; i++) {
    total += chunkDuration(chunks[i], options);
  }
  return total;
}

/** `mm:ss`, or `h:mm:ss` past an hour. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
