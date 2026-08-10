'use client';

import { useRef, type TouchEvent } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onTap?: () => void;
  /** Minimum travel in pixels before a gesture counts as a swipe. */
  threshold?: number;
}

/**
 * Touch gestures for the reader surface.
 *
 * Returns props to spread onto the element. A short, slow touch that stays
 * inside the threshold is reported as a tap (play/pause), which is what a thumb
 * on a phone does most of the time.
 */
export function useSwipe(options: SwipeOptions) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onTap,
    threshold = 48,
  } = options;

  const start = useRef<{ x: number; y: number; time: number } | null>(null);

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    start.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const onTouchEnd = (event: TouchEvent) => {
    const origin = start.current;
    start.current = null;
    if (!origin) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    const elapsed = Date.now() - origin.time;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      if (elapsed < 400) onTap?.();
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      // Swipe right reads *backwards*, matching how page-turn gestures work.
      if (dx > 0) onSwipeRight?.();
      else onSwipeLeft?.();
    } else if (dy > 0) {
      onSwipeDown?.();
    } else {
      onSwipeUp?.();
    }
  };

  return { onTouchStart, onTouchEnd };
}
