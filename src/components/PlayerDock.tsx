import React, { useRef, useState } from 'react';
import {
  GlassButton,
  GlassCard,
} from '@zakisheriff/liquid-glass';
import {
  Film,
  Headphones,
  Heart,
  ListMusic,
  Loader2,
  Maximize2,
  Mic2,
  Monitor,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Subtitles,
} from 'lucide-react';
import type { PlayerState } from '../hooks/usePlayer';
import { usePlaybackPositionMs } from '../hooks/playbackClock';
import { formatDuration, type LayoutSkin } from '../types';
import { AbLoopButton } from './AbLoopButton';
import { SkinPlayerDock } from './SkinPlayerDocks';
import { SlimVolumeSlider } from './SlimVolumeSlider';
import { WavySeekbar } from './WavySeekbar';

const DockSeekRow: React.FC<{
  maxDuration: number;
  totalDurationMs: number;
  isPlaying: boolean;
  hasTrack: boolean;
  accentHex: string;
  onSeekTo: (ms: number) => void;
}> = ({ maxDuration, totalDurationMs, isPlaying, hasTrack, accentHex, onSeekTo }) => {
  const positionMs = usePlaybackPositionMs();
  const progress = Math.min(maxDuration, positionMs);
  return (
    <div className="cw-seek-row">
      <span className="cw-time-label">{formatDuration(progress)}</span>
      <div style={{ flex: 1 }}>
        <WavySeekbar
          value={progress}
          max={maxDuration}
          isPlaying={isPlaying}
          accentHex={accentHex}
          disabled={!hasTrack}
          onChange={onSeekTo}
          ariaLabel="Seek position"
        />
      </div>
      <span className="cw-time-label" style={{ textAlign: 'right' }}>
        {formatDuration(totalDurationMs)}
      </span>
    </div>
  );
};

interface PlayerDockProps {
  player: PlayerState;
  accentHex: string;
  intensity: number;
  volume: number;
  isLiked: boolean;
  videoMode: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: 'lyrics' | 'queue';
  onVolumeChange: (v: number) => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekTo: (ms: number) => void;
  onBestPart: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: () => void;
  onToggleVideoMode: () => void;
  onOpenArtist: (artistName: string) => void;
  onToggleRightPanel: (tab: 'lyrics' | 'queue') => void;
  onOpenFullSheet: () => void;
  onEnterMini: () => void;
  layoutSkin?: LayoutSkin;
  profileAvatar?: string | null;
  profileName?: string;
  onOpenProfile?: () => void;
  floatingLyricsOpen?: boolean;
  onToggleFloatingLyrics?: () => void;
  onOpenAmbientMode?: () => void;
  outputPopoverOpen?: boolean;
  onToggleOutputPopover?: () => void;
  onCycleAbLoop?: () => void;
}

