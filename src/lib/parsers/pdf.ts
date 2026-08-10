/**
 * PDF text extraction with pdf.js.
 *
 * Runs entirely in the browser so large PDFs never touch the network. pdf.js
 * returns positioned text items rather than lines, so we reassemble paragraphs
 * from the vertical positions of each item.
 */

import type { ParsedContent, ParseProgressHandler } from '@/types';
import { normalizePlainText } from './txt';

type TextItem = { str: string; transform: number[]; hasEOL?: boolean };

let workerConfigured = false;

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');

  if (!workerConfigured) {
    // Bundler-resolved worker URL: no CDN, no copy step, works offline.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }

  return pdfjs;
}

export async function parsePdf(
  file: File,
  onProgress?: ParseProgressHandler,
): Promise<ParsedContent> {
  onProgress?.({ stage: 'Loading PDF engine', ratio: 0.02 });

  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());

  onProgress?.({ stage: 'Opening document', ratio: 0.08 });

  // The loading task, not the document proxy, owns the worker — releasing it is
  // what actually tears the worker down once extraction is finished.
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  let title = file.name.replace(/\.pdf$/i, '');
  try {
    const meta = await pdf.getMetadata();
    const info = meta.info as { Title?: string } | undefined;
    if (info?.Title?.trim()) title = info.Title.trim();
  } catch {
    // Metadata is optional; the filename is a fine fallback.
  }

  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.({
        stage: `Extracting page ${pageNumber} of ${pdf.numPages}`,
        ratio: 0.08 + (0.92 * (pageNumber - 1)) / pdf.numPages,
      });

      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(assemblePage(content.items as TextItem[]));
      page.cleanup();
    }
  } finally {
    // Runs even if a page throws, so a corrupt PDF cannot leak a live worker.
    await loadingTask.destroy();
  }

  onProgress?.({ stage: 'Done', ratio: 1 });

  const text = normalizePlainText(pages.filter(Boolean).join('\n\n'));

  if (!text.trim()) {
    throw new Error(
      'No selectable text found. This PDF is probably a scan — it would need OCR first.',
    );
  }

  return { title, text };
}

/**
 * Rebuild lines and paragraphs from positioned text items.
 *
 * `transform[5]` is the item's baseline Y. A change in Y ends a line; a gap
 * noticeably larger than the prevailing line height ends a paragraph.
 */
function assemblePage(items: TextItem[]): string {
  const lines: { y: number; text: string }[] = [];

  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    const last = lines[lines.length - 1];

    if (last && Math.abs(last.y - y) <= 2) {
      last.text += item.str;
    } else {
      lines.push({ y, text: item.str });
    }
  }

  if (lines.length === 0) return '';

  const gaps = lines
    .slice(1)
    .map((line, i) => Math.abs(lines[i].y - line.y))
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 0;

  let out = lines[0].text.trim();

  for (let i = 1; i < lines.length; i++) {
    const gap = Math.abs(lines[i - 1].y - lines[i].y);
    const text = lines[i].text.trim();
    if (!text) continue;

    const paragraphBreak = medianGap > 0 && gap > medianGap * 1.5;
    out += paragraphBreak ? `\n\n${text}` : `\n${text}`;
  }

  // De-hyphenate words split across lines before paragraphs are normalised.
  return out.replace(/(\p{L})-\n(\p{L})/gu, '$1$2');
}
