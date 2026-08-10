'use client';

/**
 * The RSVP playback loop.
 *
 * Timing runs on `requestAnimationFrame` rather than `setInterval`. At 600 WPM
 * a frame lasts 100 ms, and `setInterval` drifts by whole frames under load —
 * the reader perceives that as a stutter. Here each frame stores an absolute
 * deadline, so a late tick simply advances on the next repaint and the schedule
 * self-corrects instead of accumulating error.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chunkIndexForToken,
  chunkTokens,
  tokenize,
  type Chunk,
  type Token,
} from '@/lib/tokenizer';
import { chunkDuration, remainingTime } from '@/lib/pacing';

export interface RsvpPlayerOptions {
  text: string;
  wpm: number;
  chunkSize: number;
  smartPacing: boolean;
  /** Token index to resume from on mount / when the text changes. */
  initialToken?: number;
  /** Fired (throttled to frame changes) so progress can be persisted. */
  onProgress?: (tokenIndex: number) => void;
  onFinish?: () => void;
}

export interface RsvpPlayer {
  tokens: Token[];
  chunks: Chunk[];
  chunkIndex: number;
  currentChunk: Chunk | undefined;
  isPlaying: boolean;
  isFinished: boolean;
  /** 0–1 across the document. */
  progress: number;
  /** Token index of the current frame. */
  tokenIndex: number;
  /** Estimated milliseconds left at the current speed. */
  remainingMs: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  /** Move by `delta` words (negative skips back). */
  skipWords: (delta: number) => void;
  /** Jump to an absolute token index. */
  seekToToken: (tokenIndex: number) => void;
  /** Jump to the start of the current (or previous) sentence. */
  seekToSentenceStart: () => void;
}

