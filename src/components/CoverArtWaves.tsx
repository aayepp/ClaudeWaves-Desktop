import React, { useEffect, useMemo, useRef } from 'react';

interface CoverArtWavesProps {
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  isPlaying: boolean;
  colorHex: string;
  isDark: boolean;
  variant: 'side' | 'full';
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

function parseHexToHsl(input: string): HslColor {
  let clean = (input || '').trim().replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    clean = '60a5fa';
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hsla(h: number, s: number, l: number, a: number): string {
  const hue = ((h % 360) + 360) % 360;
  return `hsla(${hue}, ${s}%, ${l}%, ${a.toFixed(3)})`;
}

export const CoverArtWaves: React.FC<CoverArtWavesProps> = ({
  analyserRef,
  isPlaying,
  colorHex,
  isDark,
  variant,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const energyRef = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    phase: 0,
  });

  const palette = useMemo(() => {
    const base = parseHexToHsl(colorHex);
    const satA = Math.max(60, base.s);
    const satB = Math.max(62, base.s);
    const satC = Math.max(58, base.s);
    return [
      { h: base.h, s: satA, l: isDark ? 60 : 44 },
      { h: (base.h + 28) % 360, s: satB, l: isDark ? 68 : 48 },
      { h: (base.h + 334) % 360, s: satC, l: isDark ? 72 : 52 },
    ] as const;
  }, [colorHex, isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let width = canvas.clientWidth || (variant === 'side' ? 320 : 460);
    let height = canvas.clientHeight || (variant === 'side' ? 200 : 320);

    const freqData = new Uint8Array(64);

    const syncCanvasSize = () => {
      const cw = canvas.clientWidth || width;
      const ch = canvas.clientHeight || height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cw;
      height = ch;
      const targetW = Math.max(1, Math.round(cw * dpr));
      const targetH = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const avgBins = (start: number, end: number) => {
      let sum = 0;
      const count = Math.max(1, end - start + 1);
      for (let i = start; i <= end; i++) {
        sum += freqData[i] ?? 0;
      }
      return sum / (count * 255);
    };

    const drawFrame = (now: number) => {
      if (disposed) return;

      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;
      const frameScale = dt * 60;

      const st = energyRef.current;
      let targetBass = 0;
      let targetMid = 0;
      let targetTreble = 0;

      if (isPlaying) {
        const analyser = analyserRef.current;
        if (analyser) {
          analyser.getByteFrequencyData(freqData);
          const b = Math.min(1, Math.pow(avgBins(0, 5), 0.84));
          const m = Math.min(1, Math.pow(avgBins(6, 18), 0.84));
          const tr = Math.min(1, Math.pow(avgBins(19, 35), 0.84));

          const breathe = 0.095 + 0.025 * Math.sin(st.phase * 1.15);
          targetBass = b > 0.03 ? b : breathe;
          targetMid = m > 0.03 ? m : breathe * 0.92;
          targetTreble = tr > 0.03 ? tr : breathe * 0.86;
        } else {
          const breathe = 0.1 + 0.02 * Math.sin(st.phase * 1.15);
          targetBass = breathe;
          targetMid = breathe * 0.94;
          targetTreble = breathe * 0.88;
        }
      }

      const stepSmooth = (cur: number, target: number) => {
        const baseRate = target > cur ? 0.34 : 0.11;
        const rate = 1 - Math.pow(1 - baseRate, frameScale);
        return cur + (target - cur) * rate;
      };

      st.bass = stepSmooth(st.bass, targetBass);
      st.mid = stepSmooth(st.mid, targetMid);
      st.treble = stepSmooth(st.treble, targetTreble);

      if (isPlaying || Math.max(st.bass, st.mid, st.treble) >= 0.004) {
        st.phase += dt * (1.7 + st.bass * 2.8);
      }

      syncCanvasSize();
      ctx.clearRect(0, 0, width, height);

      const peakEnergy = Math.max(st.bass, st.mid, st.treble);
      if (!isPlaying && peakEnergy < 0.004) {
        rafId = 0;
        return;
      }

      ctx.save();
      ctx.globalCompositeOperation = isDark ? 'screen' : 'source-over';

      // Soft bass-reactive radial aura anchored behind cover center
      const cx = width * 0.5;
      const cy = height * 0.5;
      const baseRadius = Math.min(width, height) * (variant === 'side' ? 0.36 : 0.34);
      const auraRadius = baseRadius * (1 + st.bass * 0.55);
      const auraAlpha = Math.min(0.42, (isDark ? 0.12 : 0.09) + st.bass * (isDark ? 0.28 : 0.22));
      const auraColor = palette[0];
      const radial = ctx.createRadialGradient(cx, cy, baseRadius * 0.18, cx, cy, auraRadius);
      radial.addColorStop(0, hsla(auraColor.h, auraColor.s, auraColor.l, auraAlpha));
      radial.addColorStop(0.55, hsla(auraColor.h, auraColor.s, auraColor.l, auraAlpha * 0.42));
      radial.addColorStop(1, hsla(auraColor.h, auraColor.s, auraColor.l, 0));
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3 harmonious silk ribbon layers
      const isSide = variant === 'side';
      const maxAmp = height * (isSide ? 0.21 : 0.175);
      const layers = [
        {
          color: palette[0],
          energy: st.bass,
          freq: 1.55,
          speed: 0.9,
          phaseOffset: 0.0,
          yShift: -height * 0.035,
          ampScale: 1.0,
          thickness: isSide ? 16 : 22,
          peakAlpha: isDark ? 0.34 : 0.26,
          crestAlpha: isDark ? 0.72 : 0.58,
        },
        {
          color: palette[1],
          energy: st.mid,
          freq: 2.2,
          speed: 1.18,
          phaseOffset: 2.1,
          yShift: height * 0.015,
          ampScale: 0.88,
          thickness: isSide ? 12 : 17,
          peakAlpha: isDark ? 0.3 : 0.23,
          crestAlpha: isDark ? 0.68 : 0.54,
        },
        {
          color: palette[2],
          energy: st.treble,
          freq: 3.05,
          speed: 1.48,
          phaseOffset: 4.3,
          yShift: height * 0.045,
          ampScale: 0.72,
          thickness: isSide ? 9 : 13,
          peakAlpha: isDark ? 0.26 : 0.2,
          crestAlpha: isDark ? 0.62 : 0.5,
        },
      ];

      const steps = isSide ? 76 : 96;
      const stepX = width / steps;

      for (let lIdx = 0; lIdx < layers.length; lIdx++) {
        const layer = layers[lIdx];
        const envPower = 0.2 + layer.energy * 0.95;
        const amp = maxAmp * layer.ampScale * envPower;
        const bandHalf = layer.thickness * (0.42 + layer.energy * 0.78);
        const centerY = cy + layer.yShift;

        const upperPts: Array<{ x: number; y: number }> = [];
        const lowerPts: Array<{ x: number; y: number }> = [];

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = i * stepX;
          const envelope = Math.pow(Math.sin(Math.PI * t), 0.85);
          const wave =
            Math.sin(t * layer.freq * Math.PI * 2 + st.phase * layer.speed + layer.phaseOffset) +
            0.45 * Math.sin(t * layer.freq * 1.9 * Math.PI * 2 - st.phase * 0.8 + layer.phaseOffset * 0.7) +
            0.22 * Math.sin(t * layer.freq * 3.1 * Math.PI * 2 + st.phase * 1.4);

          const crestY = centerY + (wave / 1.67) * amp * envelope;
          const thicknessMod = bandHalf * (0.55 + 0.45 * envelope) * (0.85 + 0.15 * Math.cos(t * 7 + st.phase));
          upperPts.push({ x, y: crestY - thicknessMod * 0.55 });
          lowerPts.push({ x, y: crestY + thicknessMod * 0.7 });
        }

        const fillPeak = Math.min(0.48, layer.peakAlpha * (0.35 + layer.energy * 0.85));
        const fillGrad = ctx.createLinearGradient(0, 0, width, 0);
        fillGrad.addColorStop(0, hsla(layer.color.h, layer.color.s, layer.color.l, 0));
        fillGrad.addColorStop(0.16, hsla(layer.color.h, layer.color.s, layer.color.l, fillPeak));
        fillGrad.addColorStop(0.84, hsla(layer.color.h, layer.color.s, layer.color.l, fillPeak));
        fillGrad.addColorStop(1, hsla(layer.color.h, layer.color.s, layer.color.l, 0));

        ctx.beginPath();
        ctx.moveTo(upperPts[0].x, upperPts[0].y);
        for (let i = 1; i < upperPts.length; i++) {
          ctx.lineTo(upperPts[i].x, upperPts[i].y);
        }
        for (let i = lowerPts.length - 1; i >= 0; i--) {
          ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();

        const crestPeak = Math.min(0.86, layer.crestAlpha * (0.32 + layer.energy * 0.85));
        const strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
        strokeGrad.addColorStop(0, hsla(layer.color.h, layer.color.s, layer.color.l, 0));
        strokeGrad.addColorStop(0.16, hsla(layer.color.h, layer.color.s, layer.color.l, crestPeak));
        strokeGrad.addColorStop(0.84, hsla(layer.color.h, layer.color.s, layer.color.l, crestPeak));
        strokeGrad.addColorStop(1, hsla(layer.color.h, layer.color.s, layer.color.l, 0));

        ctx.beginPath();
        ctx.moveTo(upperPts[0].x, upperPts[0].y);
        for (let i = 1; i < upperPts.length; i++) {
          ctx.lineTo(upperPts[i].x, upperPts[i].y);
        }
        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      ctx.restore();

      if (isPlaying || Math.max(st.bass, st.mid, st.treble) >= 0.004) {
        rafId = requestAnimationFrame(drawFrame);
      } else {
        rafId = 0;
      }
    };

    const scheduleIfNeeded = () => {
      if (!rafId && !disposed) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    const ro = new ResizeObserver(() => {
      syncCanvasSize();
      if (!isPlaying && !rafId) {
        drawFrame(performance.now());
      }
    });
    ro.observe(canvas);

    syncCanvasSize();
    if (isPlaying || Math.max(energyRef.current.bass, energyRef.current.mid, energyRef.current.treble) >= 0.004) {
      scheduleIfNeeded();
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    return () => {
      disposed = true;
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [analyserRef, isPlaying, palette, isDark, variant]);

  return (
    <canvas
      ref={canvasRef}
      className="cw-art-waves-canvas"
      data-variant={variant}
      aria-hidden="true"
    />
  );
};
