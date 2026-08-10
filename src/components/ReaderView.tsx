'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReaderStore, WPM_STEP } from '@/store/useReaderStore';
import { useRsvpPlayer } from '@/hooks/useRsvpPlayer';
import { useSwipe } from '@/hooks/useSwipe';
import { WordDisplay } from './WordDisplay';
import { Scrubber } from './Scrubber';
import { SettingsPanel } from './SettingsPanel';
import { BionicText } from './BionicText';
import {
  CloseIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  SettingsIcon,
  SkipBackIcon,
  SkipForwardIcon,
  TextIcon,
} from './icons';

const SKIP_WORDS = 10;

/**
 * The reading surface.
 *
 * Zen mode is the default: while playback runs, the chrome fades out and only
 * the word remains. Any input — pointer move, tap, key — brings it back for a
 * few seconds.
 */
export function ReaderView() {
  const document = useReaderStore((state) => state.document);
  const settings = useReaderStore((state) => state.settings);
  const setProgress = useReaderStore((state) => state.setProgress);
  const closeDocument = useReaderStore((state) => state.closeDocument);
  const adjustWpm = useReaderStore((state) => state.adjustWpm);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useRsvpPlayer({
    text: document?.text ?? '',
    wpm: settings.wpm,
    chunkSize: settings.chunkSize,
    smartPacing: settings.smartPacing,
    initialToken: document?.progress ?? 0,
    onProgress: setProgress,
  });

  const { isPlaying, toggle, pause, play, skipWords, restart, seekToToken, seekToSentenceStart } =
    player;

  /** Reveal the chrome, and schedule it to fade again while playing. */
  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), 2500);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setChromeVisible(true);
      return;
    }
    wakeChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isPlaying, wakeChrome]);

  // Keyboard shortcuts. Bound on window so they work without focusing a
  // control, but suppressed while typing or while the settings sheet is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (typing && event.key !== 'Escape') return;
      if (settingsOpen && event.key !== 'Escape') return;

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          toggle();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          skipWords(-SKIP_WORDS);
          break;
        case 'ArrowRight':
          event.preventDefault();
          skipWords(SKIP_WORDS);
          break;
        case 'ArrowUp':
          event.preventDefault();
          adjustWpm(WPM_STEP);
          break;
        case 'ArrowDown':
          event.preventDefault();
          adjustWpm(-WPM_STEP);
          break;
        case 'r':
          restart();
          break;
        case 's':
          seekToSentenceStart();
          break;
        case 't':
          setShowFullText((visible) => !visible);
          break;
        case 'Escape':
          if (settingsOpen) return; // the panel handles its own Escape
          pause();
          closeDocument();
          break;
        default:
          return;
      }

      wakeChrome();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    toggle,
    skipWords,
    restart,
    seekToSentenceStart,
    pause,
    closeDocument,
    adjustWpm,
    settingsOpen,
    wakeChrome,
  ]);

  const swipe = useSwipe({
    onTap: () => {
      toggle();
      wakeChrome();
    },
    onSwipeLeft: () => {
      skipWords(SKIP_WORDS);
      wakeChrome();
    },
    onSwipeRight: () => {
      skipWords(-SKIP_WORDS);
      wakeChrome();
    },
    onSwipeUp: () => {
      adjustWpm(WPM_STEP);
      wakeChrome();
    },
    onSwipeDown: () => {
      adjustWpm(-WPM_STEP);
      wakeChrome();
    },
  });

  if (!document) return null;

  const chrome = chromeVisible || !isPlaying;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg" onMouseMove={wakeChrome}>
      {/* Header */}
      <header
        className={`flex items-center gap-2 border-b border-line px-3 py-2 transition-opacity duration-300 ${
          chrome ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            pause();
            closeDocument();
          }}
          className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink"
          aria-label="Back to library"
        >
          <CloseIcon />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium text-ink">{document.title}</h1>
          {document.byline && (
            <p className="truncate text-xs text-muted">{document.byline}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFullText((visible) => !visible)}
          aria-pressed={showFullText}
          className={`rounded-lg p-2 hover:bg-raised ${showFullText ? 'text-accent' : 'text-muted hover:text-ink'}`}
          aria-label="Toggle full text view"
          title="Full text (T)"
        >
          <TextIcon />
        </button>

        <button
          type="button"
          onClick={() => {
            pause();
            setSettingsOpen(true);
          }}
          className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink"
          aria-label="Open settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </header>

      {/* RSVP surface */}
      <main
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4"
        {...swipe}
      >
        <button
          type="button"
          onClick={toggle}
          className="absolute inset-0 cursor-default"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        />

        <div className="pointer-events-none relative w-full max-w-3xl">
          <WordDisplay
            chunk={player.currentChunk}
            fontSize={settings.fontSize}
            fontFamily={settings.fontFamily}
            showGuides={settings.showGuides}
          />
        </div>

        {player.isFinished && (
          <p className="pointer-events-none absolute bottom-6 text-sm text-muted">
            Finished — press <span className="font-mono text-ink">R</span> to read again.
          </p>
        )}
      </main>

      {/* Controls */}
      <footer
        className={`border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-300 ${
          chrome ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="mx-auto max-w-3xl">
          <Scrubber
            tokenIndex={player.tokenIndex}
            totalTokens={player.tokens.length}
            remainingMs={player.remainingMs}
            onSeek={seekToToken}
          />

          <div className="mt-3 flex items-center justify-center gap-2">
            <ControlButton onClick={restart} label="Restart">
              <RestartIcon />
            </ControlButton>

            <ControlButton onClick={() => skipWords(-SKIP_WORDS)} label="Back 10 words">
              <SkipBackIcon />
            </ControlButton>

            <button
              type="button"
              onClick={isPlaying ? pause : play}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform active:scale-95"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <PauseIcon className="h-7 w-7" /> : <PlayIcon className="h-7 w-7" />}
            </button>

            <ControlButton onClick={() => skipWords(SKIP_WORDS)} label="Forward 10 words">
              <SkipForwardIcon />
            </ControlButton>

            <ControlButton onClick={() => adjustWpm(-WPM_STEP)} label="Slower">
              <span className="text-lg font-semibold">−</span>
            </ControlButton>

            <span className="w-20 text-center text-sm tabular-nums text-muted">
              {settings.wpm} WPM
            </span>

            <ControlButton onClick={() => adjustWpm(WPM_STEP)} label="Faster">
              <span className="text-lg font-semibold">+</span>
            </ControlButton>
          </div>
        </div>
      </footer>

      {showFullText && (
        <div className="absolute inset-0 top-[3.25rem] z-30 overflow-y-auto bg-bg px-4 py-6">
          <BionicText
            text={document.text}
            bionic={settings.bionic}
            fontFamily={settings.fontFamily}
            activeToken={player.tokenIndex}
          />
        </div>
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-accent-soft hover:text-ink active:scale-95"
    >
      {children}
    </button>
  );
}
