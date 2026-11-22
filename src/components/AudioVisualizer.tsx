import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  isPlaying: boolean;
  accentHex: string;
  barCount?: number;
  height?: number;
  className?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  analyserRef,
  isPlaying,
  accentHex,
  barCount = 32,
  height = 36,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const data = new Uint8Array(64);
    const smoothed = new Float32Array(barCount);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(data);
      } else {
        data.fill(0);
      }

      const gap = 3;
      const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);

      ctx.fillStyle = accentHex;
      for (let i = 0; i < barCount; i++) {
        const bin = Math.min(data.length - 1, Math.floor((i / barCount) * 36) + 1);
        const target = isPlaying ? Math.max(0.08, data[bin] / 255) : 0.06;
        smoothed[i] += (target - smoothed[i]) * 0.28;
        const barH = Math.max(3, smoothed[i] * h);
        const x = i * (barW + gap);
        const y = h - barH;
        const r = Math.min(barW / 2, barH / 2);

        ctx.globalAlpha = 0.28 + smoothed[i] * 0.68;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, r);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (isPlaying) {
        rafId = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [analyserRef, isPlaying, accentHex, barCount]);

  return (
    <canvas
      ref={canvasRef}
      width={barCount * 7}
      height={height}
      className={`cw-visualizer ${className}`}
      aria-hidden="true"
    />
  );
};
