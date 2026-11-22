import React, { useEffect, useRef, useState } from 'react';

interface WavySeekbarProps {
  value: number;
  max: number;
  isPlaying: boolean;
  accentHex: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  ariaLabel?: string;
}

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [210, 75, 58];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function smootherstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

function wavePhase(seconds: number, periodSeconds: number): number {
  const cycles = seconds / periodSeconds;
  return (cycles - Math.floor(cycles)) * Math.PI * 2;
}

/**
 * Flicker-free 240Hz Desktop port of ClaudeWaves Android WavySeekBar.kt:
 * - Single persistent rAF loop (never resets wave clock on positionMs ticks)
 * - Smoothly interpolated progress + 3 calm layered translucent ocean waves rising above the played bar
 * - Analogous color harmony matching active accent/theme (zero harsh flashing)
 */
export const WavySeekbar: React.FC<WavySeekbarProps> = ({
  value,
  max,
  isPlaying,
  accentHex,
  disabled = false,
  onChange,
  ariaLabel = 'Seek track',
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draggingPct, setDraggingPct] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);

  const safeMax = Math.max(1, max);
  const pct = draggingPct ?? Math.max(0, Math.min(1, value / safeMax));

  const pctRef = useRef(pct);
  pctRef.current = pct;
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;
  const draggingRef = useRef(draggingPct !== null);
  draggingRef.current = draggingPct !== null;
  const hoveredRef = useRef(hovered || draggingPct !== null);
  hoveredRef.current = hovered || draggingPct !== null;
  const accentRef = useRef(accentHex);
  accentRef.current = accentHex;
  const kickRef = useRef<(() => void) | null>(null);

  // Mount canvas animation engine ONCE — never reset clockSec or ResizeObserver on ticks
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let running = false;
    let clockSec = 0;
    let lastNow = performance.now();
    let displayPct = pctRef.current;
    let amp1 = playingRef.current ? 10.5 : 1.0;
    let amp2 = playingRef.current ? 7.8 : 1.0;
    let amp3 = playingRef.current ? 5.5 : 1.0;
    let cachedW = 200;

    const CANVAS_H = 30;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(80, Math.round(rect.width));
      cachedW = w;
      if (canvas.width !== w * dpr || canvas.height !== CANVAS_H * dpr) {
        canvas.width = w * dpr;
        canvas.height = CANVAS_H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      kick();
    };

    const draw = (now: number) => {
      rafId = 0;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const wavesActive = playingRef.current && !draggingRef.current;
      if (wavesActive) {
        clockSec = (clockSec + dt) % 126;
      }

      // Smoothly glide thumb & played length between React timeupdate ticks
      const targetPct = pctRef.current;
      if (draggingRef.current || Math.abs(targetPct - displayPct) > 0.08) {
        displayPct = targetPct;
      } else {
        displayPct += (targetPct - displayPct) * Math.min(1, dt * 16);
      }

      const t1 = wavesActive ? 10.5 : 1.0;
      const t2 = wavesActive ? 7.8 : 1.0;
      const t3 = wavesActive ? 5.5 : 1.0;
      const ampLerp = Math.min(1, dt * 9);
      amp1 += (t1 - amp1) * ampLerp;
      amp2 += (t2 - amp2) * ampLerp;
      amp3 += (t3 - amp3) * ampLerp;

      const w = cachedW;
      const pad = 10;
      const usableW = Math.max(10, w - pad * 2);
      const centerY = CANVAS_H - 9;
      const trackPx = 4;
      const topY = centerY - trackPx / 2;
      const thumbX = pad + displayPct * usableW;
      const playedW = Math.max(0, thumbX - pad);

      ctx.clearRect(0, 0, w, CANVAS_H);

      const isLight = document.documentElement.dataset.theme === 'light';
      const [baseH, baseS] = hexToHsl(accentRef.current);
      const isNeutral = baseS < 14;

      // Calm analogous harmony (no jarring clashing hues)
      const hPrimary = isNeutral ? 212 : baseH;
      const hSecondary = isNeutral ? 236 : (baseH + 26) % 360;
      const hTertiary = isNeutral ? 262 : (baseH - 22 + 360) % 360;
      const sat = isNeutral ? (isLight ? 18 : 24) : Math.min(86, Math.max(58, baseS));
      const lumMain = isLight ? 44 : 66;
      const lumHi = isLight ? 54 : 78;
      const lumLo = isLight ? 36 : 56;

      // 1. Inactive baseline track
      ctx.beginPath();
      ctx.moveTo(pad, centerY);
      ctx.lineTo(w - pad, centerY);
      ctx.strokeStyle = isLight ? 'rgba(17, 19, 24, 0.16)' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = trackPx;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 2. Three gentle layered rolling ocean wave contours rising ABOVE played baseline
      if (playedW > 1) {
        const transition = Math.min(46, playedW * 0.48);
        const invTransition = transition > 0 ? 1 / transition : 0;

        const drawWaveContour = (
          wavelength: number,
          amplitude: number,
          phase: number,
          strokeWidth: number,
          cStart: string,
          cEnd: string,
        ) => {
          const k = (2 * Math.PI) / wavelength;
          ctx.beginPath();
          ctx.moveTo(pad, topY);
          for (let dx = 0; dx < playedW; dx += 2) {
            const envelope =
              invTransition > 0
                ? smootherstep(dx * invTransition) * smootherstep((playedW - dx) * invTransition)
                : 1;
            const y = topY - (0.5 + 0.5 * Math.sin(dx * k - phase)) * amplitude * envelope;
            ctx.lineTo(pad + dx, y);
          }
          ctx.lineTo(thumbX, topY);

          const grad = ctx.createLinearGradient(pad, 0, thumbX, 0);
          grad.addColorStop(0, cStart);
          grad.addColorStop(1, cEnd);
          ctx.strokeStyle = grad;
          ctx.lineWidth = strokeWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        };

        ctx.save();
        ctx.beginPath();
        ctx.rect(pad - trackPx, 0, playedW + trackPx * 2, CANVAS_H);
        ctx.clip();

        // Layer 1 (back, slow roll)
        drawWaveContour(
          168,
          amp1,
          wavePhase(clockSec, 3.0) + 2.1,
          1.1,
          `hsla(${hTertiary}, ${sat}%, ${lumHi}%, 0.36)`,
          `hsla(${hTertiary}, ${sat}%, ${lumLo}%, 0.26)`,
        );
        // Layer 2 (mid)
        drawWaveContour(
          132,
          amp2,
          wavePhase(clockSec, 2.2) + 1.1,
          1.3,
          `hsla(${hSecondary}, ${sat}%, ${lumLo}%, 0.58)`,
          `hsla(${hSecondary}, ${sat}%, ${lumHi}%, 0.5)`,
        );
        // Layer 3 (front, crisp)
        drawWaveContour(
          98,
          amp3,
          wavePhase(clockSec, 1.6),
          1.6,
          `hsla(${hPrimary}, ${sat}%, ${lumHi}%, 0.88)`,
          `hsla(${hPrimary}, ${sat}%, ${lumLo}%, 0.8)`,
        );

        // Straight horizontal played baseline
        const baseGrad = ctx.createLinearGradient(pad, 0, thumbX, 0);
        baseGrad.addColorStop(0, `hsl(${hPrimary}, ${sat}%, ${lumHi}%)`);
        baseGrad.addColorStop(0.6, `hsl(${hSecondary}, ${sat}%, ${lumMain}%)`);
        baseGrad.addColorStop(1, `hsl(${hPrimary}, ${sat}%, ${lumMain}%)`);
        ctx.beginPath();
        ctx.moveTo(pad, centerY);
        ctx.lineTo(thumbX, centerY);
        ctx.strokeStyle = baseGrad;
        ctx.lineWidth = trackPx;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.restore();
      }

      // 3. Clean orb thumb
      const thumbR = hoveredRef.current ? 6.5 : 5.5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(thumbX, centerY, thumbR + 3, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hPrimary}, ${sat}%, ${lumMain}%, 0.24)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(thumbX, centerY, thumbR, 0, Math.PI * 2);
      ctx.fillStyle = isNeutral
        ? (isLight ? '#111318' : '#ffffff')
        : `hsl(${hPrimary}, ${sat}%, ${isLight ? 48 : 74}%)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(thumbX, centerY, thumbR, 0, Math.PI * 2);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = isLight ? 'rgba(17, 19, 24, 0.35)' : 'rgba(255, 255, 255, 0.65)';
      ctx.stroke();
      ctx.restore();

      const stillSettling =
        Math.abs(amp1 - t1) > 0.05 ||
        Math.abs(amp2 - t2) > 0.05 ||
        Math.abs(amp3 - t3) > 0.05 ||
        Math.abs(targetPct - displayPct) > 0.0005;

      if (wavesActive || stillSettling) {
        running = true;
        rafId = requestAnimationFrame(draw);
      } else {
        running = false;
      }
    };

    const kick = () => {
      if (!running && !rafId) {
        lastNow = performance.now();
        rafId = requestAnimationFrame(draw);
      }
    };

    kickRef.current = kick;

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    return () => {
      kickRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Wake canvas for a single frame when paused and props change (never resets wave phase!)
  useEffect(() => {
    kickRef.current?.();
  }, [accentHex, isPlaying, pct, hovered, draggingPct]);

  const computePct = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 20) return 0;
    const pad = 10;
    return Math.max(0, Math.min(1, (clientX - rect.left - pad) / (rect.width - pad * 2)));
  };

  return (
    <div
      ref={wrapRef}
      className="cw-wavy-seekbar"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(pct * safeMax)}
      data-disabled={disabled}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraggingPct(computePct(e.clientX));
      }}
      onPointerMove={(e) => {
        if (draggingPct === null || disabled) return;
        setDraggingPct(computePct(e.clientX));
      }}
      onPointerUp={(e) => {
        if (draggingPct === null || disabled) return;
        const finalPct = computePct(e.clientX);
        setDraggingPct(null);
        onChange(Math.round(finalPct * safeMax));
      }}
      onPointerCancel={() => setDraggingPct(null)}
    >
      <canvas ref={canvasRef} className="cw-wavy-canvas" />
    </div>
  );
};
