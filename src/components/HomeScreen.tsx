'use client';

import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/useReaderStore';
import { InputPanel } from './InputPanel';
import { Library } from './Library';
import { ReaderView } from './ReaderView';
import { SettingsPanel } from './SettingsPanel';
import { SettingsIcon } from './icons';

/**
 * App shell: library + import on the home screen, full-screen reader on top.
 *
 * The theme lives in localStorage-backed state, so it is applied to <html> here
 * rather than through a Tailwind class — the inline bootstrap in the layout has
 * already set the same attribute before first paint.
 */
export function HomeScreen() {
  const isReaderOpen = useReaderStore((state) => state.isReaderOpen);
  const hasDocument = useReaderStore((state) => state.document !== null);
  const theme = useReaderStore((state) => state.settings.theme);
  const refreshLibrary = useReaderStore((state) => state.refreshLibrary);

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  if (isReaderOpen && hasDocument) return <ReaderView />;

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Blitzbee
            </h1>
            <p className="mt-1 text-sm text-muted">
              One word at a time, anchored on its optimal recognition point.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-line p-2 text-muted hover:border-accent-soft hover:text-ink"
            aria-label="Open settings"
          >
            <SettingsIcon />
          </button>
        </header>

        <InputPanel />

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">
            Recently read
          </h2>
          <Library />
        </section>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
