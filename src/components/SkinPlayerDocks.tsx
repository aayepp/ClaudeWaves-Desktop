import React from 'react';
import {
  Film,
  Headphones,
  Heart,
  ListMusic,
  Loader2,
  Maximize2,
  Mic2,
  Monitor,
  Music2,
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
  User,
} from 'lucide-react';
import type { PlayerState } from '../hooks/usePlayer';
import { formatDuration, type LayoutSkin } from '../types';
import { FlatSeekbar, PlaybackTimeCounter } from './FlatSeekbar';
import { SlimVolumeSlider } from './SlimVolumeSlider';

export interface SkinPlayerDockProps {
  layoutSkin: Exclude<LayoutSkin, 'default'>;
  player: PlayerState;
  isLiked: boolean;
  videoMode: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: 'lyrics' | 'queue';
  volume: number;
  sparkling: boolean;
  profileAvatar?: string | null;
  profileName?: string;
  onOpenProfile?: () => void;
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
  floatingLyricsOpen?: boolean;
  onToggleFloatingLyrics?: () => void;
  onOpenAmbientMode?: () => void;
  outputPopoverOpen?: boolean;
  onToggleOutputPopover?: () => void;
}

const RepeatIcon: React.FC<{ mode: PlayerState['repeatMode']; size?: number }> = ({
  mode,
  size = 15,
}) => (mode === 'one' ? <Repeat1 size={size} /> : <Repeat size={size} />);

const RightActionCluster: React.FC<{
  hasTrack: boolean;
  volume: number;
  videoMode: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: 'lyrics' | 'queue';
  floatingLyricsOpen?: boolean;
  outputPopoverOpen?: boolean;
  tipPos?: 'top' | 'bottom';
  volumeFirst?: boolean;
  extraTrailing?: React.ReactNode;
  onVolumeChange: (v: number) => void;
  onToggleVideoMode: () => void;
  onToggleRightPanel: (tab: 'lyrics' | 'queue') => void;
  onToggleFloatingLyrics?: () => void;
  onToggleOutputPopover?: () => void;
  onOpenAmbientMode?: () => void;
  onEnterMini: () => void;
  onOpenFullSheet: () => void;
}> = ({
  hasTrack,
  volume,
  videoMode,
  rightPanelOpen,
  rightPanelTab,
  floatingLyricsOpen = false,
  outputPopoverOpen = false,
  tipPos = 'top',
  volumeFirst = false,
  extraTrailing,
  onVolumeChange,
  onToggleVideoMode,
  onToggleRightPanel,
  onToggleFloatingLyrics,
  onToggleOutputPopover,
  onOpenAmbientMode,
  onEnterMini,
  onOpenFullSheet,
}) => {
  const tipAttr = tipPos === 'bottom' ? 'bottom' : undefined;
  const volNode = (
    <SlimVolumeSlider
      key="vol"
      volume={volume}
      onChange={onVolumeChange}
      sliderWidth={72}
      iconSize={13}
      showTooltip={tipPos !== 'bottom'}
    />
  );

  return (
    <div className="cw-skin-right-cluster">
      {volumeFirst && volNode}
      <span className="cw-tip-anchor" data-tip="YouTube Video (V)" data-tip-pos={tipAttr}>
        <button
          type="button"
          className="cw-skin-icon-btn"
          data-active={videoMode}
          disabled={!hasTrack}
          aria-label="Toggle Video MV"
          onClick={onToggleVideoMode}
        >
          <Film size={15} />
        </button>
      </span>
      <span className="cw-tip-anchor" data-tip="Lyrics (L)" data-tip-pos={tipAttr}>
        <button
          type="button"
          className="cw-skin-icon-btn"
          data-active={rightPanelOpen && rightPanelTab === 'lyrics'}
          aria-label="Toggle Lyrics panel"
          onClick={() => onToggleRightPanel('lyrics')}
        >
          <Mic2 size={15} />
        </button>
      </span>
      {onToggleFloatingLyrics && (
        <span className="cw-tip-anchor" data-tip="Floating Desktop Lyrics" data-tip-pos={tipAttr}>
          <button
            type="button"
            className="cw-skin-icon-btn"
            data-active={floatingLyricsOpen}
            aria-label="Toggle Floating Desktop Lyrics"
            onClick={onToggleFloatingLyrics}
          >
            <Subtitles size={15} />
          </button>
        </span>
      )}
      <span className="cw-tip-anchor" data-tip="Up Next Queue (Q)" data-tip-pos={tipAttr}>
        <button
          type="button"
          className="cw-skin-icon-btn"
          data-active={rightPanelOpen && rightPanelTab === 'queue'}
          aria-label="Toggle Queue panel"
          onClick={() => onToggleRightPanel('queue')}
        >
          <ListMusic size={15} />
        </button>
      </span>
      {!volumeFirst && volNode}
      {onToggleOutputPopover && (
        <span className="cw-tip-anchor" data-tip="Audio Output Device" data-tip-pos={tipAttr}>
          <button
            type="button"
            className="cw-skin-icon-btn"
            data-output-trigger="true"
            data-active={outputPopoverOpen}
            aria-label="Audio Output Device"
            onClick={onToggleOutputPopover}
          >
            <Headphones size={15} />
          </button>
        </span>
      )}
      {onOpenAmbientMode && (
        <span className="cw-tip-anchor" data-tip="Ambient Visualizer Fullscreen (F11)" data-tip-pos={tipAttr}>
          <button
            type="button"
            className="cw-skin-icon-btn"
            aria-label="Ambient Visualizer Fullscreen"
            onClick={onOpenAmbientMode}
          >
            <Monitor size={15} />
          </button>
        </span>
      )}
      <span className="cw-tip-anchor" data-tip="Mini Floating Player" data-tip-pos={tipAttr}>
        <button
          type="button"
          className="cw-skin-icon-btn"
          aria-label="Mini Floating Player"
          onClick={onEnterMini}
        >
          <PictureInPicture2 size={15} />
        </button>
      </span>
      <span className="cw-tip-anchor" data-tip="Full-Screen Now Playing" data-tip-pos={tipAttr}>
        <button
          type="button"
          className="cw-skin-icon-btn"
          disabled={!hasTrack}
          aria-label="Full-screen Now Playing"
          onClick={onOpenFullSheet}
        >
          <Maximize2 size={15} />
        </button>
      </span>
      {extraTrailing}
    </div>
  );
};

