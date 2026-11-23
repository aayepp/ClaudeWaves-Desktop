import React from 'react';
import { formatDuration } from '../types';

interface AbLoopButtonProps {
  abLoop?: { aMs: number | null; bMs: number | null };
  hasTrack: boolean;
  tipPos?: 'top' | 'bottom';
  onClick?: () => void;
}

export const AbLoopButton: React.FC<AbLoopButtonProps> = ({
  abLoop,
  hasTrack,
  tipPos = 'top',
  onClick,
}) => {
  if (!onClick) return null;
  const aMs = abLoop?.aMs ?? null;
  const bMs = abLoop?.bMs ?? null;
  const state = aMs !== null && bMs !== null ? 'active' : aMs !== null ? 'armed' : 'off';

  const label =
    state === 'active'
      ? 'A↔B'
      : state === 'armed'
        ? `A ${formatDuration(aMs!)}`
        : 'A-B';

  const tip =
    state === 'active'
      ? `Looping ${formatDuration(aMs!)} ↔ ${formatDuration(bMs!)} — click to clear`
      : state === 'armed'
        ? `Point A set (${formatDuration(aMs!)}) — click again to set B`
        : 'A-B Loop: Click to set point A';

  return (
    <span className="cw-tip-anchor" data-tip={tip} data-tip-pos={tipPos === 'bottom' ? 'bottom' : undefined}>
      <button
        type="button"
        className="cw-ab-dock-btn"
        data-state={state}
        disabled={!hasTrack}
        aria-label={tip}
        onClick={onClick}
      >
        {label}
      </button>
    </span>
  );
};
