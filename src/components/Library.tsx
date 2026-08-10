'use client';

import { useReaderStore } from '@/store/useReaderStore';
import { formatDuration } from '@/lib/pacing';
import { TrashIcon } from './icons';
import type { SourceKind } from '@/types';

const SOURCE_LABEL: Record<SourceKind, string> = {
  paste: 'Pasted',
  url: 'Article',
  txt: 'Text file',
  epub: 'EPUB',
  pdf: 'PDF',
};

/** Recently read documents with their saved position. */
export function Library() {
  const library = useReaderStore((state) => state.library);
  const openDocument = useReaderStore((state) => state.openDocument);
  const removeDocument = useReaderStore((state) => state.removeDocument);
  const wpm = useReaderStore((state) => state.settings.wpm);

  if (library.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
        Nothing here yet. Anything you read is saved on this device, along with where you stopped.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {library.map((entry) => {
        const percent =
          entry.wordCount > 0 ? Math.min(100, Math.round((entry.progress / entry.wordCount) * 100)) : 0;
        const remaining = Math.max(0, entry.wordCount - entry.progress);

        return (
          <li key={entry.id}>
            <div className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-accent-soft">
              <button
                type="button"
                onClick={() => void openDocument(entry.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-ink">{entry.title}</p>

                <p className="mt-0.5 truncate text-xs text-muted">
                  {SOURCE_LABEL[entry.source]}
                  {entry.byline ? ` · ${entry.byline}` : ''} · {entry.wordCount.toLocaleString()}{' '}
                  words · {formatDuration((remaining / Math.max(1, wpm)) * 60_000)} left
                </p>

                <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised">
                  <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
                </div>
              </button>

              <button
                type="button"
                onClick={() => void removeDocument(entry.id)}
                aria-label={`Remove ${entry.title}`}
                className="rounded-lg p-2 text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-accent"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