export function useRsvpPlayer(options: RsvpPlayerOptions): RsvpPlayer {
  const { text, wpm, chunkSize, smartPacing, initialToken = 0, onProgress, onFinish } = options;

  const tokens = useMemo(() => tokenize(text), [text]);
  const chunks = useMemo(() => chunkTokens(tokens, chunkSize), [tokens, chunkSize]);

  const [chunkIndex, setChunkIndex] = useState(() =>
    chunkIndexForToken(chunkTokens(tokenize(text), chunkSize), initialToken),
  );
  const [isPlaying, setIsPlaying] = useState(false);

  const frameRef = useRef<number | null>(null);
  const deadlineRef = useRef<number>(0);
  const chunkIndexRef = useRef(chunkIndex);
  const chunksRef = useRef(chunks);

  // Pacing inputs are read inside the rAF callback; keeping them in a ref means
  // changing the speed mid-playback takes effect on the next frame without
  // tearing down and restarting the loop.
  const pacingRef = useRef({ wpm, smartPacing });
  pacingRef.current = { wpm, smartPacing };

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  chunkIndexRef.current = chunkIndex;
  chunksRef.current = chunks;

  const isFinished =
    chunks.length > 0 && chunkIndexRef.current >= chunks.length - 1 && !isPlaying;

  // Re-anchor when the document or the chunk width changes: the token index is
  // the stable coordinate across both, chunk indices are not.
  //
  // The two cases differ. A new *document* resumes from its own saved position;
  // a new *chunk width* keeps the reader exactly where they are.
  const lastTokenRef = useRef(initialToken);
  const textRef = useRef(text);
  const chunkSizeRef = useRef(chunkSize);

  if (textRef.current !== text || chunkSizeRef.current !== chunkSize) {
    const documentChanged = textRef.current !== text;
    textRef.current = text;
    chunkSizeRef.current = chunkSize;

    const anchor = documentChanged ? initialToken : lastTokenRef.current;
    lastTokenRef.current = anchor;

    const target = chunkIndexForToken(chunks, anchor);
    if (target !== chunkIndexRef.current) {
      chunkIndexRef.current = target;
      // Adjusting state during render in response to a changed prop is the
      // documented React pattern; it re-renders before painting.
      setChunkIndex(target);
    }
  }

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    stopLoop();
    setIsPlaying(false);
  }, [stopLoop]);

  const play = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    // Starting from the very end restarts rather than doing nothing.
    if (chunkIndexRef.current >= chunksRef.current.length - 1) {
      chunkIndexRef.current = 0;
      setChunkIndex(0);
    }
    deadlineRef.current = 0; // recomputed on the first tick
    setIsPlaying(true);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  useEffect(() => {
    if (!isPlaying) return;

    const tick = (now: number) => {
      const list = chunksRef.current;

      if (list.length === 0) {
        setIsPlaying(false);
        return;
      }

      if (deadlineRef.current === 0) {
        deadlineRef.current = now + chunkDuration(list[chunkIndexRef.current], pacingRef.current);
      }

      if (now >= deadlineRef.current) {
        const next = chunkIndexRef.current + 1;

        if (next >= list.length) {
          setIsPlaying(false);
          frameRef.current = null;
          onFinishRef.current?.();
          return;
        }

        chunkIndexRef.current = next;
        setChunkIndex(next);
        onProgressRef.current?.(list[next].startIndex);

        const duration = chunkDuration(list[next], pacingRef.current);
        // Advance from the deadline, not from `now`, so rounding does not
        // accumulate. If we fell more than one frame behind (tab was hidden),
        // resynchronise to the present instead of racing to catch up.
        const drift = now - deadlineRef.current;
        deadlineRef.current = (drift > duration ? now : deadlineRef.current) + duration;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isPlaying]);

  // Pause when the tab goes away — otherwise the reader loses their place while
  // rAF is throttled in the background.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pause]);

  const goToChunk = useCallback((target: number) => {
    const list = chunksRef.current;
    if (list.length === 0) return;

    const clamped = Math.max(0, Math.min(list.length - 1, target));
    chunkIndexRef.current = clamped;
    setChunkIndex(clamped);
    deadlineRef.current = 0; // give the new frame its full duration
    lastTokenRef.current = list[clamped].startIndex;
    onProgressRef.current?.(list[clamped].startIndex);
  }, []);

  const seekToToken = useCallback(
    (tokenIndex: number) => {
      goToChunk(chunkIndexForToken(chunksRef.current, tokenIndex));
    },
    [goToChunk],
  );

  const skipWords = useCallback(
    (delta: number) => {
      const list = chunksRef.current;
      if (list.length === 0) return;
      const current = list[chunkIndexRef.current]?.startIndex ?? 0;
      seekToToken(current + delta);
    },
    [seekToToken],
  );

  const seekToSentenceStart = useCallback(() => {
    const list = chunksRef.current;
    if (list.length === 0) return;

    const current = list[chunkIndexRef.current]?.startIndex ?? 0;
    // Walk back to the token after the previous sentence-ending punctuation.
    let i = current - 1;
    while (i > 0 && tokens[i - 1] && tokens[i - 1].pause !== 'major' && tokens[i - 1].pause !== 'paragraph') {
      i--;
    }
    seekToToken(Math.max(0, i));
  }, [seekToToken, tokens]);

  const restart = useCallback(() => {
    goToChunk(0);
  }, [goToChunk]);

  // `chunkIndexRef` is authoritative within this render: the re-anchor block
  // above may have moved it ahead of the `chunkIndex` state value.
  const effectiveIndex = Math.min(chunkIndexRef.current, Math.max(0, chunks.length - 1));
  const currentChunk = chunks[effectiveIndex];
  const tokenIndex = currentChunk?.startIndex ?? 0;
  lastTokenRef.current = tokenIndex;

  const progress = tokens.length > 0 ? Math.min(1, tokenIndex / tokens.length) : 0;

  const remainingMs = useMemo(
    () => remainingTime(chunks, effectiveIndex, { wpm, smartPacing }),
    [chunks, effectiveIndex, wpm, smartPacing],
  );

  return {
    tokens,
    chunks,
    chunkIndex: effectiveIndex,
    currentChunk,
    isPlaying,
    isFinished,
    progress,
    tokenIndex,
    remainingMs,
    play,
    pause,
    toggle,
    restart,
    skipWords,
    seekToToken,
    seekToSentenceStart,
  };
}
