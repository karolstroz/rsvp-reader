'use client';

import { Fragment, useMemo } from 'react';
import { bionicParagraphs } from '@/lib/bionic';
import type { FontFamily } from '@/types';

interface BionicTextProps {
  text: string;
  bionic: boolean;
  fontFamily: FontFamily;
  /** Token index currently under the RSVP cursor, highlighted in the flow. */
  activeToken?: number;
}

const FONT_CLASS: Record<FontFamily, string> = {
  sans: 'font-reader-sans',
  serif: 'font-reader-serif',
  mono: 'font-reader-mono',
};

/**
 * Self-paced full-text view, optionally with Bionic Reading emphasis.
 *
 * This is also the accessible rendering of the document: the RSVP surface
 * deliberately does not announce frames, so everything a reader might miss
 * there is available here as ordinary, selectable prose.
 */
export function BionicText({ text, bionic, fontFamily, activeToken }: BionicTextProps) {
  const paragraphs = useMemo(() => bionicParagraphs(text), [text]);

  // Running token index so the active word can be marked across paragraphs.
  let cursor = 0;

  return (
    <article
      className={`mx-auto max-w-2xl space-y-4 text-lg leading-relaxed text-ink ${FONT_CLASS[fontFamily]}`}
    >
      {paragraphs.map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex}>
          {paragraph.map((word, wordIndex) => {
            const index = cursor++;
            const isActive = activeToken !== undefined && index === activeToken;

            return (
              <Fragment key={wordIndex}>
                <span
                  className={isActive ? 'rounded bg-accent/25 px-0.5 text-accent' : undefined}
                  data-token={index}
                >
                  {bionic ? (
                    <>
                      <strong className="font-semibold">{word.head}</strong>
                      {word.tail}
                    </>
                  ) : (
                    word.head + word.tail
                  )}
                </span>{' '}
              </Fragment>
            );
          })}
        </p>
      ))}
    </article>
  );
}
