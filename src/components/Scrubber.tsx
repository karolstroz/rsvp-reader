'use client';

import { formatDuration } from '@/lib/pacing';

interface ScrubberProps {
  tokenIndex: number;
  totalTokens: number;
  remainingMs: number;
  onSeek: (tokenIndex: number) => void;
}

/** Progress bar with word position and estimated time remaining. */
export function Scrubber({ tokenIndex, totalTokens, remainingMs, onSeek }: ScrubberProps) {
  const max = Math.max(0, totalTokens - 1);
  const percent = totalTokens > 0 ? Math.round((tokenIndex / totalTokens) * 100) : 0;

  return (
    <div className="w-full">
      <input
        type="range"
        min={0}
        max={max}
        value={Math.min(tokenIndex, max)}
        onChange={(event) => onSeek(Number(event.target.value))}
        aria-label="Reading position"
        aria-valuetext={`Word ${tokenIndex + 1} of ${totalTokens}`}
      />

      <div className="mt-1 flex items-center justify-between text-xs text-muted tabular-nums">
        <span>
          {Math.min(tokenIndex + 1, totalTokens).toLocaleString()} /{' '}
          {totalTokens.toLocaleString()} words
        </span>
        <span>{percent}%</span>
        <span>{formatDuration(remainingMs)} left</span>
      </div>
    </div>
  );
}
