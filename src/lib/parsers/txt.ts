import type { ParsedContent, ParseProgressHandler } from '@/types';

/** Read a plain-text file. Title falls back to the filename. */
export async function parseTxt(
  file: File,
  onProgress?: ParseProgressHandler,
): Promise<ParsedContent> {
  onProgress?.({ stage: 'Reading file', ratio: 0.2 });

  const text = await file.text();

  onProgress?.({ stage: 'Done', ratio: 1 });

  return {
    title: file.name.replace(/\.[^.]+$/, ''),
    text: normalizePlainText(text),
  };
}

/**
 * Plain text and PDF extraction both produce hard-wrapped lines. Joining lines
 * that continue a sentence keeps paragraphs intact for the tokenizer, which
 * relies on blank lines to detect paragraph pauses.
 */
export function normalizePlainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n\n')
    .map((paragraph) => paragraph.replace(/\n(?!\s*$)/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}
