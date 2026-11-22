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
import {
  formatDuration,
  type AmbientPreset,
  type LyricsResult,
  type Track,
} from '../types';
import { FlatSeekbar, PlaybackTimeCounter } from './FlatSeekbar';

interface AmbientVisualizerViewProps {
  open: boolean;
  preset: AmbientPreset;
  onChangePreset: (preset: AmbientPreset) => void;
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

const AMBIENT_PRESETS: Array<{ id: AmbientPreset; label: string }> = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'vinyl', label: 'Vinyl' },
  { id: 'halo', label: 'Halo' },
  { id: 'wave', label: 'Wave' },
];

type LyricViewMode = 'five' | 'three' | 'two' | 'single';

const AmbientLyricStack: React.FC<{
  track: Track | null;
  lyrics: LyricsResult;
  lyricsOffsetMs: number;
  mode: LyricViewMode;
  onSeekTo: (ms: number) => void;
}> = React.memo(({ track, lyrics, lyricsOffsetMs, mode, onSeekTo }) => {
  const positionMs = usePlaybackPositionMs();

  if (!track) {
    return (
      <div className="cw-amb-lyrics" data-mode={mode}>
        <div className="cw-amb-lyric-line" data-state="active">
          ClaudeWaves Ambient Studio
        </div>
        {mode !== 'single' && (
          <div className="cw-amb-lyric-line" data-state="next">
            Play any song to sync live motion &amp; lyrics
          </div>
        )}
      </div>
    );
  }

  if (lyrics.kind === 'loading') {
    return (
      <div className="cw-amb-lyrics" data-mode={mode}>
        <div className="cw-amb-lyric-line" data-state="next">
          Loading synced lyrics...
        </div>
      </div>
    );
  }

  if (lyrics.kind === 'instrumental') {
    return (
      <div className="cw-amb-lyrics" data-mode={mode}>
        <div className="cw-amb-lyric-line" data-state="active">
          Instrumental Track
        </div>
        {mode !== 'single' && (
          <div className="cw-amb-lyric-line" data-state="next">
            {track.title} — {track.artist}
          </div>
        )}
      </div>
    );
  }

  if (lyrics.kind === 'plain') {
    const rows = lyrics.text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const takeCount = mode === 'five' ? 5 : mode === 'three' ? 3 : mode === 'two' ? 2 : 1;
    const shown = rows.slice(0, takeCount);
    return (
      <div className="cw-amb-lyrics" data-mode={mode}>
        {shown.map((txt, idx) => (
          <div
            key={`${idx}-${txt}`}
            className="cw-amb-lyric-line"
            data-state={idx === 0 ? 'active' : 'next'}
          >
            {txt}
          </div>
        ))}
      </div>
    );
  }

  if (lyrics.kind !== 'synced' || lyrics.lines.length === 0) {
    return (
      <div className="cw-amb-lyrics" data-mode={mode}>
        <div className="cw-amb-lyric-line" data-state="active">
          {track.title}
        </div>
        {mode !== 'single' && (
          <div className="cw-amb-lyric-line" data-state="next">
            {track.artist}
          </div>
        )}
      </div>
    );
  }

  const lines = lyrics.lines;
  const effMs = positionMs + lyricsOffsetMs;
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= effMs) activeIdx = i;
    else break;
  }

  const offsets =
    mode === 'five'
      ? [-2, -1, 0, 1, 2]
      : mode === 'three'
        ? [-1, 0, 1]
        : mode === 'two'
          ? [0, 1]
          : [0];

  const baseIdx = activeIdx < 0 ? 0 : activeIdx;

  return (
    <div className="cw-amb-lyrics" data-mode={mode}>
      {offsets.map((rel) => {
        const idx = baseIdx + rel;
        const item = idx >= 0 && idx < lines.length ? lines[idx] : null;
        if (!item) {
          return (
            <div
              key={`empty-${rel}`}
              className="cw-amb-lyric-line cw-amb-lyric-placeholder"
              data-state={rel < 0 ? 'past' : 'next'}
              aria-hidden="true"
            >
              &nbsp;
            </div>
          );
        }
        const isCurrent = activeIdx >= 0 ? rel === 0 : false;
        const state = isCurrent ? 'active' : rel < 0 ? 'past' : 'next';
        const dist = Math.abs(rel);
        return (
          <button
            key={`${idx}-${item.timeMs}`}
            type="button"
            className="cw-amb-lyric-line"
            data-state={state}
            data-dist={dist}
            onClick={() => onSeekTo(item.timeMs)}
          >
            {item.text || '• • •'}
          </button>
        );
      })}
    </div>
  );
});

