import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  Minimize2,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { PlayerState } from '../hooks/usePlayer';
import { usePlaybackPositionMs } from '../hooks/playbackClock';
import { formatDuration, type LyricsResult, type Track } from '../types';
import { CoverArtWaves } from './CoverArtWaves';
import { FlatSeekbar, PlaybackTimeCounter } from './FlatSeekbar';
import { resolveActiveLyricPair } from './FloatingLyricsBridge';

interface AmbientVisualizerViewProps {
  open: boolean;
  player: PlayerState;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  waveColorHex: string;
  accentHex: string;
  isDark: boolean;
  isLiked: boolean;
  lyricsOffsetMs: number;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekTo: (ms: number) => void;
  onToggleLike: () => void;
  onClose: () => void;
}

const AmbientSyncedLyricLine: React.FC<{
  track: Track | null;
  lyrics: LyricsResult;
  lyricsOffsetMs: number;
}> = React.memo(({ track, lyrics, lyricsOffsetMs }) => {
  const positionMs = usePlaybackPositionMs();
  const { line, nextLine } = resolveActiveLyricPair(track, lyrics, positionMs, lyricsOffsetMs);
  return (
    <div className="cw-ambient-lyric-box">
      <div className="cw-ambient-lyric-cur">{line}</div>
      {nextLine && <div className="cw-ambient-lyric-next">{nextLine}</div>}
    </div>
  );
});

const BAR_COUNT = 64;

export const AmbientVisualizerView: React.FC<AmbientVisualizerViewProps> = ({
  open,
  player,
  analyserRef,
  waveColorHex,
  isDark,
  isLiked,
  lyricsOffsetMs,
  onTogglePlayPause,
  onNext,
  onPrev,
  onSeekTo,
  onToggleLike,
  onClose,
}) => {
  const track = player.currentTrack;
  const maxDuration = Math.max(1000, player.durationMs || track?.durationMs || 1000);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothBinsRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const [hudVisible, setHudVisible] = useState(true);
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  );
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const tick = () =>
      setClockText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [open]);

  const bumpHud = () => {
    setHudVisible(true);
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      if (player.isPlaying) setHudVisible(false);
    }, 3000);
  };

  useEffect(() => {
    if (!open) return;
    bumpHud();
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    };
  }, [open, player.isPlaying]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let freqData: Uint8Array | null = null;
    const smooth = smoothBinsRef.current;

    const renderFrame = (ts: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(320, Math.round(rect.width * dpr));
      const ch = Math.max(120, Math.round(rect.height * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      ctx.clearRect(0, 0, cw, ch);

      const analyser = analyserRef.current;
      if (analyser) {
        if (!freqData || freqData.length !== analyser.frequencyBinCount) {
          freqData = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);
      }

      const t = ts * 0.0022;
      const step = cw / BAR_COUNT;
      const barW = Math.max(2 * dpr, step * 0.56);
      const grad = ctx.createLinearGradient(0, ch, 0, 0);
      grad.addColorStop(0, `${waveColorHex}33`);
      grad.addColorStop(0.55, `${waveColorHex}b8`);
      grad.addColorStop(1, '#ffffff');
      ctx.fillStyle = grad;

      for (let i = 0; i < BAR_COUNT; i++) {
        let target = 0.04;
        if (player.isPlaying) {
          if (freqData && freqData.length > 0) {
            const idx = Math.min(
              freqData.length - 1,
              Math.floor(Math.pow(i / BAR_COUNT, 1.35) * (freqData.length * 0.72)),
            );
            target = Math.max(0.05, freqData[idx] / 255);
          } else {
            target =
              0.18 +
              0.24 * Math.abs(Math.sin(t + i * 0.27)) * Math.sin((i / BAR_COUNT) * Math.PI);
          }
        }
        const cur = smooth[i];
        smooth[i] = target > cur ? cur + (target - cur) * 0.42 : cur * 0.9;
        const barH = Math.max(3 * dpr, smooth[i] * ch * 0.92);
        const x = i * step + (step - barW) * 0.5;
        const y = ch - barH;
        const rad = Math.min(barW * 0.5, 4 * dpr);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [rad, rad, 0, 0]);
        ctx.fill();
      }

      if (player.isPlaying || smooth.some((v) => v > 0.012)) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [open, player.isPlaying, analyserRef, waveColorHex]);

  if (!open) return null;

  return (
    <div
      className="cw-ambient-root"
      data-hud={hudVisible}
      onPointerMove={bumpHud}
      onClick={bumpHud}
    >
      {track?.thumbnailUrl && (
        <div
          className="cw-ambient-bg"
          style={{ backgroundImage: `url(${track.thumbnailUrl})` }}
        />
      )}
      <div className="cw-ambient-scrim" />

      {/* Top HUD */}
      <div className="cw-ambient-top">
        <div className="cw-ambient-clock">{clockText}</div>
        <button
          type="button"
          className="cw-ambient-exit-btn"
          onClick={onClose}
        >
          <Minimize2 size={14} />
          <span>Exit Visualizer (Esc)</span>
        </button>
      </div>

      {/* Centerpiece: Waves + Cover + Title + Live Synced Lyric */}
      <div className="cw-ambient-center">
        <div className="cw-ambient-cover-stage">
          <CoverArtWaves
            analyserRef={analyserRef}
            isPlaying={player.isPlaying}
            colorHex={waveColorHex}
            isDark={isDark}
            variant="full"
          />
          {track?.thumbnailUrl ? (
            <img className="cw-ambient-cover" src={track.thumbnailUrl} alt={track.title} />
          ) : (
            <div className="cw-ambient-cover cw-ambient-cover-empty">
              <Music2 size={56} />
            </div>
          )}
        </div>

        <h1 className="cw-ambient-title">{track?.title || 'ClaudeWaves Visualizer'}</h1>
        <div className="cw-ambient-artist">{track?.artist || 'Select a track to play'}</div>

        <AmbientSyncedLyricLine
          track={track}
          lyrics={player.lyrics}
          lyricsOffsetMs={lyricsOffsetMs}
        />
      </div>

      {/* Bottom 64-Bar Spectrum */}
      <canvas ref={canvasRef} className="cw-ambient-canvas" />

      {/* Auto-Hiding Transport HUD */}
      <div className="cw-ambient-controls">
        <div className="cw-ambient-transport">
          <button
            type="button"
            className="cw-skin-icon-btn"
            data-active={isLiked}
            disabled={!track}
            aria-label="Toggle Like"
            onClick={onToggleLike}
          >
            <Heart size={17} fill={isLiked ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="cw-skin-icon-btn"
            disabled={!track}
            aria-label="Previous"
            onClick={onPrev}
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            type="button"
            className="cw-ambient-play-btn"
            disabled={!track}
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
            onClick={onTogglePlayPause}
          >
            {player.isPlaying ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>
          <button
            type="button"
            className="cw-skin-icon-btn"
            disabled={!track}
            aria-label="Next"
            onClick={onNext}
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>

        <div className="cw-ambient-seek-row">
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
    </div>
  );
};
