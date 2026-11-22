import React, { useEffect, useRef, useState } from 'react';
import {
  GlassButton,
  GlassSegmented,
} from '@zakisheriff/liquid-glass';
import {
  ChevronDown,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { PlayerState } from '../hooks/usePlayer';
import { usePlaybackPositionMs } from '../hooks/playbackClock';
import {
  formatDuration,
  type LyricsBounceStyle,
  type LyricsDisplayMode,
  type LyricsFontSize,
} from '../types';
import { CoverArtWaves } from './CoverArtWaves';
import { SlimVolumeSlider } from './SlimVolumeSlider';
import { SyncedVideoPlayer } from './SyncedVideoPlayer';
import { WavySeekbar } from './WavySeekbar';
import { WordSyncedLyrics } from './WordSyncedLyrics';

const SheetSeekRow: React.FC<{
  maxDuration: number;
  totalDurationMs: number;
  isPlaying: boolean;
  accentHex: string;
  onSeekTo: (ms: number) => void;
}> = ({ maxDuration, totalDurationMs, isPlaying, accentHex, onSeekTo }) => {
  const positionMs = usePlaybackPositionMs();
  return (
    <div className="cw-seek-row" style={{ marginBottom: 16 }}>
      <span className="cw-time-label">{formatDuration(positionMs)}</span>
      <div style={{ flex: 1 }}>
        <WavySeekbar
          value={Math.min(maxDuration, positionMs)}
          max={maxDuration}
          isPlaying={isPlaying}
          accentHex={accentHex}
          onChange={onSeekTo}
          ariaLabel="Seek track"
        />
      </div>
      <span className="cw-time-label" style={{ textAlign: 'right' }}>
        {formatDuration(totalDurationMs)}
      </span>
    </div>
  );
};

export type SheetOrigin =
  | { mode: 'dock' }
  | { mode: 'video'; originX: number; originY: number; scale: number };

interface NowPlayingSheetProps {
  open: boolean;
  tab: 'lyrics' | 'queue';
  origin?: SheetOrigin;
  player: PlayerState;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  waveColorHex: string;
  isDark: boolean;
  accentHex: string;
  intensity: number;
  volume: number;
  playbackRate: number;
  lyricsFontSize: LyricsFontSize;
  lyricsBounce: LyricsBounceStyle;
  lyricsDisplayMode: LyricsDisplayMode;
  lyricsOffsetMs: number;
  videoMode: boolean;
  videoQuality: number;
  isLiked: boolean;
  onClose: () => void;
  onTabChange: (tab: 'lyrics' | 'queue') => void;
  onVolumeChange: (v: number) => void;
  onLyricsDisplayModeChange: (mode: LyricsDisplayMode) => void;
  onLyricsOffsetChange: (ms: number) => void;
  onToggleVideoMode: () => void;
  onVideoQualityChange: (q: number) => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekTo: (ms: number) => void;
  onBestPart: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: () => void;
  onOpenArtist: (artistName: string) => void;
  onPlayQueueIndex: (index: number) => void;
  onRemoveQueueIndex: (index: number) => void;
}

export const NowPlayingSheet: React.FC<NowPlayingSheetProps> = ({
  open,
  tab,
  origin,
  player,
  analyserRef,
  waveColorHex,
  isDark,
  accentHex,
  intensity,
  volume,
  playbackRate,
  lyricsFontSize,
  lyricsBounce,
  lyricsDisplayMode,
  lyricsOffsetMs,
  videoMode,
  videoQuality,
  isLiked,
  onClose,
  onTabChange,
  onVolumeChange,
  onLyricsDisplayModeChange,
  onLyricsOffsetChange,
  onToggleVideoMode,
  onVideoQualityChange,
  onTogglePlayPause,
  onNext,
  onPrev,
  onSeekTo,
  onBestPart,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
  onOpenArtist,
  onPlayQueueIndex,
  onRemoveQueueIndex,
}) => {
  const track = player.currentTrack;
  const maxDuration = Math.max(1000, player.durationMs || track?.durationMs || 1000);
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const [sparkling, setSparkling] = useState(false);
  const gestureStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
      const t = window.setTimeout(() => {
        setRendered(false);
        setClosing(false);
      }, 250);
      return () => window.clearTimeout(t);
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!rendered || !track) return null;

  const sheetStyle =
    origin?.mode === 'video'
      ? ({
          '--cw-origin-x': `${origin.originX}px`,
          '--cw-origin-y': `${origin.originY}px`,
          '--cw-origin-scale': String(origin.scale),
        } as React.CSSProperties)
      : undefined;

  return (
    <div
      className="cw-fullplayer"
      data-closing={closing}
      data-origin={origin?.mode ?? 'dock'}
      style={sheetStyle}
      role="dialog"
      aria-label="Full-Screen Now Playing"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('input, button, .cw-fullplayer-lyrics, .cw-fullplayer-queue')) return;
        gestureStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!gestureStart.current) return;
        const dx = e.clientX - gestureStart.current.x;
        const dy = e.clientY - gestureStart.current.y;
        gestureStart.current = null;
        if (dy > 90 && Math.abs(dx) < 70) {
          onClose();
        } else if (dx < -85 && Math.abs(dy) < 60) {
          onNext();
        } else if (dx > 85 && Math.abs(dy) < 60) {
          onPrev();
        }
      }}
    >
      {/* Living full-bleed blurred album artwork backdrop */}
      <div
        className="cw-fullplayer-bg"
        style={{ backgroundImage: `url(${track.thumbnailUrl})` }}
      />
      <div className="cw-fullplayer-scrim" />

      <div className="cw-fullplayer-inner">
        <header className="cw-fullplayer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              className="cw-tip-anchor"
              data-tip={origin?.mode === 'video' ? 'Back to Video Popup (Esc)' : 'Minimize to Dock (Esc)'}
              data-tip-pos="bottom"
            >
              <GlassButton
                size="sm"
                variant="glass"
                intensity={intensity}
                aria-label="Minimize Now Playing"
                icon={<ChevronDown size={18} />}
                onClick={onClose}
              />
            </span>
            <span className="cw-muted" style={{ fontWeight: 600 }}>
              {player.streamInfo ?? 'Now Playing'}
            </span>
          </div>

          <GlassSegmented
            options={['Lyrics', `Queue (${player.queue.length})`]}
            value={tab === 'lyrics' ? 0 : 1}
            intensity={intensity}
            onChange={(i) => onTabChange(i === 0 ? 'lyrics' : 'queue')}
          />
        </header>

        <div className="cw-fullplayer-body">
          {/* Left column: Artwork or Synced Music Video + Controls + Wavy Progress Bar */}
          <div className="cw-fullplayer-left">
            {videoMode ? (
              <SyncedVideoPlayer
                videoId={track.videoId}
                title={track.title}
                artist={track.artist}
                isPlaying={player.isPlaying}
                playbackRate={playbackRate}
                quality={videoQuality}
                mode="fullscreen"
                onQualityChange={onVideoQualityChange}
                onClose={onToggleVideoMode}
              />
            ) : (
              <div className="cw-fullplayer-art-stage">
                <CoverArtWaves
                  analyserRef={analyserRef}
                  isPlaying={player.isPlaying}
                  colorHex={waveColorHex}
                  isDark={isDark}
                  variant="full"
                />
                <img
                  key={track.videoId}
                  className="cw-fullplayer-art cw-art-flip"
                  src={track.thumbnailUrl}
                  alt={track.title}
                />
              </div>
            )}

            <div className="cw-fullplayer-meta">
              <div className="cw-row-meta">
                <div className="cw-fullplayer-title cw-ellipsis">{track.title}</div>
                <button
                  type="button"
                  className="cw-artist-link cw-fullplayer-artist cw-ellipsis"
                  onClick={() => {
                    onClose();
                    onOpenArtist(track.artist);
                  }}
                >
                  {track.artist}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span
                  className="cw-tip-anchor"
                  data-tip={
                    player.bestPart
                      ? `Jump to Best Part (${formatDuration(player.bestPart.timeMs)})`
                      : 'Jump to Best Part (B)'
                  }
                >
                  <GlassButton
                    size="sm"
                    variant="tinted"
                    tint={accentHex}
                    intensity={intensity}
                    className={sparkling ? 'cw-sparkle-pop' : ''}
                    aria-label="Jump to Best Part"
                    icon={<Sparkles size={15} className="cw-ic-sparkle" />}
                    onClick={() => {
                      setSparkling(true);
                      onBestPart();
                      window.setTimeout(() => setSparkling(false), 500);
                    }}
                  >
                    Best Part
                  </GlassButton>
                </span>
                <span className="cw-tip-anchor" data-tip={isLiked ? 'Remove from Liked' : 'Save to Liked'}>
                  <GlassButton
                    size="sm"
                    variant={isLiked ? 'tinted' : 'glass'}
                    tint={accentHex}
                    intensity={intensity}
                    className={isLiked ? 'cw-heart-burst' : ''}
                    aria-label={isLiked ? 'Unlike' : 'Like'}
                    icon={<Heart size={16} className="cw-ic-liked" fill={isLiked ? 'currentColor' : 'none'} />}
                    onClick={onToggleLike}
                  />
                </span>
              </div>
            </div>

            <SheetSeekRow
              maxDuration={maxDuration}
              totalDurationMs={player.durationMs || track.durationMs}
              isPlaying={player.isPlaying}
              accentHex={accentHex}
              onSeekTo={onSeekTo}
            />

            <div className="cw-controls-row" style={{ justifyContent: 'center', gap: 14, marginBottom: 16 }}>
              <GlassButton
                size="sm"
                variant={player.shuffle ? 'tinted' : 'glass'}
                tint={accentHex}
                intensity={intensity}
                aria-label="Shuffle"
                icon={<Shuffle size={16} className="cw-ic-shuffle" />}
                onClick={onToggleShuffle}
              />
              <GlassButton
                size="md"
                variant="glass"
                intensity={intensity}
                aria-label="Previous"
                icon={<SkipBack size={19} />}
                onClick={onPrev}
              />
              <GlassButton
                size="lg"
                variant="filled"
                tint={accentHex}
                intensity={intensity}
                aria-label={player.isPlaying ? 'Pause' : 'Play'}
                icon={player.isPlaying ? <Pause size={22} /> : <Play size={22} />}
                onClick={onTogglePlayPause}
              />
              <GlassButton
                size="md"
                variant="glass"
                intensity={intensity}
                aria-label="Next"
                icon={<SkipForward size={19} />}
                onClick={onNext}
              />
              <GlassButton
                size="sm"
                variant={player.repeatMode !== 'off' ? 'tinted' : 'glass'}
                tint={accentHex}
                intensity={intensity}
                aria-label="Repeat"
                icon={player.repeatMode === 'one' ? <Repeat1 size={16} className="cw-ic-repeat" /> : <Repeat size={16} className="cw-ic-repeat" />}
                onClick={onCycleRepeat}
              />
            </div>

            <div style={{ width: '100%', maxWidth: 230, margin: '0 auto' }}>
              <SlimVolumeSlider
                volume={volume}
                onChange={onVolumeChange}
                sliderWidth="100%"
                iconSize={15}
                showTooltip={false}
              />
            </div>
          </div>

          {/* Right column: Full-height Word-by-Word Karaoke Lyrics or Queue */}
          <div className="cw-fullplayer-right">
            {tab === 'lyrics' ? (
              <WordSyncedLyrics
                lyrics={player.lyrics}
                offsetMs={lyricsOffsetMs}
                displayMode={lyricsDisplayMode}
                large={true}
                fontSize={lyricsFontSize}
                bounceStyle={lyricsBounce}
                onDisplayModeChange={onLyricsDisplayModeChange}
                onOffsetChange={onLyricsOffsetChange}
                onSeekTo={onSeekTo}
              />
            ) : (
              <div className="cw-fullplayer-queue">
                {player.queue.length === 0 ? (
                  <div className="cw-muted">Queue is empty.</div>
                ) : (
                  player.queue.map((item, idx) => {
                    const current = idx === player.currentIndex;
                    return (
                      <div
                        key={`${item.videoId}-${idx}`}
                        className="cw-track-row"
                        data-active={current}
                        onClick={() => onPlayQueueIndex(idx)}
                      >
                        <img className="cw-row-thumb" src={item.thumbnailUrl} alt={item.title} />
                        <div className="cw-row-meta">
                          <div
                            className="cw-track-title cw-ellipsis"
                            style={current ? { color: 'var(--cw-accent)' } : undefined}
                          >
                            {item.title}
                          </div>
                          <div className="cw-track-artist cw-ellipsis">{item.artist}</div>
                        </div>
                        {!current && (
                          <button
                            type="button"
                            className="cw-row-icon-btn"
                            aria-label="Remove from queue"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveQueueIndex(idx);
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