const BAND_COUNT = 48;

interface NebulaStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  phase: number;
}

function createNebulaStars(count: number): NebulaStar[] {
  const out: NebulaStar[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00018,
      vy: (Math.random() - 0.5) * 0.00018,
      r: 0.7 + Math.random() * 1.8,
      alpha: 0.18 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

/** Sample N logarithmically-spaced bands across usable spectrum so low/mid/high stay balanced. */
function sampleLogSpectrum(
  freqData: Uint8Array | null,
  smooth: Float32Array,
  isPlaying: boolean,
  timeSec: number,
): number {
  let hasLiveSignal = false;
  if (freqData && freqData.length > 0 && isPlaying) {
    let peak = 0;
    const probeLen = Math.min(freqData.length, 256);
    for (let k = 0; k < probeLen; k++) {
      if (freqData[k] > peak) peak = freqData[k];
    }
    hasLiveSignal = peak > 4;
  }

  let bassSum = 0;
  const usableBins = freqData ? Math.max(24, Math.floor(freqData.length * 0.58)) : 64;
  const minLog = Math.log(1);
  const maxLog = Math.log(usableBins);

  for (let i = 0; i < BAND_COUNT; i++) {
    let target = 0.03;
    if (isPlaying) {
      if (hasLiveSignal && freqData) {
        const t0 = i / BAND_COUNT;
        const t1 = (i + 1) / BAND_COUNT;
        const binStart = Math.max(1, Math.floor(Math.exp(minLog + (maxLog - minLog) * t0)));
        const binEnd = Math.max(
          binStart + 1,
          Math.min(usableBins, Math.ceil(Math.exp(minLog + (maxLog - minLog) * t1))),
        );
        let sum = 0;
        let count = 0;
        for (let b = binStart; b < binEnd; b++) {
          sum += freqData[b];
          count++;
        }
        const raw = count > 0 ? sum / count / 255 : 0;
        const trebleLift = 1 + t0 * 0.58;
        target = Math.min(1, Math.max(0.05, Math.pow(raw * trebleLift, 0.84)));
      } else {
        // Organic harmonic motion fallback when stream telemetry is silenced by CORS
        const env = 1 - (i / BAND_COUNT) * 0.45;
        const wave =
          0.26 +
          0.24 * Math.sin(timeSec * 2.4 + i * 0.24) +
          0.16 * Math.cos(timeSec * 3.9 - i * 0.41);
        target = Math.max(0.06, Math.min(0.92, wave * env));
      }
    }
    const prev = smooth[i];
    smooth[i] = target > prev ? prev + (target - prev) * 0.38 : prev * 0.89;
    if (i < 6) bassSum += smooth[i];
  }

  return bassSum / 6;
}

export const AmbientVisualizerView: React.FC<AmbientVisualizerViewProps> = ({
  open,
  preset,
  onChangePreset,
  player,
  analyserRef,
  waveColorHex,
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const haloAnchorRef = useRef<HTMLDivElement | null>(null);
  const smoothBandsRef = useRef<Float32Array>(new Float32Array(BAND_COUNT));
  const starsRef = useRef<NebulaStar[]>(createNebulaStars(58));

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
    }, 3200);
  };

  useEffect(() => {
    if (!open) return;
    bumpHud();
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    };
  }, [open, player.isPlaying]);

  // Press V inside Ambient mode to cycle presets
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        const curIdx = AMBIENT_PRESETS.findIndex((p) => p.id === preset);
        const next = AMBIENT_PRESETS[(curIdx + 1) % AMBIENT_PRESETS.length].id;
        onChangePreset(next);
        bumpHud();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, preset, onChangePreset]);

  // Unified real-time 60fps+ canvas renderer per preset
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let freqData: Uint8Array | null = null;
    let timeData: Uint8Array | null = null;
    const bands = smoothBandsRef.current;
    const stars = starsRef.current;
    const safeColor = /^#[0-9a-fA-F]{6}$/.test(waveColorHex) ? waveColorHex : '#38BDF8';

    const drawAuroraSilk = (cw: number, ch: number, dpr: number, t: number, bass: number) => {
      const baseH = ch * 0.16;
      const baseY = ch - 12 * dpr;
      const layers = [
        { amp: 0.72, freq: 2.2, speed: 0.9, alpha: '44', phase: 0 },
        { amp: 0.56, freq: 3.1, speed: -1.25, alpha: '66', phase: 1.4 },
        { amp: 0.42, freq: 4.3, speed: 1.55, alpha: 'aa', phase: 2.7 },
      ];

      layers.forEach((layer, lIdx) => {
        const grad = ctx.createLinearGradient(0, 0, cw, 0);
        grad.addColorStop(0, `${safeColor}00`);
        grad.addColorStop(0.24, `${safeColor}${layer.alpha}`);
        grad.addColorStop(0.5, `#ffffff${lIdx === 2 ? '88' : '33'}`);
        grad.addColorStop(0.76, `${safeColor}${layer.alpha}`);
        grad.addColorStop(1, `${safeColor}00`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        const samples = 96;
        for (let s = 0; s <= samples; s++) {
          const u = s / samples;
          const distCenter = Math.abs(u - 0.5) * 2;
          const bandIdx = Math.min(BAND_COUNT - 1, Math.floor(distCenter * (BAND_COUNT * 0.7)));
          const ampEnv = Math.sin(u * Math.PI) * (0.28 + 0.72 * Math.sin(distCenter * Math.PI * 0.85 + 0.25));
          const energy = (bands[bandIdx] * 0.7 + bass * 0.3) * (0.65 + layer.amp * 0.65);
          const ribbonH =
            (6 * dpr + energy * baseH * (1 + Math.sin(u * Math.PI * layer.freq + t * layer.speed + layer.phase) * 0.42)) *
            ampEnv;
          ctx.lineTo(u * cw, baseY - Math.max(1 * dpr, ribbonH));
        }
        ctx.lineTo(cw, baseY);
        ctx.closePath();
        ctx.fill();

        // Delicate luminous ridge highlight on top layer
        if (lIdx === 2) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)';
          ctx.lineWidth = 1.4 * dpr;
          ctx.beginPath();
          for (let s = 0; s <= samples; s++) {
            const u = s / samples;
            const distCenter = Math.abs(u - 0.5) * 2;
            const bandIdx = Math.min(BAND_COUNT - 1, Math.floor(distCenter * (BAND_COUNT * 0.7)));
            const ampEnv = Math.sin(u * Math.PI) * (0.28 + 0.72 * Math.sin(distCenter * Math.PI * 0.85 + 0.25));
            const energy = (bands[bandIdx] * 0.7 + bass * 0.3) * (0.65 + layer.amp * 0.65);
            const ribbonH =
              (6 * dpr + energy * baseH * (1 + Math.sin(u * Math.PI * layer.freq + t * layer.speed + layer.phase) * 0.42)) *
              ampEnv;
            const x = u * cw;
            const y = baseY - Math.max(1 * dpr, ribbonH);
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      });
    };

    const drawRadialHalo = (cw: number, ch: number, dpr: number, t: number, bass: number) => {
      // Drifting nebula bokeh particles
      for (const s of stars) {
        if (player.isPlaying) {
          s.x = (s.x + s.vx * (1 + bass * 3.2) + 1) % 1;
          s.y = (s.y + s.vy * (1 + bass * 3.2) + 1) % 1;
        }
        const twinkle = 0.6 + 0.4 * Math.sin(t * 1.4 + s.phase);
        const alpha = s.alpha * twinkle * (0.75 + bass * 0.5);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x * cw, s.y * ch, s.r * dpr * (1 + bass * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }

      // Measure actual cover center & radius so ring locks seamlessly around cover circle
      let cx = cw * 0.5;
      let cy = ch * 0.42;
      let baseR = Math.min(cw, ch) * 0.145;
      const anchor = haloAnchorRef.current;
      if (anchor) {
        const cRect = canvas.getBoundingClientRect();
        const aRect = anchor.getBoundingClientRect();
        if (aRect.width > 40) {
          cx = (aRect.left + aRect.width * 0.5 - cRect.left) * dpr;
          cy = (aRect.top + aRect.height * 0.5 - cRect.top) * dpr;
          baseR = aRect.width * 0.5 * dpr + 12 * dpr;
        }
      }

      // Subtle atmospheric aura glow around halo center
      const aura = ctx.createRadialGradient(cx, cy, baseR * 0.65, cx, cy, baseR + 140 * dpr);
      aura.addColorStop(0, `${safeColor}${Math.round(35 + bass * 55).toString(16).padStart(2, '0')}`);
      aura.addColorStop(0.55, 'rgba(139, 92, 246, 0.14)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 140 * dpr, 0, Math.PI * 2);
      ctx.fill();

      // 360-degree symmetrical radial bars (mirrored left-to-right from top 12 o'clock)
      const totalBars = 96;
      const half = totalBars / 2;
      const maxLen = Math.min(cw, ch) * 0.095;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2.4 * dpr, ((2 * Math.PI * baseR) / totalBars) * 0.5);

      for (let i = 0; i < totalBars; i++) {
        const mirrorIdx = i < half ? i : totalBars - 1 - i;
        const bandIdx = Math.min(BAND_COUNT - 1, Math.floor((mirrorIdx / half) * (BAND_COUNT * 0.85)));
        const val = bands[bandIdx];
        const barLen = 8 * dpr + val * maxLen;
        const angle = -Math.PI * 0.5 + (i / totalBars) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rIn = baseR;
        const rOut = baseR + barLen;

        const barGrad = ctx.createLinearGradient(
          cx + cos * rIn,
          cy + sin * rIn,
          cx + cos * rOut,
          cy + sin * rOut,
        );
        barGrad.addColorStop(0, safeColor);
        barGrad.addColorStop(0.65, '#a855f7');
        barGrad.addColorStop(1, '#ffffff');
        ctx.strokeStyle = barGrad;
        ctx.beginPath();
        ctx.moveTo(cx + cos * rIn, cy + sin * rIn);
        ctx.lineTo(cx + cos * rOut, cy + sin * rOut);
        ctx.stroke();
      }
    };

    const drawDualMirrorWave = (cw: number, ch: number, dpr: number, t: number, bass: number) => {
      const centerX = cw * 0.5;
      const horizonY = ch * 0.5;
      const maxBarH = ch * 0.39;

      // Razor horizon line
      const lineGrad = ctx.createLinearGradient(0, horizonY, cw, horizonY);
      lineGrad.addColorStop(0, 'rgba(255,255,255,0)');
      lineGrad.addColorStop(0.2, `${safeColor}88`);
      lineGrad.addColorStop(0.5, '#ffffffaa');
      lineGrad.addColorStop(0.8, '#ec489988');
      lineGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lineGrad;
      ctx.fillRect(0, horizonY - 0.75 * dpr, cw, 1.5 * dpr);

      // Symmetrical bars expanding center -> left and center -> right, mirrored top + bottom
      const halfBars = 36;
      const slotW = (cw * 0.47) / halfBars;
      const barW = Math.max(2 * dpr, slotW * 0.54);
      const radius = barW * 0.5;

      const paletteGrad = ctx.createLinearGradient(0, horizonY, cw, horizonY);
      paletteGrad.addColorStop(0.05, `${safeColor}bb`);
      paletteGrad.addColorStop(0.5, '#ffffff');
      paletteGrad.addColorStop(0.95, '#ec4899bb');

      for (let i = 0; i < halfBars; i++) {
        const bandIdx = Math.min(BAND_COUNT - 1, Math.floor((i / halfBars) * (BAND_COUNT * 0.9)));
        const taper = 1 - (i / halfBars) * 0.32;
        const amp = Math.max(0.04, bands[bandIdx] * taper);
        const h = Math.max(3 * dpr, amp * maxBarH);
        const offset = (i + 0.5) * slotW;

        ctx.fillStyle = paletteGrad;
        const drawMirroredBar = (bx: number) => {
          ctx.beginPath();
          ctx.roundRect(bx - barW * 0.5, horizonY - h, barW, h * 2, radius);
          ctx.fill();
        };
        drawMirroredBar(centerX + offset);
        drawMirroredBar(centerX - offset);
      }

      // Analog oscilloscope ribbon across center horizon
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.75 * dpr;
      ctx.beginPath();
      const samples = 160;
      const hasTimeWave = Boolean(timeData && timeData.length > 0 && player.isPlaying);
      for (let s = 0; s <= samples; s++) {
        const u = s / samples;
        const env = Math.sin(u * Math.PI);
        let v = 0;
        if (hasTimeWave && timeData) {
          const ti = Math.min(timeData.length - 1, Math.floor(u * timeData.length));
          v = (timeData[ti] - 128) / 128;
        } else if (player.isPlaying) {
          v =
            (Math.sin(u * Math.PI * 6 - t * 4.2) * 0.55 +
              Math.cos(u * Math.PI * 11 + t * 2.7) * 0.35) *
            (0.25 + bass * 0.65);
        }
        const y = horizonY + v * (ch * 0.16) * env;
        const x = u * cw;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

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
          timeData = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);
        if (preset === 'wave' && timeData) {
          analyser.getByteTimeDomainData(timeData as Uint8Array<ArrayBuffer>);
        }
      }

      const timeSec = ts * 0.001;
      const bass = sampleLogSpectrum(freqData, bands, player.isPlaying, timeSec);
      if (rootRef.current) {
        rootRef.current.style.setProperty('--cw-bass', bass.toFixed(3));
      }

      if (preset === 'aurora') {
        drawAuroraSilk(cw, ch, dpr, timeSec, bass);
      } else if (preset === 'halo') {
        drawRadialHalo(cw, ch, dpr, timeSec, bass);
      } else if (preset === 'wave') {
        drawDualMirrorWave(cw, ch, dpr, timeSec, bass);
      }

      const stillSettling = bands.some((v) => v > 0.015);
      if (player.isPlaying || stillSettling || preset === 'halo') {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [open, preset, player.isPlaying, analyserRef, waveColorHex]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="cw-ambient-root"
      data-preset={preset}
      data-hud={hudVisible}
      data-playing={player.isPlaying}
      style={{ '--cw-amb-color': waveColorHex } as React.CSSProperties}
      onPointerMove={bumpHud}
      onClick={bumpHud}
    >
      {/* Living Atmospheric Backdrop */}
      {track?.thumbnailUrl && (
        <div
          className="cw-ambient-bg"
          style={{ backgroundImage: `url(${track.thumbnailUrl})` }}
        />
      )}
      {preset === 'aurora' && (
        <div className="cw-amb-aurora-mesh" aria-hidden="true">
          <span className="cw-amb-aurora-orb cw-amb-orb-1" />
          <span className="cw-amb-aurora-orb cw-amb-orb-2" />
          <span className="cw-amb-aurora-orb cw-amb-orb-3" />
        </div>
      )}
      <div className="cw-ambient-scrim" />

      {/* Top HUD: Clock, 4-Preset Switcher Pill, Exit */}
      <div className="cw-ambient-top">
        <div className="cw-ambient-clock">{clockText}</div>

        <div
          className="cw-amb-switcher"
          role="tablist"
          aria-label="Ambient visualizer preset"
          onClick={(e) => e.stopPropagation()}
        >
          {AMBIENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={preset === p.id}
              data-active={preset === p.id}
              className="cw-amb-switch-btn"
              title={`${p.label} preset (press V to cycle)`}
              onClick={() => onChangePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="cw-ambient-exit-btn"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <Minimize2 size={14} />
          <span>Exit (Esc)</span>
        </button>
      </div>

      {/* PRESET 1: APPLE AURORA SPLIT */}
      {preset === 'aurora' && (
        <>
          <div className="cw-amb-split-stage">
            <div className="cw-amb-split-art-col">
              <div className="cw-amb-cover-halo">
                {track?.thumbnailUrl ? (
                  <img className="cw-amb-cover-lg" src={track.thumbnailUrl} alt={track.title} />
                ) : (
                  <div className="cw-amb-cover-lg cw-ambient-cover-empty">
                    <Music2 size={64} />
                  </div>
                )}
              </div>
              <div className="cw-amb-split-meta">
                <h1 className="cw-ambient-title">{track?.title || 'ClaudeWaves Ambient'}</h1>
                <div className="cw-ambient-artist">{track?.artist || 'Select a song to play'}</div>
              </div>
            </div>

            <div className="cw-amb-split-lyric-col">
              <AmbientLyricStack
                track={track}
                lyrics={player.lyrics}
                lyricsOffsetMs={lyricsOffsetMs}
                mode="five"
                onSeekTo={onSeekTo}
              />
            </div>
          </div>
          <canvas ref={canvasRef} className="cw-amb-canvas-aurora" />
        </>
      )}

      {/* PRESET 2: VINYL TURNTABLE STUDIO */}
      {preset === 'vinyl' && (
        <>
          <canvas ref={canvasRef} className="cw-amb-canvas-hidden" />
          <div className="cw-amb-vinyl-stage">
            <div className="cw-amb-turntable-wrap">
              <div className="cw-amb-platter-glow" aria-hidden="true" />
              <div className="cw-amb-vinyl-disc" data-spinning={player.isPlaying}>
                <div className="cw-amb-vinyl-grooves" />
                <div className="cw-amb-vinyl-sheen" />
                <div className="cw-amb-vinyl-label">
                  {track?.thumbnailUrl ? (
                    <img src={track.thumbnailUrl} alt={track.title} />
                  ) : (
                    <Music2 size={40} color="rgba(255,255,255,0.65)" />
                  )}
                </div>
                <div className="cw-amb-vinyl-spindle" />
              </div>

              {/* Realistic Articulated Tonearm */}
              <svg
                className="cw-amb-tonearm"
                data-playing={player.isPlaying}
                viewBox="0 0 120 260"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="cwArmMetal" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#e2e8f0" />
                    <stop offset="50%" stopColor="#94a3b8" />
                    <stop offset="100%" stopColor="#475569" />
                  </linearGradient>
                </defs>
                <circle cx="82" cy="36" r="24" fill="#18181b" stroke="#52525b" strokeWidth="2.5" />
                <circle cx="82" cy="36" r="11" fill="url(#cwArmMetal)" />
                <rect x="76" y="4" width="12" height="16" rx="3" fill="#71717a" />
                <path
                  d="M82 36 L66 146 L46 210"
                  fill="none"
                  stroke="url(#cwArmMetal)"
                  strokeWidth="6.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <g transform="translate(36, 206) rotate(-26)">
                  <rect x="0" y="0" width="18" height="32" rx="4" fill="#27272a" stroke="#a1a1aa" strokeWidth="1.5" />
                  <circle cx="9" cy="26" r="2" fill="#f59e0b" />
                </g>
              </svg>
            </div>

            <div className="cw-amb-vinyl-info">
              <span className="cw-amb-eyebrow">NOW SPINNING</span>
              <h1 className="cw-ambient-title">{track?.title || 'ClaudeWaves Vinyl'}</h1>
              <div className="cw-ambient-artist">{track?.artist || 'Put on a record'}</div>
              <AmbientLyricStack
                track={track}
                lyrics={player.lyrics}
                lyricsOffsetMs={lyricsOffsetMs}
                mode="three"
                onSeekTo={onSeekTo}
              />
            </div>
          </div>
        </>
      )}

      {/* PRESET 3: RADIAL 360 HALO & NEBULA */}
      {preset === 'halo' && (
        <>
          <canvas ref={canvasRef} className="cw-amb-canvas-full" />
          <div className="cw-amb-halo-stage">
            <div ref={haloAnchorRef} className="cw-amb-halo-cover-anchor">
              {track?.thumbnailUrl ? (
                <img className="cw-amb-halo-cover" src={track.thumbnailUrl} alt={track.title} />
              ) : (
                <div className="cw-amb-halo-cover cw-ambient-cover-empty">
                  <Music2 size={54} />
                </div>
              )}
            </div>

            <div className="cw-amb-halo-meta">
              <h1 className="cw-ambient-title">{track?.title || 'ClaudeWaves Halo'}</h1>
              <div className="cw-ambient-artist">{track?.artist || 'Select a song to play'}</div>
              <AmbientLyricStack
                track={track}
                lyrics={player.lyrics}
                lyricsOffsetMs={lyricsOffsetMs}
                mode="two"
                onSeekTo={onSeekTo}
              />
            </div>
          </div>
        </>
      )}

      {/* PRESET 4: DUAL-MIRROR STUDIO WAVE */}
      {preset === 'wave' && (
        <div className="cw-amb-wave-stage">
          <div className="cw-amb-wave-header">
            {track?.thumbnailUrl ? (
              <img className="cw-amb-wave-art" src={track.thumbnailUrl} alt={track.title} />
            ) : (
              <div className="cw-amb-wave-art cw-ambient-cover-empty">
                <Music2 size={34} />
              </div>
            )}
            <div className="cw-amb-wave-meta">
              <h1 className="cw-ambient-title">{track?.title || 'ClaudeWaves Studio Wave'}</h1>
              <div className="cw-ambient-artist">{track?.artist || 'Select a song to play'}</div>
              <AmbientLyricStack
                track={track}
                lyrics={player.lyrics}
                lyricsOffsetMs={lyricsOffsetMs}
                mode="single"
                onSeekTo={onSeekTo}
              />
            </div>
          </div>

          <div className="cw-amb-wave-canvas-wrap">
            <canvas ref={canvasRef} className="cw-amb-canvas-wave" />
          </div>
        </div>
      )}

      {/* Auto-Hiding Frosted Floating Glass Transport Capsule */}
      <div className="cw-ambient-controls" onClick={(e) => e.stopPropagation()}>
        <div className="cw-amb-dock-pill">
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
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button
            type="button"
            className="cw-ambient-play-btn"
            disabled={!track}
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
            onClick={onTogglePlayPause}
          >
            {player.isPlaying ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>
          <button
            type="button"
            className="cw-skin-icon-btn"
            disabled={!track}
            aria-label="Next"
            onClick={onNext}
          >
            <SkipForward size={18} fill="currentColor" />
          </button>

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
    </div>
  );
};
