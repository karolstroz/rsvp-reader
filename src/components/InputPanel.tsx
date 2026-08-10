'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { useReaderStore } from '@/store/useReaderStore';
import { ACCEPT_ATTRIBUTE, ACCEPTED_EXTENSIONS, parseFile } from '@/lib/parsers';
import { normalizePlainText } from '@/lib/parsers/txt';
import type { ParseProgress } from '@/types';

type Tab = 'paste' | 'url' | 'file';

const TABS: { id: Tab; label: string }[] = [
  { id: 'paste', label: 'Paste text' },
  { id: 'url', label: 'From URL' },
  { id: 'file', label: 'Upload file' },
];

/** The three ways content gets into the reader. */
export function InputPanel() {
  const loadText = useReaderStore((state) => state.loadText);

  const [tab, setTab] = useState<Tab>('paste');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);

  const start = useCallback(() => {
    setError(null);
    setBusy(true);
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setBusy(false);
    setProgress(null);
  }, []);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div role="tablist" aria-label="Content source" className="mb-4 flex gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={tab === entry.id}
            onClick={() => {
              setTab(entry.id);
              setError(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              tab === entry.id
                ? 'bg-raised font-medium text-ink'
                : 'text-muted hover:bg-raised hover:text-ink'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'paste' && (
        <PasteTab
          busy={busy}
          onSubmit={async (text) => {
            start();
            try {
              await loadText({
                title: deriveTitle(text),
                text: normalizePlainText(text),
                source: 'paste',
              });
            } catch {
              fail('Could not open that text.');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {tab === 'url' && (
        <UrlTab
          busy={busy}
          onSubmit={async (url) => {
            start();
            setProgress({ stage: 'Fetching and extracting the article', ratio: null });

            try {
              const response = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
              });

              const payload = (await response.json()) as {
                title?: string;
                byline?: string;
                text?: string;
                url?: string;
                error?: string;
              };

              if (!response.ok || !payload.text) {
                fail(payload.error ?? 'Could not extract that page.');
                return;
              }

              await loadText({
                title: payload.title ?? url,
                byline: payload.byline,
                text: payload.text,
                url: payload.url ?? url,
                source: 'url',
              });
            } catch {
              fail('Network error while fetching that URL.');
            } finally {
              setBusy(false);
              setProgress(null);
            }
          }}
        />
      )}

      {tab === 'file' && (
        <FileTab
          busy={busy}
          progress={progress}
          onFile={async (file) => {
            start();
            setProgress({ stage: 'Starting', ratio: 0 });

            try {
              const parsed = await parseFile(file, setProgress);
              await loadText({
                title: parsed.title,
                byline: parsed.byline,
                text: parsed.text,
                source: parsed.kind,
              });
            } catch (caught) {
              fail(caught instanceof Error ? caught.message : 'Could not read that file.');
            } finally {
              setBusy(false);
              setProgress(null);
            }
          }}
        />
      )}

      {progress && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{progress.stage}</span>
            {progress.ratio !== null && <span>{Math.round(progress.ratio * 100)}%</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className={`h-full bg-accent transition-[width] duration-200 ${
                progress.ratio === null ? 'w-1/3 animate-pulse' : ''
              }`}
              style={progress.ratio !== null ? { width: `${progress.ratio * 100}%` } : undefined}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}
    </section>
  );
}

/** First sentence (or first eight words) makes a serviceable title. */
function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.trim() ?? '';
  if (firstLine && firstLine.length <= 80) return firstLine;

  const words = text.trim().split(/\s+/).slice(0, 8).join(' ');
  return words ? `${words}…` : 'Pasted text';
}

function PasteTab({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  const id = useId();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) onSubmit(text);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Text to read
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste or type anything you want to read…"
        rows={8}
        className="w-full resize-y rounded-xl border border-line bg-bg p-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted tabular-nums">{words.toLocaleString()} words</span>
        <button
          type="submit"
          disabled={busy || words === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Loading…' : 'Start reading'}
        </button>
      </div>
    </form>
  );
}

function UrlTab({ busy, onSubmit }: { busy: boolean; onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const id = useId();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (url.trim()) onSubmit(url.trim());
      }}
    >
      <label htmlFor={id} className="mb-2 block text-sm text-muted">
        Paste an article link. The page is fetched and stripped down to its body text.
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/article"
          className="flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Extracting…' : 'Extract'}
        </button>
      </div>
    </form>
  );
}

function FileTab({
  busy,
  progress,
  onFile,
}: {
  busy: boolean;
  progress: ParseProgress | null;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-accent bg-accent/5' : 'border-line'
        }`}
      >
        <p className="text-sm text-ink">Drop a file here</p>
        <p className="mt-1 text-xs text-muted">
          {ACCEPTED_EXTENSIONS.join(', ')} — parsed in your browser, never uploaded
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-4 rounded-lg border border-line px-4 py-2 text-sm text-ink hover:border-accent-soft disabled:opacity-40"
        >
          {busy && progress ? progress.stage : 'Choose a file'}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            // Reset so the same file can be picked twice in a row.
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
