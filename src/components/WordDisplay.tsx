'use client';

import { useMemo } from 'react';
import { splitChunkOnOrp } from '@/lib/orp';
import type { Chunk } from '@/lib/tokenizer';
import type { FontFamily } from '@/types';

interface WordDisplayProps {
  chunk: Chunk | undefined;
  fontSize: number;
  fontFamily: FontFamily;
  showGuides: boolean;
}

const FONT_CLASS: Record<FontFamily, string> = {
  sans: 'font-reader-sans',
  serif: 'font-reader-serif',
  mono: 'font-reader-mono',
};

/**
 * Renders one RSVP frame with its ORP letter pinned to the centre of the
 * viewport.
 *
 * The layout is a three-column grid — `1fr | auto | 1fr` — where the pivot
 * letter is the middle column. Both outer columns are the same width and the
 * text inside them grows *away* from the centre, so the pivot never moves by so
 * much as a pixel between frames regardless of word length or font. Doing this
 * with padding or transforms would require measuring text; the grid gets it
 * exactly right for free, which is also why a monospace font is offered but not
 * required.
 */
export function WordDisplay({ chunk, fontSize, fontFamily, showGuides }: WordDisplayProps) {
  const split = useMemo(() => {
    if (!chunk || chunk.tokens.length === 0) return null;
    return splitChunkOnOrp(chunk.tokens.map((token) => token.text));
  }, [chunk]);

  const words = chunk?.tokens.map((token) => token.text).join(' ') ?? '';

  return (
    <div className="relative flex w-full items-center justify-center select-none">
      {/*
        Deliberately not a live region. Frames change every 100 ms at 600 WPM,
        which would flood a screen reader with interruptions. Assistive-tech
        users are served by the full-text view instead, which carries the same
        content in a readable, self-paced form.
      */}
      <span className="sr-only">Current words: {words}</span>

      {showGuides && (
        <>
          {/* Fixation guides: two short ticks marking the ORP column. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 h-4 w-px -translate-x-1/2 bg-line"
            style={{ top: `calc(50% - ${fontSize * 0.85}px)` }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 h-4 w-px -translate-x-1/2 bg-line"
            style={{ top: `calc(50% + ${fontSize * 0.5}px)` }}
          />
        </>
      )}

      <div
        aria-hidden
        className={`grid w-full items-baseline ${FONT_CLASS[fontFamily]}`}
        style={{
          gridTemplateColumns: '1fr auto 1fr',
          fontSize: `${fontSize}px`,
          lineHeight: 1.2,
          // Tabular figures stop numbers from shifting the pivot column.
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span className="justify-self-end overflow-hidden whitespace-pre text-ink">
          {split?.before}
        </span>
        <span className="whitespace-pre text-accent" style={{ fontWeight: 700 }}>
          {split?.pivot}
        </span>
        <span className="justify-self-start overflow-hidden whitespace-pre text-ink">
          {split?.after}
        </span>
      </div>
    </div>
  );
}
