import type { ParsedContent, ParseProgressHandler, SourceKind } from '@/types';
import { parseTxt } from './txt';
import { parseEpub } from './epub';
import { parsePdf } from './pdf';

export { parseTxt, parseEpub, parsePdf };
export { normalizePlainText } from './txt';

export const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.epub', '.pdf'] as const;
export const ACCEPT_ATTRIBUTE = '.txt,.md,.epub,.pdf,text/plain,application/epub+zip,application/pdf';

/** Which parser a file needs, based on extension first and MIME type second. */
export function detectKind(file: File): SourceKind | null {
  const name = file.name.toLowerCase();

  if (name.endsWith('.epub')) return 'epub';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.txt') || name.endsWith('.md')) return 'txt';

  if (file.type === 'application/epub+zip') return 'epub';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('text/')) return 'txt';

  return null;
}

/** Parse any supported file, reporting progress as it goes. */
export async function parseFile(
  file: File,
  onProgress?: ParseProgressHandler,
): Promise<ParsedContent & { kind: SourceKind }> {
  const kind = detectKind(file);

  if (!kind) {
    throw new Error(
      `Unsupported file type: ${file.name}. Supported formats are ${ACCEPTED_EXTENSIONS.join(', ')}.`,
    );
  }

  const parsed =
    kind === 'epub'
      ? await parseEpub(file, onProgress)
      : kind === 'pdf'
        ? await parsePdf(file, onProgress)
        : await parseTxt(file, onProgress);

  return { ...parsed, kind };
}
