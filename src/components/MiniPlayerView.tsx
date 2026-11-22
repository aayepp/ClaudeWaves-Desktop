import React, { useRef } from 'react';
import { GlassButton } from '@zakisheriff/liquid-glass';
import {
  Heart,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { usePlaybackPositionMs } from '../hooks/playbackClock';
import type { PlayerState } from '../hooks/usePlayer';
import { AudioVisualizer } from './AudioVisualizer';

const MiniProgressStrip: React.FC<{ totalDurationMs: number }> = ({ totalDurationMs }) => {
  const positionMs = usePlaybackPositionMs();
  const maxMs = Math.max(1000, totalDurationMs || 1000);
  const pct = Math.max(0, Math.min(100, (positionMs / maxMs) * 100));
  return (
    <div className="cw-mini-progress-track" aria-hidden="true">
      <div className="cw-mini-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
};

interface MiniPlayerViewProps {
  player: PlayerState;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  accentHex: string;
  intensity: number;
  isLiked: boolean;
  onExitMini: () => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleLike: () => void;
  onBestPart: () => void;
}

export const MiniPlayerView: React.FC<MiniPlayerViewProps> = ({
  player,
  analyserRef,
  accentHex,
  intensity,
  isLiked,
  onExitMini,
  onTogglePlayPause,
  onNext,
  onPrev,
  onToggleLike,
  onBestPart,
}) => {
  const track = player.currentTrack;
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="cw-mini-shell"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        swipeStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!swipeStart.current) return;
        const dx = e.clientX - swipeStart.current.x;
        swipeStart.current = null;
        if (dx < -55) onNext();
        else if (dx > 55) onPrev();
      }}
    >
      {track && (
        <div
          className="cw-mini-bg"
          style={{ backgroundImage: `url(${track.thumbnailUrl})` }}
        />
      )}
      <div className="cw-mini-scrim" />

      <div className="cw-mini-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%' }}>
          {track ? (
            <img className="cw-mini-art" src={track.thumbnailUrl} alt={track.title} />
          ) : (
            <div className="cw-mini-art" />
          )}
          <div className="cw-row-meta">
            <div className="cw-track-title cw-ellipsis" style={{ fontSize: 13.5 }}>
              {track?.title ?? 'ClaudeWaves Mini'}
            </div>
            <div className="cw-track-artist cw-ellipsis">
              {track?.artist ?? 'No song playing'}
            </div>
            <AudioVisualizer
              analyserRef={analyserRef}
              isPlaying={player.isPlaying}
              accentHex={accentHex}
              barCount={20}
              height={14}
            />
          </div>
          <GlassButton
            size="sm"
            variant="glass"
            intensity={intensity}
            aria-label="Return to Full App"
            title="Return to Full App"
            icon={<Maximize2 size={14} className="cw-ic-expand" />}
            onClick={onExitMini}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <GlassButton
            size="sm"
            variant={isLiked ? 'tinted' : 'clear'}
            tint={accentHex}
            intensity={intensity}
            aria-label="Like"
            icon={<Heart size={15} className="cw-ic-liked" fill={isLiked ? 'currentColor' : 'none'} />}
            onClick={onToggleLike}
            disabled={!track}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GlassButton
              size="sm"
              variant="clear"
              intensity={intensity}
              aria-label="Previous"
              icon={<SkipBack size={16} />}
              onClick={onPrev}
              disabled={!track}
            />
            <GlassButton
              size="sm"
              variant="filled"
              tint={accentHex}
              intensity={intensity}
              aria-label={player.isPlaying ? 'Pause' : 'Play'}
              icon={player.isPlaying ? <Pause size={16} /> : <Play size={16} />}
              onClick={onTogglePlayPause}
              disabled={!track}
            />
            <GlassButton
              size="sm"
              variant="clear"
              intensity={intensity}
              aria-label="Next"
              icon={<SkipForward size={16} />}
              onClick={onNext}
              disabled={!track}
            />
          </div>
          <GlassButton
            size="sm"
            variant="tinted"
            tint={accentHex}
            intensity={intensity}
            aria-label="Jump to Best Part"
            icon={<Sparkles size={14} className="cw-ic-sparkle" />}
            onClick={onBestPart}
            disabled={!track}
          />
        </div>
      </div>

      <MiniProgressStrip totalDurationMs={player.durationMs || track?.durationMs || 0} />
    </div>
  );
};
