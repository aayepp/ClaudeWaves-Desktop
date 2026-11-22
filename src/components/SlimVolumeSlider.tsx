import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface SlimVolumeSliderProps {
  volume: number;
  onChange: (volume: number) => void;
  sliderWidth?: number | string;
  iconSize?: number;
  showTooltip?: boolean;
  className?: string;
}

function clampVolume(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export const SlimVolumeSlider: React.FC<SlimVolumeSliderProps> = ({
  volume,
  onChange,
  sliderWidth = 72,
  iconSize = 13,
  showTooltip = true,
  className = '',
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastNonZeroRef = useRef(volume > 0 ? clampVolume(volume) : 80);
  const latestVolumeRef = useRef(clampVolume(volume));
  const [dragging, setDragging] = useState(false);

  const pct = clampVolume(volume);
  latestVolumeRef.current = pct;
  if (pct > 0) {
    lastNonZeroRef.current = pct;
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 5 : -5;
      onChange(clampVolume(latestVolumeRef.current + delta));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onChange]);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (clientX - rect.left) / rect.width;
      onChange(clampVolume(ratio * 100));
    },
    [onChange],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(clampVolume(pct + 5));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(clampVolume(pct - 5));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(100);
    }
  };

  return (
    <div ref={wrapRef} className={`cw-vol-wrap ${className}`.trim()}>
      <button
        type="button"
        className={`cw-vol-icon-btn${showTooltip ? ' cw-tip-anchor' : ''}`}
        {...(showTooltip ? { 'data-tip': pct === 0 ? 'Unmute Audio' : `Mute Audio (${pct}%)` } : {})}
        aria-label={pct === 0 ? 'Unmute' : 'Mute'}
        onClick={() => onChange(pct === 0 ? lastNonZeroRef.current : 0)}
      >
        {pct === 0 ? (
          <VolumeX size={iconSize} className="cw-ic-volume" />
        ) : (
          <Volume2 size={iconSize} className="cw-ic-volume" />
        )}
      </button>
      <div
        ref={trackRef}
        className="cw-slim-vol"
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        data-dragging={dragging}
        style={{ width: sliderWidth }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="cw-slim-vol-rail">
          <div className="cw-slim-vol-fill" style={{ width: `${pct}%` }} />
          <div className="cw-slim-vol-thumb" style={{ left: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
};