export const PlayerDock: React.FC<PlayerDockProps> = React.memo(({
  player,
  accentHex,
  intensity,
  volume,
  isLiked,
  videoMode,
  rightPanelOpen,
  rightPanelTab,
  onVolumeChange,
  onTogglePlayPause,
  onNext,
  onPrev,
  onSeekTo,
  onBestPart,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
  onToggleVideoMode,
  onOpenArtist,
  onToggleRightPanel,
  onOpenFullSheet,
  onEnterMini,
  layoutSkin = 'default',
  profileAvatar,
  profileName,
  onOpenProfile,
  floatingLyricsOpen = false,
  onToggleFloatingLyrics,
  onOpenAmbientMode,
  outputPopoverOpen = false,
  onToggleOutputPopover,
  onCycleAbLoop,
}) => {
  const track = player.currentTrack;
  const maxDuration = Math.max(1000, player.durationMs || track?.durationMs || 1000);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [sparkling, setSparkling] = useState(false);

  const handleBestPart = () => {
    setSparkling(true);
    onBestPart();
    window.setTimeout(() => setSparkling(false), 500);
  };

  if (layoutSkin !== 'default') {
    return (
      <SkinPlayerDock
        layoutSkin={layoutSkin}
        player={player}
        isLiked={isLiked}
        videoMode={videoMode}
        rightPanelOpen={rightPanelOpen}
        rightPanelTab={rightPanelTab}
        volume={volume}
        sparkling={sparkling}
        profileAvatar={profileAvatar}
        profileName={profileName}
        onOpenProfile={onOpenProfile}
        onVolumeChange={onVolumeChange}
        onTogglePlayPause={onTogglePlayPause}
        onNext={onNext}
        onPrev={onPrev}
        onSeekTo={onSeekTo}
        onBestPart={handleBestPart}
        onToggleShuffle={onToggleShuffle}
        onCycleRepeat={onCycleRepeat}
        onToggleLike={onToggleLike}
        onToggleVideoMode={onToggleVideoMode}
        onOpenArtist={onOpenArtist}
        onToggleRightPanel={onToggleRightPanel}
        onOpenFullSheet={onOpenFullSheet}
        onEnterMini={onEnterMini}
        floatingLyricsOpen={floatingLyricsOpen}
        onToggleFloatingLyrics={onToggleFloatingLyrics}
        onOpenAmbientMode={onOpenAmbientMode}
        outputPopoverOpen={outputPopoverOpen}
        onToggleOutputPopover={onToggleOutputPopover}
        onCycleAbLoop={onCycleAbLoop}
      />
    );
  }

  return (
    <div
      className="cw-dock-wrap"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('input, button')) return;
        swipeStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!swipeStart.current) return;
        const dx = e.clientX - swipeStart.current.x;
        const dy = e.clientY - swipeStart.current.y;
        swipeStart.current = null;
        if (dy < -55 && Math.abs(dx) < 60 && track) {
          onOpenFullSheet();
        } else if (dx < -65 && Math.abs(dy) < 45 && track) {
          onNext();
        } else if (dx > 65 && Math.abs(dy) < 45 && track) {
          onPrev();
        }
      }}
    >
      <div className="cw-dock-inner cw-comic-frame">
        <GlassCard
          intensity={intensity}
          padding="11px 16px"
          radius="24px"
          variant="regular"
          style={{ position: 'relative' }}
        >
          {/* Living blurred album art wash clipped cleanly inside rounded corners so hover tooltips above never clip */}
          {track && (
            <div className="cw-dock-cover-clip">
              <div
                className="cw-dock-cover-bg"
                style={{ backgroundImage: `url(${track.thumbnailUrl})` }}
              />
            </div>
          )}

          <div className="cw-dock-grid" style={{ position: 'relative', zIndex: 2 }}>
            {/* Left: Track artwork + title + clickable artist + like */}
            <div
              className="cw-dock-left cw-tip-anchor"
              data-tip={track ? 'Open Fullscreen Player (macOS Genie)' : undefined}
              onClick={() => track && onOpenFullSheet()}
            >
              {track ? (
                <img
                  key={track.videoId}
                  className="cw-dock-thumb cw-art-flip"
                  data-playing={player.isPlaying}
                  src={track.thumbnailUrl}
                  alt={track.title}
                />
              ) : (
                <div
                  className="cw-dock-thumb"
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(127,127,127,0.18)',
                  }}
                >
                  <Play size={19} opacity={0.55} />
                </div>
              )}

              <div className="cw-row-meta">
                <div className="cw-track-title cw-ellipsis">
                  {track ? track.title : 'Not Playing'}
                </div>
                {track ? (
                  <button
                    type="button"
                    className="cw-artist-link cw-ellipsis"
                    style={player.error ? { color: '#ff5c5c' } : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenArtist(track.artist);
                    }}
                  >
                    {player.error ?? track.artist}
                  </button>
                ) : (
                  <div className="cw-track-artist cw-ellipsis">Select a song to start listening</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  {player.streamInfo && (
                    <span className="cw-ellipsis" style={{ fontSize: 10.5, color: 'var(--cw-accent)', opacity: 0.9 }}>
                      {player.streamInfo}
                    </span>
                  )}
                  {player.sleepRemainingSec !== null && (
                    <span className="cw-sleep-pill">
                      <Moon size={10} /> {formatDuration(player.sleepRemainingSec * 1000)}
                    </span>
                  )}
                </div>
              </div>

              {track && (
                <div className="cw-tip-anchor" data-tip={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'} onClick={(e) => e.stopPropagation()}>
                  <GlassButton
                    size="sm"
                    variant={isLiked ? 'tinted' : 'clear'}
                    tint={accentHex}
                    intensity={intensity}
                    className={isLiked ? 'cw-heart-burst' : ''}
                    aria-label={isLiked ? 'Unlike song' : 'Like song'}
                    icon={<Heart size={15} className="cw-ic-liked" fill={isLiked ? 'currentColor' : 'none'} />}
                    onClick={onToggleLike}
                  />
                </div>
              )}
            </div>

            {/* Center: Video (left of Shuffle) -> Transport controls -> Best Part -> Ocean Wavy Seekbar */}
            <div className="cw-dock-center">
              <div className="cw-controls-row">
                <span className="cw-tip-anchor" data-tip={videoMode ? 'Hide Music Video (V)' : 'Watch Synced Music Video (V)'}>
                  <GlassButton
                    size="sm"
                    variant={videoMode ? 'tinted' : 'clear'}
                    tint={accentHex}
                    intensity={intensity}
                    aria-label="Toggle Synced Music Video"
                    icon={<Film size={15} className="cw-ic-video" />}
                    onClick={onToggleVideoMode}
                    disabled={!track}
                  />
                </span>
                <span className="cw-tip-anchor" data-tip={player.shuffle ? 'Shuffle On' : 'Shuffle Off'}>
                  <GlassButton
                    size="sm"
                    variant={player.shuffle ? 'tinted' : 'clear'}
                    tint={accentHex}
                    intensity={intensity}
                    aria-label="Shuffle"
                    icon={<Shuffle size={15} className="cw-ic-shuffle" />}
                    onClick={onToggleShuffle}
                  />
                </span>
                <span className="cw-tip-anchor" data-tip="Previous Track">
                  <GlassButton
                    size="sm"
                    variant="clear"
                    intensity={intensity}
                    aria-label="Previous"
                    icon={<SkipBack size={17} />}
                    onClick={onPrev}
                    disabled={!track}
                  />
                </span>
                <span className="cw-tip-anchor" data-tip={player.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                  <GlassButton
                    size="md"
                    variant="filled"
                    tint={accentHex}
                    intensity={intensity}
                    aria-label={player.isPlaying ? 'Pause' : 'Play'}
                    icon={
                      player.isBuffering ? (
                        <Loader2 size={18} className="cw-spin" />
                      ) : player.isPlaying ? (
                        <Pause size={18} />
                      ) : (
                        <Play size={18} />
                      )
                    }
                    onClick={onTogglePlayPause}
                    disabled={!track}
                  />
                </span>
                <span className="cw-tip-anchor" data-tip="Next Track">
                  <GlassButton
                    size="sm"
                    variant="clear"
                    intensity={intensity}
                    aria-label="Next"
                    icon={<SkipForward size={17} />}
                    onClick={onNext}
                    disabled={!track}
                  />
                </span>
                <span
                  className="cw-tip-anchor"
                  data-tip={
                    player.repeatMode === 'one'
                      ? 'Repeat One'
                      : player.repeatMode === 'all'
                        ? 'Repeat All'
                        : 'Repeat Off'
                  }
                >
                  <GlassButton
                    size="sm"
                    variant={player.repeatMode !== 'off' ? 'tinted' : 'clear'}
                    tint={accentHex}
                    intensity={intensity}
                    aria-label="Repeat mode"
                    icon={player.repeatMode === 'one' ? <Repeat1 size={15} className="cw-ic-repeat" /> : <Repeat size={15} className="cw-ic-repeat" />}
                    onClick={onCycleRepeat}
                  />
                </span>
                <AbLoopButton
                  abLoop={player.abLoop}
                  hasTrack={Boolean(track)}
                  onClick={onCycleAbLoop}
                />
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
                    icon={<Sparkles size={14} className="cw-ic-sparkle" />}
                    onClick={handleBestPart}
                    disabled={!track}
                  />
                </span>
              </div>

              <DockSeekRow
                maxDuration={maxDuration}
                totalDurationMs={player.durationMs || track?.durationMs || 0}
                isPlaying={player.isPlaying}
                hasTrack={Boolean(track)}
                accentHex={accentHex}
                onSeekTo={onSeekTo}
              />
            </div>

            {/* Right: Lyrics, Queue, Volume, Mini Player, Fullscreen */}
            <div className="cw-dock-right">
              <span className="cw-tip-anchor" data-tip="Word-Synced Lyrics (L)">
                <GlassButton
                  size="sm"
                  variant={rightPanelOpen && rightPanelTab === 'lyrics' ? 'tinted' : 'glass'}
                  tint={accentHex}
                  intensity={intensity}
                  aria-label="Toggle Lyrics panel"
                  icon={<Mic2 size={15} className="cw-ic-lyrics" />}
                  onClick={() => onToggleRightPanel('lyrics')}
                />
              </span>
              {onToggleFloatingLyrics && (
                <span className="cw-tip-anchor" data-tip="Floating Desktop Lyrics">
                  <GlassButton
                    size="sm"
                    variant={floatingLyricsOpen ? 'tinted' : 'glass'}
                    tint={accentHex}
                    intensity={intensity}
                    aria-label="Toggle Floating Desktop Lyrics"
                    icon={<Subtitles size={15} />}
                    onClick={onToggleFloatingLyrics}
                  />
                </span>
              )}
              <span className="cw-tip-anchor" data-tip="Up Next Queue (Q)">
                <GlassButton
                  size="sm"
                  variant={rightPanelOpen && rightPanelTab === 'queue' ? 'tinted' : 'glass'}
                  tint={accentHex}
                  intensity={intensity}
                  aria-label="Toggle Queue panel"
                  icon={<ListMusic size={15} className="cw-ic-queue" />}
                  onClick={() => onToggleRightPanel('queue')}
                />
              </span>
              <SlimVolumeSlider
                volume={volume}
                onChange={onVolumeChange}
                sliderWidth={72}
                iconSize={13}
                showTooltip={true}
              />
              {onToggleOutputPopover && (
                <span className="cw-tip-anchor" data-tip="Audio Output Device">
                  <GlassButton
                    size="sm"
                    variant={outputPopoverOpen ? 'tinted' : 'clear'}
                    tint={accentHex}
                    intensity={intensity}
                    data-output-trigger="true"
                    aria-label="Audio Output Device"
                    icon={<Headphones size={15} />}
                    onClick={onToggleOutputPopover}
                  />
                </span>
              )}
              {onOpenAmbientMode && (
                <span className="cw-tip-anchor" data-tip="Ambient Visualizer Fullscreen (F11)">
                  <GlassButton
                    size="sm"
                    variant="clear"
                    intensity={intensity}
                    aria-label="Ambient Visualizer Fullscreen"
                    icon={<Monitor size={15} />}
                    onClick={onOpenAmbientMode}
                  />
                </span>
              )}
              <span className="cw-tip-anchor" data-tip="Always-on-Top Mini Player">
                <GlassButton
                  size="sm"
                  variant="clear"
                  intensity={intensity}
                  aria-label="Mini Floating Player"
                  icon={<PictureInPicture2 size={15} className="cw-ic-mini" />}
                  onClick={onEnterMini}
                />
              </span>
              <span className="cw-tip-anchor" data-tip="Full-Screen Now Playing">
                <GlassButton
                  size="sm"
                  variant="clear"
                  intensity={intensity}
                  aria-label="Full-screen Now Playing"
                  icon={<Maximize2 size={15} className="cw-ic-expand" />}
                  disabled={!track}
                  onClick={onOpenFullSheet}
                />
              </span>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
});