export const SkinPlayerDock: React.FC<SkinPlayerDockProps> = React.memo(({
  layoutSkin,
  player,
  isLiked,
  videoMode,
  rightPanelOpen,
  rightPanelTab,
  volume,
  sparkling,
  profileAvatar,
  profileName,
  onOpenProfile,
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
  floatingLyricsOpen = false,
  onToggleFloatingLyrics,
  onOpenAmbientMode,
  outputPopoverOpen = false,
  onToggleOutputPopover,
}) => {
  const track = player.currentTrack;
  const maxDuration = Math.max(1000, player.durationMs || track?.durationMs || 1000);
  const repeatTip =
    player.repeatMode === 'one'
      ? 'Repeat: One'
      : player.repeatMode === 'all'
        ? 'Repeat: All'
        : 'Repeat: Off';

  const clusterProps = {
    hasTrack: Boolean(track),
    volume,
    videoMode,
    rightPanelOpen,
    rightPanelTab,
    floatingLyricsOpen,
    outputPopoverOpen,
    onVolumeChange,
    onToggleVideoMode,
    onToggleRightPanel,
    onToggleFloatingLyrics,
    onToggleOutputPopover,
    onOpenAmbientMode,
    onEnterMini,
    onOpenFullSheet,
  };

  const PlayGlyph = player.isBuffering ? (
    <Loader2 size={17} className="cw-spin" />
  ) : player.isPlaying ? (
    <Pause size={17} fill="currentColor" />
  ) : (
    <Play size={17} fill="currentColor" style={{ marginLeft: 1.5 }} />
  );

  /* ==========================================================================
   * APPLE MUSIC macOS: Top 56px Bar + Centered LCD Pill
   * ========================================================================== */
  if (layoutSkin === 'apple') {
    return (
      <header className="cw-apple-topbar" aria-label="Apple Music Player Bar">
        <div className="cw-apple-top-transport">
          <span className="cw-tip-anchor" data-tip="Shuffle" data-tip-pos="bottom">
            <button
              type="button"
              className="cw-skin-icon-btn"
              data-active={player.shuffle}
              aria-label="Toggle Shuffle"
              onClick={onToggleShuffle}
            >
              <Shuffle size={15} />
            </button>
          </span>
          <span className="cw-tip-anchor" data-tip="Previous" data-tip-pos="bottom">
            <button
              type="button"
              className="cw-skin-icon-btn"
              disabled={!track}
              aria-label="Previous track"
              onClick={onPrev}
            >
              <SkipBack size={17} fill="currentColor" />
            </button>
          </span>
          <span className="cw-tip-anchor" data-tip={player.isPlaying ? 'Pause (Space)' : 'Play (Space)'} data-tip-pos="bottom">
            <button
              type="button"
              className="cw-skin-icon-btn cw-apple-play-btn"
              disabled={!track}
              aria-label={player.isPlaying ? 'Pause' : 'Play'}
              onClick={onTogglePlayPause}
            >
              {player.isBuffering ? (
                <Loader2 size={19} className="cw-spin" />
              ) : player.isPlaying ? (
                <Pause size={19} fill="currentColor" />
              ) : (
                <Play size={19} fill="currentColor" style={{ marginLeft: 2 }} />
              )}
            </button>
          </span>
          <span className="cw-tip-anchor" data-tip="Next" data-tip-pos="bottom">
            <button
              type="button"
              className="cw-skin-icon-btn"
              disabled={!track}
              aria-label="Next track"
              onClick={onNext}
            >
              <SkipForward size={17} fill="currentColor" />
            </button>
          </span>
          <span className="cw-tip-anchor" data-tip={repeatTip} data-tip-pos="bottom">
            <button
              type="button"
              className="cw-skin-icon-btn"
              data-active={player.repeatMode !== 'off'}
              aria-label="Cycle Repeat"
              onClick={onCycleRepeat}
            >
              <RepeatIcon mode={player.repeatMode} size={15} />
            </button>
          </span>
        </div>

        {/* Centered Apple Music LCD Pill */}
        <div className="cw-apple-lcd" data-playing={player.isPlaying}>
          <button
            type="button"
            className="cw-apple-lcd-art-btn"
            disabled={!track}
            aria-label="Open Full-Screen Now Playing"
            onClick={onOpenFullSheet}
          >
            {track?.thumbnailUrl ? (
              <img className="cw-apple-lcd-art" src={track.thumbnailUrl} alt={track.title} />
            ) : (
              <div className="cw-apple-lcd-art cw-apple-lcd-art-empty">
                <Music2 size={16} />
              </div>
            )}
          </button>

          <div className="cw-apple-lcd-center">
            <div className="cw-apple-lcd-top">
              <div className="cw-apple-lcd-meta">
                {track ? (
                  <>
                    <button
                      type="button"
                      className="cw-apple-lcd-title cw-ellipsis"
                      onClick={onOpenFullSheet}
                    >
                      {track.title}
                    </button>
                    <button
                      type="button"
                      className="cw-apple-lcd-artist cw-ellipsis"
                      onClick={() => onOpenArtist(track.artist)}
                    >
                      {track.artist}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="cw-apple-lcd-title">ClaudeWaves</div>
                    <div className="cw-apple-lcd-artist">Pick a track to play</div>
                  </>
                )}
              </div>

              <div className="cw-apple-lcd-actions">
                <span className="cw-tip-anchor" data-tip="Best Part (B)" data-tip-pos="bottom">
                  <button
                    type="button"
                    className={`cw-skin-icon-btn cw-apple-lcd-btn${sparkling ? ' cw-bestpart-spark' : ''}`}
                    disabled={!track}
                    aria-label="Jump to chorus / best part"
                    onClick={onBestPart}
                  >
                    <Sparkles size={13} />
                  </button>
                </span>
                <span className="cw-tip-anchor" data-tip={isLiked ? 'Remove from Liked' : 'Like Song'} data-tip-pos="bottom">
                  <button
                    type="button"
                    className="cw-skin-icon-btn cw-apple-lcd-btn"
                    data-active={isLiked}
                    disabled={!track}
                    aria-label="Toggle Like"
                    onClick={onToggleLike}
                  >
                    <Heart size={13} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                </span>
              </div>
            </div>

            <div className="cw-apple-lcd-times">
              <PlaybackTimeCounter durationMs={maxDuration} mode="elapsed" />
              <PlaybackTimeCounter durationMs={maxDuration} mode="remaining" />
            </div>

            <div className="cw-apple-lcd-seek-wrap">
              <FlatSeekbar
                variant="apple-lcd"
                durationMs={maxDuration}
                disabled={!track}
                onSeekTo={onSeekTo}
              />
            </div>
          </div>
        </div>

        <RightActionCluster
          {...clusterProps}
          tipPos="bottom"
          volumeFirst
          extraTrailing={
            onOpenProfile ? (
              <span className="cw-tip-anchor" data-tip={profileName || 'Account & Profile'} data-tip-pos="bottom">
                <button
                  type="button"
                  className="cw-apple-profile-btn"
                  aria-label="Open Profile"
                  onClick={onOpenProfile}
                >
                  {profileAvatar ? (
                    <img src={profileAvatar} alt={profileName || 'Profile'} />
                  ) : (
                    <User size={14} />
                  )}
                </button>
              </span>
            ) : undefined
          }
        />
      </header>
    );
  }

  /* ==========================================================================
   * YOUTUBE MUSIC DESKTOP: Full-Width Bottom Bar + 3px Top Edge Scrubber
   * ========================================================================== */
  if (layoutSkin === 'ytmusic') {
    return (
      <footer className="cw-ytm-dock" aria-label="YouTube Music Player Bar">
        <div className="cw-ytm-edge-seek">
          <FlatSeekbar
            variant="ytmusic"
            durationMs={maxDuration}
            disabled={!track}
            onSeekTo={onSeekTo}
          />
        </div>

        <div className="cw-ytm-dock-grid">
          {/* Left: Transport + elapsed / total */}
          <div className="cw-ytm-left">
            <span className="cw-tip-anchor" data-tip="Previous">
              <button
                type="button"
                className="cw-skin-icon-btn"
                disabled={!track}
                aria-label="Previous track"
                onClick={onPrev}
              >
                <SkipBack size={18} fill="currentColor" />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip={player.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              <button
                type="button"
                className="cw-skin-icon-btn cw-ytm-play-btn"
                disabled={!track}
                aria-label={player.isPlaying ? 'Pause' : 'Play'}
                onClick={onTogglePlayPause}
              >
                {player.isBuffering ? (
                  <Loader2 size={22} className="cw-spin" />
                ) : player.isPlaying ? (
                  <Pause size={22} fill="currentColor" />
                ) : (
                  <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />
                )}
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip="Next">
              <button
                type="button"
                className="cw-skin-icon-btn"
                disabled={!track}
                aria-label="Next track"
                onClick={onNext}
              >
                <SkipForward size={18} fill="currentColor" />
              </button>
            </span>
            <PlaybackTimeCounter durationMs={maxDuration} mode="slash" className="cw-ytm-time" />
          </div>

          {/* Center: Compact cover + Title / Artist + Like / Best Part */}
          <div className="cw-ytm-center">
            {track ? (
              <>
                <button
                  type="button"
                  className="cw-ytm-art-btn"
                  aria-label="Open Full-Screen Now Playing"
                  onClick={onOpenFullSheet}
                >
                  <img className="cw-ytm-art" src={track.thumbnailUrl} alt={track.title} />
                </button>
                <div className="cw-ytm-meta">
                  <button
                    type="button"
                    className="cw-ytm-title cw-ellipsis"
                    onClick={onOpenFullSheet}
                  >
                    {track.title}
                  </button>
                  <button
                    type="button"
                    className="cw-ytm-artist cw-ellipsis"
                    onClick={() => onOpenArtist(track.artist)}
                  >
                    {track.artist}
                  </button>
                </div>
                <span className="cw-tip-anchor" data-tip={isLiked ? 'Unlike' : 'Like Song'}>
                  <button
                    type="button"
                    className="cw-skin-icon-btn"
                    data-active={isLiked}
                    aria-label="Toggle Like"
                    onClick={onToggleLike}
                  >
                    <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                </span>
                <span className="cw-tip-anchor" data-tip="Jump to Best Part (B)">
                  <button
                    type="button"
                    className={`cw-skin-icon-btn${sparkling ? ' cw-bestpart-spark' : ''}`}
                    aria-label="Jump to Best Part"
                    onClick={onBestPart}
                  >
                    <Sparkles size={14} />
                  </button>
                </span>
              </>
            ) : (
              <div className="cw-muted" style={{ fontSize: 12.5 }}>
                Nothing playing
              </div>
            )}
          </div>

          {/* Right: Repeat, Shuffle, Volume, Video, Lyrics, Queue, Mini, Full */}
          <div className="cw-ytm-right">
            <span className="cw-tip-anchor" data-tip="Shuffle">
              <button
                type="button"
                className="cw-skin-icon-btn"
                data-active={player.shuffle}
                aria-label="Toggle Shuffle"
                onClick={onToggleShuffle}
              >
                <Shuffle size={15} />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip={repeatTip}>
              <button
                type="button"
                className="cw-skin-icon-btn"
                data-active={player.repeatMode !== 'off'}
                aria-label="Cycle Repeat"
                onClick={onCycleRepeat}
              >
                <RepeatIcon mode={player.repeatMode} size={15} />
              </button>
            </span>
            <RightActionCluster {...clusterProps} volumeFirst />
          </div>
        </div>
      </footer>
    );
  }

  /* ==========================================================================
   * TIDAL HiFi STUDIO: 78px Edge-to-Edge Bar + MAX Badge + Razor Seekbar
   * ========================================================================== */
  if (layoutSkin === 'tidal') {
    return (
      <footer className="cw-tidal-dock" aria-label="Tidal HiFi Player Bar">
        <div className="cw-spotify-dock-grid">
          <div className="cw-spotify-left">
            {track ? (
              <>
                <button
                  type="button"
                  className="cw-spotify-art-btn"
                  aria-label="Open Full-Screen Now Playing"
                  onClick={onOpenFullSheet}
                >
                  <img className="cw-tidal-art" src={track.thumbnailUrl} alt={track.title} />
                </button>
                <div className="cw-row-meta">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <button
                      type="button"
                      className="cw-spotify-title cw-ellipsis"
                      onClick={onOpenFullSheet}
                    >
                      {track.title}
                    </button>
                    <span className="cw-tidal-max-badge">MAX</span>
                  </div>
                  <button
                    type="button"
                    className="cw-spotify-artist cw-ellipsis"
                    onClick={() => onOpenArtist(track.artist)}
                  >
                    {track.artist}
                  </button>
                </div>
                <span className="cw-tip-anchor" data-tip={isLiked ? 'Unlike' : 'Add to Collection'}>
                  <button
                    type="button"
                    className="cw-skin-icon-btn"
                    data-active={isLiked}
                    aria-label="Toggle Like"
                    onClick={onToggleLike}
                  >
                    <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                </span>
              </>
            ) : (
              <div className="cw-muted" style={{ fontSize: 12.5 }}>
                Tidal HiFi Ready
              </div>
            )}
          </div>

          <div className="cw-spotify-center">
            <div className="cw-spotify-transport">
              <span className="cw-tip-anchor" data-tip="Best Part (B)">
                <button
                  type="button"
                  className={`cw-skin-icon-btn${sparkling ? ' cw-bestpart-spark' : ''}`}
                  disabled={!track}
                  aria-label="Jump to Best Part"
                  onClick={onBestPart}
                >
                  <Sparkles size={14} />
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip="Shuffle">
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  data-active={player.shuffle}
                  aria-label="Toggle Shuffle"
                  onClick={onToggleShuffle}
                >
                  <Shuffle size={15} />
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip="Previous">
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  disabled={!track}
                  aria-label="Previous track"
                  onClick={onPrev}
                >
                  <SkipBack size={16} fill="currentColor" />
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip={player.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                <button
                  type="button"
                  className="cw-tidal-play-btn"
                  disabled={!track}
                  aria-label={player.isPlaying ? 'Pause' : 'Play'}
                  onClick={onTogglePlayPause}
                >
                  {PlayGlyph}
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip="Next">
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  disabled={!track}
                  aria-label="Next track"
                  onClick={onNext}
                >
                  <SkipForward size={16} fill="currentColor" />
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip={repeatTip}>
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  data-active={player.repeatMode !== 'off'}
                  aria-label="Cycle Repeat"
                  onClick={onCycleRepeat}
                >
                  <RepeatIcon mode={player.repeatMode} size={15} />
                </button>
              </span>
            </div>

            <div className="cw-spotify-seek-row">
              <PlaybackTimeCounter durationMs={maxDuration} mode="elapsed" className="cw-spotify-time" />
              <FlatSeekbar
                variant="tidal"
                durationMs={maxDuration}
                disabled={!track}
                onSeekTo={onSeekTo}
              />
              <span className="cw-spotify-time">{track ? formatDuration(maxDuration) : '0:00'}</span>
            </div>
          </div>

          <RightActionCluster {...clusterProps} />
        </div>
      </footer>
    );
  }

  /* ==========================================================================
   * SOUNDCLOUD WAVE: 66px Dock with Wide 48-Bar Interactive Waveform Seekbar
   * ========================================================================== */
  if (layoutSkin === 'soundcloud') {
    return (
      <footer className="cw-sc-dock" aria-label="SoundCloud Waveform Player Bar">
        <div className="cw-sc-dock-grid">
          <div className="cw-sc-left">
            <span className="cw-tip-anchor" data-tip="Previous">
              <button
                type="button"
                className="cw-skin-icon-btn"
                disabled={!track}
                aria-label="Previous track"
                onClick={onPrev}
              >
                <SkipBack size={16} fill="currentColor" />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip={player.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              <button
                type="button"
                className="cw-sc-play-btn"
                disabled={!track}
                aria-label={player.isPlaying ? 'Pause' : 'Play'}
                onClick={onTogglePlayPause}
              >
                {PlayGlyph}
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip="Next">
              <button
                type="button"
                className="cw-skin-icon-btn"
                disabled={!track}
                aria-label="Next track"
                onClick={onNext}
              >
                <SkipForward size={16} fill="currentColor" />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip="Shuffle">
              <button
                type="button"
                className="cw-skin-icon-btn"
                data-active={player.shuffle}
                aria-label="Toggle Shuffle"
                onClick={onToggleShuffle}
              >
                <Shuffle size={14} />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip={repeatTip}>
              <button
                type="button"
                className="cw-skin-icon-btn"
                data-active={player.repeatMode !== 'off'}
                aria-label="Cycle Repeat"
                onClick={onCycleRepeat}
              >
                <RepeatIcon mode={player.repeatMode} size={14} />
              </button>
            </span>
          </div>

          <div className="cw-sc-wave-wrap">
            <PlaybackTimeCounter durationMs={maxDuration} mode="elapsed" className="cw-sc-time-active" />
            <FlatSeekbar
              variant="soundcloud"
              seedKey={track?.videoId || 'sc-wave'}
              durationMs={maxDuration}
              disabled={!track}
              onSeekTo={onSeekTo}
            />
            <span className="cw-spotify-time">{track ? formatDuration(maxDuration) : '0:00'}</span>
          </div>

          <div className="cw-sc-right">
            {track && (
              <div className="cw-sc-now">
                <button
                  type="button"
                  className="cw-spotify-art-btn"
                  aria-label="Open Full-Screen Now Playing"
                  onClick={onOpenFullSheet}
                >
                  <img className="cw-sc-mini-art" src={track.thumbnailUrl} alt={track.title} />
                </button>
                <div className="cw-row-meta" style={{ maxWidth: 140 }}>
                  <button
                    type="button"
                    className="cw-spotify-title cw-ellipsis"
                    onClick={onOpenFullSheet}
                  >
                    {track.title}
                  </button>
                  <button
                    type="button"
                    className="cw-spotify-artist cw-ellipsis"
                    onClick={() => onOpenArtist(track.artist)}
                  >
                    {track.artist}
                  </button>
                </div>
                <span className="cw-tip-anchor" data-tip={isLiked ? 'Unlike' : 'Like'}>
                  <button
                    type="button"
                    className="cw-skin-icon-btn"
                    data-active={isLiked}
                    aria-label="Toggle Like"
                    onClick={onToggleLike}
                  >
                    <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                </span>
                <span className="cw-tip-anchor" data-tip="Best Part (B)">
                  <button
                    type="button"
                    className={`cw-skin-icon-btn${sparkling ? ' cw-bestpart-spark' : ''}`}
                    aria-label="Jump to Best Part"
                    onClick={onBestPart}
                  >
                    <Sparkles size={14} />
                  </button>
                </span>
              </div>
            )}
            <RightActionCluster {...clusterProps} />
          </div>
        </div>
      </footer>
    );
  }

  /* ==========================================================================
   * NOTHING OS DOT-MATRIX: Dotted Industrial Floating Pill Dock
   * ========================================================================== */
  if (layoutSkin === 'nothing') {
    return (
      <footer className="cw-nothing-dock-wrap" aria-label="Nothing OS Player Dock">
        <div className="cw-nothing-dock">
          <div className="cw-spotify-left">
            {track ? (
              <>
                <button
                  type="button"
                  className="cw-spotify-art-btn"
                  aria-label="Open Full-Screen Now Playing"
                  onClick={onOpenFullSheet}
                >
                  <img className="cw-nothing-art" src={track.thumbnailUrl} alt={track.title} />
                </button>
                <div className="cw-row-meta">
                  <button
                    type="button"
                    className="cw-nothing-title cw-ellipsis"
                    onClick={onOpenFullSheet}
                  >
                    {track.title}
                  </button>
                  <button
                    type="button"
                    className="cw-nothing-artist cw-ellipsis"
                    onClick={() => onOpenArtist(track.artist)}
                  >
                    {track.artist}
                  </button>
                </div>
                <span className="cw-tip-anchor" data-tip={isLiked ? 'Unlike' : 'Like Track'}>
                  <button
                    type="button"
                    className="cw-skin-icon-btn"
                    data-active={isLiked}
                    aria-label="Toggle Like"
                    onClick={onToggleLike}
                  >
                    <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                </span>
              </>
            ) : (
              <div className="cw-nothing-artist">NO AUDIO SIGNAL // READY</div>
            )}
          </div>

          <div className="cw-spotify-center">
            <div className="cw-spotify-transport">
              <span className="cw-tip-anchor" data-tip="Best Part (B)">
                <button
                  type="button"
                  className={`cw-skin-icon-btn${sparkling ? ' cw-bestpart-spark' : ''}`}
                  disabled={!track}
                  aria-label="Jump to Best Part"
                  onClick={onBestPart}
                >
                  <Sparkles size={14} />
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip="Shuffle">
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  data-active={player.shuffle}
                  aria-label="Toggle Shuffle"
                  onClick={onToggleShuffle}
                >
                  <Shuffle size={14} />
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip="Previous">
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  disabled={!track}
                  aria-label="Previous track"
                  onClick={onPrev}
                >
                  <SkipBack size={16} fill="currentColor" />
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip={player.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                <button
                  type="button"
                  className="cw-nothing-play-btn"
                  disabled={!track}
                  aria-label={player.isPlaying ? 'Pause' : 'Play'}
                  onClick={onTogglePlayPause}
                >
                  {PlayGlyph}
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip="Next">
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  disabled={!track}
                  aria-label="Next track"
                  onClick={onNext}
                >
                  <SkipForward size={16} fill="currentColor" />
                </button>
              </span>
              <span className="cw-tip-anchor" data-tip={repeatTip}>
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  data-active={player.repeatMode !== 'off'}
                  aria-label="Cycle Repeat"
                  onClick={onCycleRepeat}
                >
                  <RepeatIcon mode={player.repeatMode} size={14} />
                </button>
              </span>
            </div>

            <div className="cw-spotify-seek-row">
              <PlaybackTimeCounter durationMs={maxDuration} mode="elapsed" className="cw-nothing-time" />
              <FlatSeekbar
                variant="nothing"
                durationMs={maxDuration}
                disabled={!track}
                onSeekTo={onSeekTo}
              />
              <span className="cw-nothing-time">{track ? formatDuration(maxDuration) : '0:00'}</span>
            </div>
          </div>

          <RightActionCluster {...clusterProps} />
        </div>
      </footer>
    );
  }

  /* ==========================================================================
   * SPOTIFY DESKTOP: Full-Width Bottom Bar (#000000 Dark / #FFFFFF Light)
   * ========================================================================== */
  return (
    <footer className="cw-spotify-dock" aria-label="Spotify Player Bar">
      <div className="cw-spotify-dock-grid">
        {/* Left: 56px art + Title / Artist + Like */}
        <div className="cw-spotify-left">
          {track ? (
            <>
              <button
                type="button"
                className="cw-spotify-art-btn"
                aria-label="Open Full-Screen Now Playing"
                onClick={onOpenFullSheet}
              >
                <img className="cw-spotify-art" src={track.thumbnailUrl} alt={track.title} />
              </button>
              <div className="cw-row-meta">
                <button
                  type="button"
                  className="cw-spotify-title cw-ellipsis"
                  onClick={onOpenFullSheet}
                >
                  {track.title}
                </button>
                <button
                  type="button"
                  className="cw-spotify-artist cw-ellipsis"
                  onClick={() => onOpenArtist(track.artist)}
                >
                  {track.artist}
                </button>
              </div>
              <span className="cw-tip-anchor" data-tip={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}>
                <button
                  type="button"
                  className="cw-skin-icon-btn"
                  data-active={isLiked}
                  aria-label="Toggle Like"
                  onClick={onToggleLike}
                >
                  <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
                </button>
              </span>
            </>
          ) : (
            <div className="cw-muted" style={{ fontSize: 12.5 }}>
              Select a track to play
            </div>
          )}
        </div>

        {/* Center: Transport + FlatSeekbar */}
        <div className="cw-spotify-center">
          <div className="cw-spotify-transport">
            <span className="cw-tip-anchor" data-tip="Best Part (B)">
              <button
                type="button"
                className={`cw-skin-icon-btn${sparkling ? ' cw-bestpart-spark' : ''}`}
                disabled={!track}
                aria-label="Jump to Best Part"
                onClick={onBestPart}
              >
                <Sparkles size={14} />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip="Shuffle">
              <button
                type="button"
                className="cw-skin-icon-btn"
                data-active={player.shuffle}
                aria-label="Toggle Shuffle"
                onClick={onToggleShuffle}
              >
                <Shuffle size={15} />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip="Previous">
              <button
                type="button"
                className="cw-skin-icon-btn"
                disabled={!track}
                aria-label="Previous track"
                onClick={onPrev}
              >
                <SkipBack size={16} fill="currentColor" />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip={player.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              <button
                type="button"
                className="cw-spotify-play-btn"
                disabled={!track}
                aria-label={player.isPlaying ? 'Pause' : 'Play'}
                onClick={onTogglePlayPause}
              >
                {PlayGlyph}
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip="Next">
              <button
                type="button"
                className="cw-skin-icon-btn"
                disabled={!track}
                aria-label="Next track"
                onClick={onNext}
              >
                <SkipForward size={16} fill="currentColor" />
              </button>
            </span>
            <span className="cw-tip-anchor" data-tip={repeatTip}>
              <button
                type="button"
                className="cw-skin-icon-btn"
                data-active={player.repeatMode !== 'off'}
                aria-label="Cycle Repeat"
                onClick={onCycleRepeat}
              >
                <RepeatIcon mode={player.repeatMode} size={15} />
              </button>
            </span>
          </div>

          <div className="cw-spotify-seek-row">
            <PlaybackTimeCounter durationMs={maxDuration} mode="elapsed" className="cw-spotify-time" />
            <FlatSeekbar
              variant="spotify"
              durationMs={maxDuration}
              disabled={!track}
              onSeekTo={onSeekTo}
            />
            <span className="cw-spotify-time">{track ? formatDuration(maxDuration) : '0:00'}</span>
          </div>
        </div>

        {/* Right: Video, Lyrics, Floating Lyrics, Queue, Volume, Ambient, Mini, Full */}
        <RightActionCluster {...clusterProps} />
      </div>
    </footer>
  );
});
