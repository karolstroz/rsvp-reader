/**
 * EPUB extraction.
 *
 * An EPUB is a ZIP containing XHTML documents plus an OPF manifest that lists
 * them in spine (reading) order. We unzip with JSZip and walk the spine with
 * the browser's own `DOMParser`, which is both faster and far lighter than
 * pulling in a full rendering engine — we only ever need the text, never a
 * paginated view.
 */

import JSZip from 'jszip';
import type { ParsedContent, ParseProgressHandler } from '@/types';

const CONTAINER_PATH = 'META-INF/container.xml';

/** Elements whose text is never part of the prose. */
const STRIPPED = 'script, style, svg, head, nav, aside, figure figcaption, table';

function resolveRelative(base: string, relative: string): string {
  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const url = new URL(relative, `epub:///${baseDir}`);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

function textFromXhtml(xhtml: string): string {
  const doc = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');

  // A malformed chapter yields a <parsererror>; retry as lenient HTML.
  const root = doc.querySelector('parsererror')
    ? new DOMParser().parseFromString(xhtml, 'text/html')
    : doc;

  root.querySelectorAll(STRIPPED).forEach((node) => node.remove());

  const blocks = root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
  const source = blocks.length > 0 ? Array.from(blocks) : [root.body ?? root.documentElement];

  return source
    .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export async function parseEpub(
  file: File,
  onProgress?: ParseProgressHandler,
): Promise<ParsedContent> {
  onProgress?.({ stage: 'Unpacking EPUB', ratio: 0.05 });

  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const containerXml = await zip.file(CONTAINER_PATH)?.async('text');
  if (!containerXml) throw new Error('Not a valid EPUB: META-INF/container.xml is missing.');

  const container = new DOMParser().parseFromString(containerXml, 'application/xml');
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('Not a valid EPUB: no package document declared.');

  const opfXml = await zip.file(opfPath)?.async('text');
  if (!opfXml) throw new Error(`Not a valid EPUB: package document ${opfPath} is missing.`);

  onProgress?.({ stage: 'Reading manifest', ratio: 0.15 });

  const opf = new DOMParser().parseFromString(opfXml, 'application/xml');

  const title =
    opf.querySelector('metadata > title, metadata title')?.textContent?.trim() ||
    file.name.replace(/\.epub$/i, '');
  const byline =
    opf.querySelector('metadata > creator, metadata creator')?.textContent?.trim() || undefined;

  const hrefById = new Map<string, string>();
  opf.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) hrefById.set(id, resolveRelative(opfPath, href));
  });

  const spine = Array.from(opf.querySelectorAll('spine > itemref'))
    .map((ref) => ref.getAttribute('idref'))
    .filter((id): id is string => Boolean(id))
    .map((id) => hrefById.get(id))
    .filter((href): href is string => Boolean(href));

  if (spine.length === 0) throw new Error('Not a valid EPUB: the spine is empty.');

  const chapters: string[] = [];

  for (let i = 0; i < spine.length; i++) {
    onProgress?.({
      stage: `Extracting chapter ${i + 1} of ${spine.length}`,
      ratio: 0.15 + (0.85 * i) / spine.length,
    });

    const entry = zip.file(spine[i]);
    if (!entry) continue;

    const chapter = textFromXhtml(await entry.async('text'));
    if (chapter.trim()) chapters.push(chapter);
  }

  onProgress?.({ stage: 'Done', ratio: 1 });

  const text = chapters.join('\n\n');
  if (!text.trim()) throw new Error('No readable text found in this EPUB.');

  return { title, byline, text };
}
