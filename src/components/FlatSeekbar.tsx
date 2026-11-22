import React, { useCallback, useMemo, useRef, useState } from 'react';
import { usePlaybackPositionMs } from '../hooks/playbackClock';
import { formatDuration } from '../types';

export type FlatSeekbarVariant =
  | 'spotify'
  | 'ytmusic'
  | 'apple-lcd'
  | 'tidal'
  | 'soundcloud'
  | 'nothing';

export function buildWaveHeights(seedKey: string, count = 48): number[] {
  const safe = seedKey || 'claudewaves';
  let h = 2166136261;
  for (let i = 0; i < safe.length; i++) {
    h ^= safe.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= Math.imul(i + 1, 2654435761);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    const n = ((h >>> 0) % 100) / 100;
    const env = 0.55 + 0.45 * Math.sin((i / Math.max(1, count - 1)) * Math.PI);
    bars.push(Math.round(22 + n * 78 * env));
  }
  return bars;
}

interface FlatSeekbarProps {
  variant: FlatSeekbarVariant;
  durationMs: number;
  seedKey?: string;
  disabled?: boolean;
  className?: string;
  onSeekTo: (ms: number) => void;
}

export const FlatSeekbar: React.FC<FlatSeekbarProps> = React.memo(({
  variant,
  durationMs,
  seedKey = '',
  disabled = false,
  className = '',
  onSeekTo,
}) => {
  const positionMs = usePlaybackPositionMs();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragMs, setDragMs] = useState(0);

  const safeDur = Math.max(0, durationMs);
  const effectiveMs = dragging ? dragMs : positionMs;
  const pct =
    safeDur > 0 ? Math.max(0, Math.min(100, (effectiveMs / safeDur) * 100)) : 0;

  const waveBars = useMemo(
    () => (variant === 'soundcloud' ? buildWaveHeights(seedKey, 48) : []),
    [variant, seedKey],
  );

  const clientXToMs = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || safeDur <= 0) return 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * safeDur);
    },
    [safeDur]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || safeDur <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ms = clientXToMs(e.clientX);
    setDragging(true);
    setDragMs(ms);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragMs(clientXToMs(e.clientX));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const ms = clientXToMs(e.clientX);
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if not captured
    }
    onSeekTo(ms);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || safeDur <= 0) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSeekTo(Math.max(0, effectiveMs - 5000));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSeekTo(Math.min(safeDur, effectiveMs + 5000));
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Seek position"
      aria-valuemin={0}
      aria-valuemax={safeDur}
      aria-valuenow={Math.round(effectiveMs)}
      className={`cw-flat-seek cw-flat-seek--${variant}${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={handleKeyDown}
    >
      {variant === 'soundcloud' ? (
        <div className="cw-sc-wave-bars">
          {waveBars.map((h, i) => {
            const barPct = ((i + 0.5) / waveBars.length) * 100;
            return (
              <span
                key={i}
                className="cw-sc-wave-bar"
                data-played={barPct <= pct}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
      ) : (
        <div className="cw-flat-seek-rail">
          <div className="cw-flat-seek-fill" style={{ width: `${pct}%` }} />
          <div className="cw-flat-seek-thumb" style={{ left: `${pct}%` }} />
        </div>
      )}
    </div>
  );
});

interface PlaybackTimeCounterProps {
  durationMs: number;
  mode: 'elapsed' | 'remaining' | 'slash';
  className?: string;
}

export const PlaybackTimeCounter: React.FC<PlaybackTimeCounterProps> = React.memo(({
  durationMs,
  mode,
  className = '',
}) => {
  const positionMs = usePlaybackPositionMs();
  const safeDur = Math.max(0, durationMs);
  const clampedPos = safeDur > 0 ? Math.min(safeDur, Math.max(0, positionMs)) : Math.max(0, positionMs);

  let text: string;
  if (mode === 'slash') {
    text = `${formatDuration(clampedPos)} / ${formatDuration(safeDur)}`;
  } else if (mode === 'remaining') {
    const rem = Math.max(0, safeDur - clampedPos);
    text = safeDur > 0 ? `-${formatDuration(rem)}` : '-0:00';
  } else {
    text = formatDuration(clampedPos);
  }

  return <span className={className || undefined}>{text}</span>;
});
