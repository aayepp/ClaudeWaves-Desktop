import React, { useEffect, useRef } from 'react';

interface AndroidSplashProps {
  open: boolean;
  onDone: () => void;
}

const SPLASH_MS = 4000;

// 4-color brand palette matching ClaudeWaves Android ComicSplash.kt
const PORTAL_CYAN = '#0ECAE8';
const PORTAL_COBALT = '#267CFF';
const PORTAL_VIOLET = '#B05CFF';
const PORTAL_ROSE = '#FA4C6E';

const BASE_SPLASH = '#080C1C';
const MIST_CENTER = '#CCD6EC';
const MIST_EDGE = '#A8B8D6';
const MIDNIGHT_TOP = '#05070D';
const MIDNIGHT_MID = '#0A0E1C';
const MIDNIGHT_BOT = '#070913';
const INK_DARK = '#0A0F20';

const WORDMARK = 'ClaudeWaves';
const SUBTITLE = 'MUSIC STREAMING';

interface ContinentSpec {
  lonCenter: number;
  latCenter: number;
  sx: number;
  sy: number;
  seed: number;
  color: string;
}

interface EqBarSpec {
  cwXOff: number;
  cwYOff: number;
  cwHalfH: number;
  eqFreq: number;
  colTop: string;
  colMid: string;
  colBot: string;
}

interface RibbonSpec {
  startP: number;
  endP: number;
  glyphIdx: number;
  arcY: number;
  thick: number;
  color: string;
}

const CONTINENTS: ContinentSpec[] = [
  { lonCenter: -0.95, latCenter: -0.28, sx: 0.25, sy: 0.24, seed: 0.6, color: PORTAL_CYAN },
  { lonCenter: -0.68, latCenter: 0.34, sx: 0.18, sy: 0.24, seed: 1.4, color: PORTAL_ROSE },
  { lonCenter: 0.28, latCenter: -0.3, sx: 0.28, sy: 0.18, seed: 2.1, color: PORTAL_COBALT },
  { lonCenter: 0.38, latCenter: 0.24, sx: 0.22, sy: 0.26, seed: 0.9, color: PORTAL_ROSE },
  { lonCenter: 1.55, latCenter: -0.22, sx: 0.38, sy: 0.22, seed: 1.7, color: PORTAL_VIOLET },
  { lonCenter: 1.92, latCenter: 0.38, sx: 0.18, sy: 0.13, seed: 3.0, color: PORTAL_ROSE },
  { lonCenter: 2.85, latCenter: -0.15, sx: 0.24, sy: 0.16, seed: 2.6, color: PORTAL_CYAN },
];

const EQ_BARS: EqBarSpec[] = [
  { cwXOff: -61.5, cwYOff: 3.3, cwHalfH: 26.1, eqFreq: 1.1, colTop: '#2AB9EE', colMid: '#26B6EC', colBot: '#38A8E4' },
  { cwXOff: -41.3, cwYOff: 0.4, cwHalfH: 53.5, eqFreq: 1.4, colTop: '#2D94FC', colMid: '#3AA2EA', colBot: '#DA669A' },
  { cwXOff: -19.4, cwYOff: -52.5, cwHalfH: 20.0, eqFreq: 2.0, colTop: '#3080FF', colMid: '#3886FC', colBot: '#448CF6' },
  { cwXOff: -19.4, cwYOff: 52.5, cwHalfH: 20.0, eqFreq: 1.8, colTop: '#D66A9E', colMid: '#EE5C86', colBot: '#F6567A' },
  { cwXOff: 5.1, cwYOff: -66.0, cwHalfH: 17.5, eqFreq: 2.3, colTop: '#387AFF', colMid: '#427CFF', colBot: '#4E7EFC' },
  { cwXOff: 5.1, cwYOff: 66.0, cwHalfH: 17.0, eqFreq: 1.7, colTop: '#EA5E8A', colMid: '#F4587E', colBot: '#F85476' },
  { cwXOff: 29.5, cwYOff: -53.5, cwHalfH: 19.0, eqFreq: 2.1, colTop: '#6C70FF', colMid: '#7670FF', colBot: '#8070FC' },
  { cwXOff: 29.5, cwYOff: 53.5, cwHalfH: 19.0, eqFreq: 1.9, colTop: '#D062C4', colMid: '#D860BA', colBot: '#E05EAE' },
  { cwXOff: 51.8, cwYOff: -48.5, cwHalfH: 11.4, eqFreq: 1.4, colTop: '#946CFF', colMid: '#9A6CFF', colBot: '#A26AFC' },
  { cwXOff: 51.8, cwYOff: 48.5, cwHalfH: 11.4, eqFreq: 1.5, colTop: '#C664D8', colMid: '#CE62D0', colBot: '#D660C6' },
];

const RIBBONS: RibbonSpec[] = [
  { startP: 0.51, endP: 0.615, glyphIdx: 0, arcY: -40, thick: 6.4, color: PORTAL_CYAN },
  { startP: 0.538, endP: 0.645, glyphIdx: 2, arcY: -36, thick: 5.6, color: '#18A6F4' },
  { startP: 0.565, endP: 0.672, glyphIdx: 4, arcY: -44, thick: 5.8, color: PORTAL_COBALT },
  { startP: 0.592, endP: 0.702, glyphIdx: 6, arcY: -48, thick: 6.6, color: PORTAL_COBALT },
  { startP: 0.625, endP: 0.735, glyphIdx: 8, arcY: -38, thick: 5.6, color: PORTAL_VIOLET },
  { startP: 0.658, endP: 0.768, glyphIdx: 10, arcY: -34, thick: 5.2, color: PORTAL_ROSE },
  { startP: 0.69, endP: 0.785, glyphIdx: 10, arcY: 28, thick: 4.6, color: PORTAL_ROSE },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const splashSpan = (edge0: number, edge1: number, x: number) =>
  clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
const splashSmoothstep = (edge0: number, edge1: number, x: number) => {
  const t = splashSpan(edge0, edge1, x);
  return t * t * (3 - 2 * t);
};
const splashSmootherstep = (edge0: number, edge1: number, x: number) => {
  const t = splashSpan(edge0, edge1, x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const splashEaseOutCubic = (edge0: number, edge1: number, x: number) => {
  const u = 1 - splashSpan(edge0, edge1, x);
  return 1 - u * u * u;
};
const splashEaseInCubic = (edge0: number, edge1: number, x: number) => {
  const t = splashSpan(edge0, edge1, x);
  return t * t * t;
};
const splashEaseOutBackSoft = (edge0: number, edge1: number, x: number, overshoot = 0.9) => {
  const u = splashSpan(edge0, edge1, x) - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
};
const splashLerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const k = clamp01(t);
  return `rgb(${Math.round(splashLerp(r1, r2, k))}, ${Math.round(splashLerp(g1, g2, k))}, ${Math.round(splashLerp(b1, b2, k))})`;
}

function earthOrbScale(p: number): number {
  if (p < 0.045 || p > 0.385) return 0;
  if (p < 0.3) return splashEaseOutBackSoft(0.045, 0.125, p, 0.9);
  return 1 - splashSmootherstep(0.3, 0.382, p);
}

function headphonesEnvelope(p: number): number {
  return Math.max(
    0,
    Math.min(
      1.15,
      splashEaseOutBackSoft(0.068, 0.125, p, 0.85) * (1 - splashSmootherstep(0.268, 0.315, p)),
    ),
  );
}

function auroraBlobProgress(p: number): number {
  if (p < 0.635) return 0;
  if (p >= 0.79) return 1;
  return splashSmootherstep(0.635, 0.79, p);
}

function cwCurtainX(p: number, cx: number, unit: number): number {
  const boxSize = 485.6 * unit;
  const left = cx - boxSize * 0.5;
  const tC = splashSmootherstep(0.47, 0.595, p);
  return splashLerp(left + 0.35 * boxSize, left + 0.63 * boxSize, tC);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

const splashUnit = (w: number, h: number) =>
  Math.min(0.92, (Math.min(w, h) / 640) * 0.65);

function traceOrganicBlob(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  blobT: number,
) {
  const maxReach = Math.hypot(w, h) * 0.78;
  const rBase = splashLerp(0, maxReach, blobT);
  const unit = splashUnit(w, h);
  const bx = splashLerp(cx - 28 * unit, cx, blobT);
  const by = splashLerp(h * 0.484, h * 0.5, blobT);
  const rot = -0.25 + 0.55 * blobT;
  const steps = 72;
  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    const ang = (Math.PI * 2 * i) / steps;
    const lobe =
      1 +
      0.16 * Math.cos(2 * ang - 0.5) +
      0.1 * Math.sin(3 * ang + 0.8) +
      0.04 * Math.cos(4 * ang - 1.0);
    const r = rBase * lobe;
    const vx = bx + Math.cos(ang + rot) * r * 1.12;
    const vy = by + Math.sin(ang + rot) * r * 0.94;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
}

function drawEighthNote(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
) {
  const rx = size * 0.36;
  const ry = size * 0.27;
  const nx = cx - size * 0.16;
  const ny = cy + size * 0.3;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(nx, ny, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  const sx = nx + rx * 0.72;
  const stTop = cy - size * 0.52;
  const sw = Math.max(1.4, size * 0.14);
  ctx.strokeStyle = color;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, ny);
  ctx.lineTo(sx, stTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sx - sw * 0.3, stTop);
  ctx.lineTo(sx + size * 0.45, stTop + size * 0.24);
  ctx.lineTo(sx + size * 0.52, stTop + size * 0.52);
  ctx.lineTo(sx + size * 0.28, stTop + size * 0.34);
  ctx.lineTo(sx, stTop + size * 0.18);
  ctx.closePath();
  ctx.fill();
}

function drawBeamedNotes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color1: string,
  color2: string,
) {
  const rx = size * 0.28;
  const ry = size * 0.21;
  const n1x = cx - size * 0.36;
  const n1y = cy + size * 0.28;
  const n2x = cx + size * 0.22;
  const n2y = cy + size * 0.18;

  ctx.fillStyle = color1;
  ctx.beginPath();
  ctx.ellipse(n1x, n1y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color2;
  ctx.beginPath();
  ctx.ellipse(n2x, n2y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  const sw = Math.max(1.3, size * 0.12);
  const s1x = n1x + rx * 0.7;
  const s2x = n2x + rx * 0.7;
  const t1y = cy - size * 0.42;
  const t2y = cy - size * 0.52;

  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color1;
  ctx.beginPath();
  ctx.moveTo(s1x, n1y);
  ctx.lineTo(s1x, t1y);
  ctx.stroke();

  ctx.strokeStyle = color2;
  ctx.beginPath();
  ctx.moveTo(s2x, n2y);
  ctx.lineTo(s2x, t2y);
  ctx.stroke();

  const beamH = size * 0.17;
  ctx.fillStyle = color1;
  ctx.beginPath();
  ctx.moveTo(s1x - sw * 0.4, t1y);
  ctx.lineTo(s2x + sw * 0.4, t2y);
  ctx.lineTo(s2x + sw * 0.4, t2y + beamH);
  ctx.lineTo(s1x - sw * 0.4, t1y + beamH);
  ctx.closePath();
  ctx.fill();
}

function traceRibbon(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  arcH: number,
  thick: number,
  u: number,
  unit: number,
) {
  const env = Math.pow(Math.sin(u * Math.PI), 0.55);
  const w0 = Math.max(1.8 * unit, thick * env);
  const w1 = Math.max(1.0 * unit, 2.4 * unit * env);
  const steps = 19;
  ctx.beginPath();
  for (const dir of [1, -1]) {
    for (let sIdx = 0; sIdx <= steps; sIdx++) {
      const k = dir > 0 ? sIdx : steps - sIdx;
      const s = k / steps;
      const phase = clamp01(u * 0.68 + s * 0.32);
      const px = ax + splashLerp(-78, 22, phase) * unit;
      const py = ay + arcH * Math.sin(phase * Math.PI);
      const prevPhase = clamp01(u * 0.68 + (Math.max(0, k - 1) / steps) * 0.32);
      const nextPhase = clamp01(u * 0.68 + (Math.min(steps, k + 1) / steps) * 0.32);
      const dx = (nextPhase - prevPhase) * 100 * unit;
      const dySeg = arcH * (Math.sin(nextPhase * Math.PI) - Math.sin(prevPhase * Math.PI));
      const ln = Math.hypot(dx, dySeg) + 1e-4;
      const nx = (-dySeg / ln) * dir;
      const ny = (dx / ln) * dir;
      const r = Math.max(0.6 * unit, splashLerp(w0, w1, s) * Math.pow(Math.sin(s * Math.PI), 0.35));
      const vx = px + nx * r;
      const vy = py + ny * r;
      if (dir > 0 && k === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
  }
  ctx.closePath();
}

/**
 * 1:1 240Hz HTML5 Canvas port of ClaudeWaves Android ComicSplash.kt:
 * Slate-Titanium Mist + Rotating 3D Earth with Studio Headphones & Notes +
 * 10 Equalizer Pulse Bars -> CW Waveform Emblem -> Reverse-XOR Midnight Aurora + ClaudeWaves wordmark.
 */
export const AndroidSplash: React.FC<AndroidSplashProps> = ({ open, onDone }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const logoImg = new Image();
    logoImg.src = '/splash_logo.png';

    let rafId = 0;
    let finished = false;
    const startTs = performance.now();

    const finish = () => {
      if (finished) return;
      finished = true;
      if (rafId) cancelAnimationFrame(rafId);
      doneRef.current();
    };

    const drawEarthMusicOrb = (p: number, cx: number, cy: number, unit: number) => {
      const scale = earthOrbScale(p);
      const radius = 84 * unit * scale;
      if (radius <= 0.5) return;

      const drift = splashSmootherstep(0.305, 0.382, p);
      const beatGroove =
        Math.sin(p * 22) *
        1.15 *
        unit *
        splashSmoothstep(0.075, 0.13, p) *
        (1 - splashSmoothstep(0.265, 0.315, p));
      const orbCx = cx;
      const orbCy = cy + splashLerp(0, -28 * unit, drift) + beatGroove;

      if (radius < 11 * unit) {
        const dotAlpha = clamp01(radius / (11 * unit));
        ctx.fillStyle = rgba(PORTAL_COBALT, dotAlpha);
        ctx.beginPath();
        ctx.arc(orbCx, orbCy, radius, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      const pulse = 1 + 0.03 * Math.sin(p * 15);
      const haloRadius = radius * 1.29 * pulse;
      ctx.fillStyle = 'rgba(228, 236, 255, 0.78)';
      ctx.beginPath();
      ctx.arc(orbCx, orbCy, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      const haloGrad = ctx.createLinearGradient(
        orbCx - haloRadius,
        orbCy - haloRadius,
        orbCx + haloRadius,
        orbCy + haloRadius,
      );
      haloGrad.addColorStop(0, rgba(PORTAL_CYAN, 0.62));
      haloGrad.addColorStop(0.35, rgba(PORTAL_COBALT, 0.62));
      haloGrad.addColorStop(0.7, rgba(PORTAL_VIOLET, 0.62));
      haloGrad.addColorStop(1, rgba(PORTAL_ROSE, 0.62));
      ctx.strokeStyle = haloGrad;
      ctx.lineWidth = Math.max(1.6, radius * 0.026);
      ctx.beginPath();
      ctx.arc(orbCx, orbCy, haloRadius, 0, Math.PI * 2);
      ctx.stroke();

      if (p >= 0.075 && p <= 0.335) {
        const ripT = ((p - 0.075) / 0.13) % 1;
        const ripR = radius * (1.29 + 0.42 * ripT);
        const ripAlpha =
          0.52 * (1 - ripT) * Math.sin(ripT * Math.PI) * (1 - splashSmoothstep(0.285, 0.335, p));
        if (ripAlpha > 0.01) {
          ctx.strokeStyle = rgba(PORTAL_CYAN, ripAlpha);
          ctx.lineWidth = 1.8 * unit;
          ctx.beginPath();
          ctx.arc(orbCx, orbCy, ripR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const iconLineage = (1 - splashSmoothstep(0.048, 0.125, p)) * 0.55;
      const oceanBase = mixHex('#090F24', '#102052', iconLineage);

      ctx.save();
      ctx.beginPath();
      ctx.arc(orbCx, orbCy, radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = oceanBase;
      ctx.fillRect(orbCx - radius, orbCy - radius, radius * 2, radius * 2);

      const gTop = ctx.createRadialGradient(
        orbCx - radius * 0.32,
        orbCy - radius * 0.3,
        0,
        orbCx - radius * 0.32,
        orbCy - radius * 0.3,
        radius * 0.95,
      );
      gTop.addColorStop(0, rgba(PORTAL_COBALT, 0.46));
      gTop.addColorStop(0.65, rgba(PORTAL_CYAN, 0.22));
      gTop.addColorStop(1, 'transparent');
      ctx.fillStyle = gTop;
      ctx.fillRect(orbCx - radius, orbCy - radius, radius * 2, radius * 2);

      const gBot = ctx.createRadialGradient(
        orbCx + radius * 0.34,
        orbCy + radius * 0.34,
        0,
        orbCx + radius * 0.34,
        orbCy + radius * 0.34,
        radius * 0.95,
      );
      gBot.addColorStop(0, rgba(PORTAL_VIOLET, 0.42));
      gBot.addColorStop(0.65, rgba(PORTAL_ROSE, 0.22));
      gBot.addColorStop(1, 'transparent');
      ctx.fillStyle = gBot;
      ctx.fillRect(orbCx - radius, orbCy - radius, radius * 2, radius * 2);

      const spin = p * 4.6;
      ctx.lineWidth = Math.max(1, radius * 0.018);
      ctx.lineCap = 'round';
      for (let idx = 0; idx < 4; idx++) {
        let lon = (idx * Math.PI * 0.5 + spin) % (Math.PI * 2);
        if (lon > Math.PI) lon -= Math.PI * 2;
        if (Math.abs(lon) < Math.PI * 0.5) {
          ctx.beginPath();
          for (let k = 0; k <= 16; k++) {
            const lat = splashLerp(-Math.PI * 0.46, Math.PI * 0.46, k / 16);
            const mx = orbCx + Math.sin(lon) * Math.cos(lat) * radius;
            const my = orbCy + Math.sin(lat) * radius;
            if (k === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
          }
          ctx.strokeStyle = rgba(idx % 2 === 0 ? PORTAL_CYAN : PORTAL_VIOLET, 0.28);
          ctx.stroke();
        }
      }

      for (const cSpec of CONTINENTS) {
        let lon = (cSpec.lonCenter + spin) % (Math.PI * 2);
        if (lon > Math.PI) lon -= Math.PI * 2;
        if (Math.abs(lon) >= Math.PI * 0.56) continue;
        const px = orbCx + Math.sin(lon) * Math.cos(cSpec.latCenter) * radius * 0.94;
        const py = orbCy + Math.sin(cSpec.latCenter) * radius * 0.9;
        const foreshorten = Math.max(0.1, Math.cos(lon));
        ctx.beginPath();
        for (let k = 0; k < 24; k++) {
          const a = (Math.PI * 2 * k) / 24;
          const rad = 1 + 0.34 * Math.sin(2 * a + cSpec.seed) + 0.2 * Math.cos(3 * a - 0.6);
          const vx = px + Math.cos(a) * radius * cSpec.sx * rad * foreshorten;
          const vy = py + Math.sin(a) * radius * cSpec.sy * rad;
          if (k === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fillStyle = rgba(cSpec.color, 0.88);
        ctx.fill();
      }

      // 4-color equatorial soundwave ribbon
      const wavePhase = p * 10.5;
      const nWave = 36;
      ctx.beginPath();
      let started = false;
      for (const dir of [-1, 1]) {
        for (let stepIdx = 0; stepIdx < nWave; stepIdx++) {
          const i = dir < 0 ? stepIdx : nWave - 1 - stepIdx;
          const u = i / (nWave - 1);
          const lon = splashLerp(-Math.PI * 0.52, Math.PI * 0.52, u);
          const sx = orbCx + Math.sin(lon) * radius * 1.02;
          const waveVal =
            (Math.sin(lon * 2.4 + wavePhase) * 0.085 * radius +
              Math.cos(lon * 3.8 - wavePhase * 0.8) * 0.032 * radius) *
            Math.cos(lon * 0.7);
          const halfT = Math.max(1, radius * 0.034 * (0.45 + 0.55 * Math.cos(lon)));
          const wy = orbCy + 0.04 * radius + waveVal + dir * halfT;
          if (!started) {
            ctx.moveTo(sx, wy);
            started = true;
          } else {
            ctx.lineTo(sx, wy);
          }
        }
      }
      ctx.closePath();
      const eqWaveGrad = ctx.createLinearGradient(orbCx - radius, orbCy, orbCx + radius, orbCy);
      eqWaveGrad.addColorStop(0, rgba(PORTAL_CYAN, 0.92));
      eqWaveGrad.addColorStop(0.34, rgba(PORTAL_COBALT, 0.92));
      eqWaveGrad.addColorStop(0.68, rgba(PORTAL_VIOLET, 0.92));
      eqWaveGrad.addColorStop(1, rgba(PORTAL_ROSE, 0.92));
      ctx.fillStyle = eqWaveGrad;
      ctx.fill();

      ctx.strokeStyle = rgba('#A5F2FF', 0.65);
      ctx.lineWidth = Math.max(1.5, radius * 0.032);
      ctx.beginPath();
      ctx.arc(orbCx, orbCy, radius * 0.96, (190 * Math.PI) / 180, (275 * Math.PI) / 180);
      ctx.stroke();

      ctx.strokeStyle = rgba('#DC5AB0', 0.56);
      ctx.lineWidth = Math.max(1.4, radius * 0.028);
      ctx.beginPath();
      ctx.arc(orbCx, orbCy, radius * 0.96, (15 * Math.PI) / 180, (85 * Math.PI) / 180);
      ctx.stroke();

      ctx.restore();

      // Studio Headphones + Floating Music Notes
      const hpEnv = headphonesEnvelope(p);
      if (hpEnv > 0.02 && radius > 9 * unit) {
        const hpClamp = clamp01(hpEnv);
        const hpScale = splashLerp(0.86, 1, hpClamp);
        const hpAlpha = clamp01(hpEnv * 1.25);
        const bandR = radius * 1.15 * hpScale;
        const bandW = Math.max(2.5, radius * 0.105 * hpClamp);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(INK_DARK, hpAlpha);
        ctx.lineWidth = bandW;
        ctx.beginPath();
        ctx.ellipse(
          orbCx,
          orbCy,
          bandR,
          bandR * 0.98,
          0,
          (-172 * Math.PI) / 180,
          (-8 * Math.PI) / 180,
        );
        ctx.stroke();

        const bandGrad = ctx.createLinearGradient(
          orbCx - bandR,
          orbCy - bandR,
          orbCx + bandR,
          orbCy - bandR,
        );
        bandGrad.addColorStop(0, rgba(PORTAL_CYAN, hpAlpha * 0.92));
        bandGrad.addColorStop(0.5, rgba(PORTAL_COBALT, hpAlpha * 0.92));
        bandGrad.addColorStop(1, rgba(PORTAL_VIOLET, hpAlpha * 0.92));
        ctx.strokeStyle = bandGrad;
        ctx.lineWidth = Math.max(1.2, bandW * 0.32);
        ctx.beginPath();
        ctx.ellipse(
          orbCx,
          orbCy,
          bandR,
          bandR * 0.98,
          0,
          (-152 * Math.PI) / 180,
          (-28 * Math.PI) / 180,
        );
        ctx.stroke();

        const cupW = radius * 0.25 * hpClamp;
        const cupH = radius * 0.46 * hpClamp;
        for (const side of [-1, 1]) {
          const ecx = orbCx + side * radius * 1.05 * hpScale;
          const ecy = orbCy + radius * 0.04;
          ctx.fillStyle = rgba(INK_DARK, hpAlpha);
          roundRectPath(
            ctx,
            ecx - cupW * 0.6,
            ecy - cupH * 0.56,
            cupW * 1.2,
            cupH * 1.12,
            Math.min(cupW, cupH) * 0.48,
          );
          ctx.fill();

          const cushX = ecx - side * cupW * 0.28;
          ctx.fillStyle = rgba(side < 0 ? PORTAL_CYAN : PORTAL_ROSE, hpAlpha);
          roundRectPath(
            ctx,
            cushX - cupW * 0.22,
            ecy - cupH * 0.44,
            cupW * 0.44,
            cupH * 0.88,
            Math.max(1.5, cupW * 0.16),
          );
          ctx.fill();
        }

        const notesT = splashSmoothstep(0.08, 0.13, p) * (1 - splashSmoothstep(0.255, 0.302, p));
        if (notesT > 0.02) {
          const liftL = splashSmoothstep(0.08, 0.302, p) * radius * 0.3;
          drawEighthNote(
            ctx,
            orbCx - radius * 1.18,
            orbCy - radius * 0.78 - liftL,
            radius * 0.26,
            rgba(PORTAL_CYAN, 0.95 * notesT),
          );
          const liftR = splashSmoothstep(0.09, 0.302, p) * radius * 0.36;
          drawBeamedNotes(
            ctx,
            orbCx + radius * 1.24,
            orbCy - radius * 0.88 - liftR,
            radius * 0.27,
            rgba(PORTAL_VIOLET, 0.95 * notesT),
            rgba(PORTAL_ROSE, 0.95 * notesT),
          );

          const rip = ((p - 0.08) * 3.8) % 1;
          const arcAlpha = 0.62 * Math.sin(rip * Math.PI) * notesT;
          if (arcAlpha > 0.02) {
            const ar = radius * (1.36 + 0.18 * rip);
            ctx.lineWidth = Math.max(1.3, radius * 0.028);
            ctx.strokeStyle = rgba(PORTAL_CYAN, arcAlpha);
            ctx.beginPath();
            ctx.ellipse(orbCx, orbCy, ar, ar * 0.88, 0, (158 * Math.PI) / 180, (202 * Math.PI) / 180);
            ctx.stroke();

            ctx.strokeStyle = rgba(PORTAL_ROSE, arcAlpha);
            ctx.beginPath();
            ctx.ellipse(orbCx, orbCy, ar, ar * 0.88, 0, (-22 * Math.PI) / 180, (22 * Math.PI) / 180);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    };

    const drawEqualizerPulseBars = (p: number, cx: number, cy: number, unit: number) => {
      const cwCy = cy - 79.4 * unit;
      const curtainX = p >= 0.47 ? cwCurtainX(p, cx, unit) : -1e9;
      for (let idx = 0; idx < EQ_BARS.length; idx++) {
        const spec = EQ_BARS[idx];
        const stagger = idx * 0.006;
        const bt = splashSmootherstep(0.262 + stagger, 0.465 + stagger * 0.5, p);
        if (bt <= 0.005) continue;

        const startX = cx + (idx - 4.5) * 12.5 * unit;
        const startY = cy - Math.sin(bt * Math.PI) * 14 * unit;
        const arcX = -Math.sin(bt * Math.PI) * (1 - bt) * 22 * unit;
        const bx = splashLerp(startX, cx + spec.cwXOff * unit, bt) + arcX;
        const by = splashLerp(startY, cwCy + spec.cwYOff * unit, bt);

        const distPast = curtainX - bx;
        const barAlpha = clamp01(1 - splashSmootherstep(-8 * unit, 6 * unit, distPast));
        if (barAlpha <= 0.01) continue;

        const eqOsc = 0.55 + 0.65 * Math.abs(Math.sin(p * 24 * spec.eqFreq + idx * 0.85));
        const curHalfH = splashLerp(20 * eqOsc, spec.cwHalfH, splashSmootherstep(0, 1, bt)) * unit;
        const barHalfW = splashLerp(4.6, 6.6, bt) * unit;
        const topY = by - curHalfH;
        const botY = by + curHalfH;

        const grad = ctx.createLinearGradient(bx, topY, bx, botY);
        grad.addColorStop(0, rgba(spec.colTop, barAlpha));
        grad.addColorStop(0.5, rgba(spec.colMid, barAlpha));
        grad.addColorStop(1, rgba(spec.colBot, barAlpha));
        ctx.fillStyle = grad;
        roundRectPath(ctx, bx - barHalfW, topY, barHalfW * 2, curHalfH * 2, barHalfW);
        ctx.fill();
      }
    };

    const drawCwWriteOn = (p: number, cx: number, cy: number, unit: number) => {
      if (!logoImg.complete || logoImg.naturalWidth === 0) return;
      const boxSize = 485.6 * unit;
      const cwCy = cy - 79.4 * unit;
      const left = cx - boxSize * 0.5;
      const top = cwCy - boxSize * 0.5;

      const wRect = { x: left + 0.478 * boxSize, y: top + 0.438 * boxSize, w: 0.162 * boxSize, h: 0.132 * boxSize };
      const lDot = { x: left + 0.31 * boxSize, y: top + 0.478 * boxSize, w: 0.04 * boxSize, h: 0.042 * boxSize };
      const rDot = { x: left + 0.646 * boxSize, y: top + 0.476 * boxSize, w: 0.042 * boxSize, h: 0.042 * boxSize };

      const tC = splashSmootherstep(0.47, 0.595, p);
      const tW = splashSmootherstep(0.555, 0.648, p);
      const tD = splashEaseOutBackSoft(0.59, 0.668, p, 1.15);

      if (tC >= 0.999 && tW >= 0.999 && Math.abs(tD - 1) < 0.01 && p > 0.672) {
        ctx.drawImage(logoImg, left, top, boxSize, boxSize);
        return;
      }

      // 1. Outer C ring & wave bars column-by-column reveal (evenodd cutout excludes W & flanking dots)
      if (tC > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, boxSize, boxSize);
        ctx.rect(wRect.x, wRect.y, wRect.w, wRect.h);
        ctx.rect(lDot.x, lDot.y, lDot.w, lDot.h);
        ctx.rect(rDot.x, rDot.y, rDot.w, rDot.h);
        ctx.clip('evenodd');
        if (tC < 0.999) {
          const xStart = left + 0.35 * boxSize;
          const xEnd = left + 0.63 * boxSize;
          const xCur = splashLerp(xStart, xEnd, tC);
          ctx.beginPath();
          ctx.rect(xStart, top, xCur - xStart, boxSize);
          ctx.clip();
        }
        ctx.drawImage(logoImg, left, top, boxSize, boxSize);
        ctx.restore();
      }

      // 2. Inner W smooth rounded-capsule wipe
      if (tW > 0) {
        ctx.save();
        const xLim = tW >= 0.999 ? wRect.x + wRect.w : splashLerp(wRect.x, wRect.x + wRect.w + 8 * unit, tW);
        roundRectPath(
          ctx,
          wRect.x,
          wRect.y,
          Math.max(1, Math.min(wRect.x + wRect.w + 4 * unit, xLim) - wRect.x),
          wRect.h,
          12 * unit,
        );
        ctx.clip();
        ctx.beginPath();
        ctx.rect(wRect.x, wRect.y, wRect.w, wRect.h);
        ctx.clip();
        ctx.drawImage(logoImg, left, top, boxSize, boxSize);
        ctx.restore();
      }

      // 3. Left & Right flanking dots pop
      if (tD > 0.01) {
        const dScale = Math.max(0.05, Math.min(1.15, tD));
        ctx.save();
        ctx.translate(cx, cwCy);
        ctx.scale(dScale, dScale);
        ctx.translate(-cx, -cwCy);
        ctx.beginPath();
        ctx.rect(lDot.x, lDot.y, lDot.w, lDot.h);
        ctx.rect(rDot.x, rDot.y, rDot.w, rDot.h);
        ctx.clip();
        ctx.drawImage(logoImg, left, top, boxSize, boxSize);
        ctx.restore();
      }
    };

    const drawWordmarkAndRibbons = (
      p: number,
      cx: number,
      cy: number,
      unit: number,
      inkColor: string,
    ) => {
      const fontSize = 72 * unit;
      ctx.save();
      ctx.font = `italic 850 ${fontSize}px Inter, -apple-system, "Segoe UI", sans-serif`;
      ctx.textBaseline = 'middle';

      const widths: number[] = [];
      const offsets: number[] = [];
      let totalW = 0;
      for (let i = 0; i < WORDMARK.length; i++) {
        const ch = WORDMARK[i];
        const adv = ctx.measureText(ch).width;
        widths.push(adv);
        offsets.push(totalW);
        totalW += adv + (ch === 'e' && i === 5 ? 1.5 * unit : -2.0 * unit);
      }
      totalW += 2 * unit;

      const wordCy = cy + 83.6 * unit;
      const startX = cx - totalW * 0.5;
      const topY = wordCy - fontSize * 0.55;
      const botY = wordCy + fontSize * 0.52;
      const glyphH = Math.max(16 * unit, botY - topY);

      const wavesStartX = startX + offsets[6];
      const wavesGrad = ctx.createLinearGradient(wavesStartX, 0, startX + totalW, 0);
      wavesGrad.addColorStop(0, PORTAL_CYAN);
      wavesGrad.addColorStop(0.34, PORTAL_COBALT);
      wavesGrad.addColorStop(0.68, PORTAL_VIOLET);
      wavesGrad.addColorStop(1, PORTAL_ROSE);

      for (let i = 0; i < WORDMARK.length; i++) {
        const t0 = 0.535 + i * 0.018;
        const gt = clamp01((p - t0) / 0.062);
        if (gt <= 0) continue;

        ctx.fillStyle =
          i < 6 ? (i === 5 ? mixHex(inkColor, PORTAL_CYAN, 0.22) : inkColor) : wavesGrad;

        const gx0 = startX + offsets[i];
        const gw = Math.max(10 * unit, widths[i]);
        const gEase = splashSmootherstep(0, 1, gt);
        const dy = (1 - splashEaseOutBackSoft(0, 1, gt, 0.85)) * 6 * unit;

        if (gEase >= 0.998) {
          ctx.fillText(WORDMARK[i], gx0, wordCy - dy);
        } else {
          const origX = splashLerp(gx0, gx0 + gw * 0.5, gEase * 0.6);
          const origY = i % 2 === 0 ? topY : botY;
          const rad = Math.hypot(gw, glyphH) * 1.35 * gEase;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(origX + rad * 0.1, origY, rad * 1.05, rad * 1.05, 0, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillText(WORDMARK[i], gx0, wordCy - dy);
          ctx.restore();
        }
      }

      // Tapered calligraphic motion ribbons gliding over ClaudeWaves
      for (const spec of RIBBONS) {
        if (p < spec.startP || p > spec.endP) continue;
        const u = splashSmootherstep(spec.startP, spec.endP, p);
        const idx = Math.min(WORDMARK.length - 1, Math.max(0, spec.glyphIdx));
        const ax = startX + offsets[idx] + widths[idx] * 0.5;
        const ay = spec.arcY < 0 ? topY : botY;
        traceRibbon(ctx, ax, ay, spec.arcY * unit, spec.thick * unit, u, unit);
        ctx.fillStyle = spec.color;
        ctx.fill();
      }
      ctx.restore();
    };

    const drawLightStage = (p: number, w: number, h: number, cx: number, cy: number, unit: number) => {
      const drawMistBase = () => {
        ctx.fillStyle = MIST_EDGE;
        ctx.fillRect(0, 0, w, h);
        const mistGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 560 * unit);
        mistGrad.addColorStop(0, MIST_CENTER);
        mistGrad.addColorStop(0.68, rgba(MIST_CENTER, 0.55));
        mistGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = mistGrad;
        ctx.fillRect(0, 0, w, h);
      };

      if (p < 0.092) {
        ctx.fillStyle = BASE_SPLASH;
        ctx.fillRect(0, 0, w, h);
        const iconWashAlpha = splashSmoothstep(0.002, 0.04, p);
        if (iconWashAlpha > 0.005) {
          const g1 = ctx.createRadialGradient(w * 0.25, h * 0.3, 0, w * 0.25, h * 0.3, w * 0.65);
          g1.addColorStop(0, rgba(PORTAL_COBALT, 0.26 * iconWashAlpha));
          g1.addColorStop(1, 'transparent');
          ctx.fillStyle = g1;
          ctx.fillRect(0, 0, w, h);

          const g2 = ctx.createRadialGradient(w * 0.75, h * 0.7, 0, w * 0.75, h * 0.7, w * 0.65);
          g2.addColorStop(0, rgba(PORTAL_VIOLET, 0.22 * iconWashAlpha));
          g2.addColorStop(1, 'transparent');
          ctx.fillStyle = g2;
          ctx.fillRect(0, 0, w, h);
        }

        const irisT = splashSmootherstep(0.012, 0.092, p);
        const irisR = splashLerp(0, Math.hypot(w, h) * 0.75, irisT);
        if (irisR > 1) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, irisR, irisR * 1.25, 0, 0, Math.PI * 2);
          ctx.clip();
          drawMistBase();
          drawEarthMusicOrb(p, cx, cy, unit);
          ctx.restore();
        }
      } else {
        drawMistBase();
        drawEarthMusicOrb(p, cx, cy, unit);
      }

      if (p >= 0.255 && p <= 0.595) drawEqualizerPulseBars(p, cx, cy, unit);
      if (p >= 0.47) drawCwWriteOn(p, cx, cy, unit);
      if (p >= 0.51) drawWordmarkAndRibbons(p, cx, cy, unit, INK_DARK);
    };

    const drawDarkAuroraStage = (p: number, w: number, h: number, cx: number, cy: number, unit: number) => {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, MIDNIGHT_TOP);
      bg.addColorStop(0.5, MIDNIGHT_MID);
      bg.addColorStop(1, MIDNIGHT_BOT);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const gTop = ctx.createRadialGradient(w * 0.22, h * 0.3, 0, w * 0.22, h * 0.3, w * 0.72);
      gTop.addColorStop(0, rgba(PORTAL_COBALT, 0.3));
      gTop.addColorStop(1, 'transparent');
      ctx.fillStyle = gTop;
      ctx.fillRect(0, 0, w, h);

      const gBot = ctx.createRadialGradient(w * 0.78, h * 0.72, 0, w * 0.78, h * 0.72, w * 0.72);
      gBot.addColorStop(0, rgba(PORTAL_VIOLET, 0.28));
      gBot.addColorStop(1, 'transparent');
      ctx.fillStyle = gBot;
      ctx.fillRect(0, 0, w, h);

      if (p >= 0.635) {
        const ga = splashSmoothstep(0.635, 0.79, p) * 0.24;
        const glowCy = cy - 79.4 * unit;
        const pts: Array<[number, number, number, string, number]> = [
          [cx, glowCy - 36 * unit, 185 * unit, PORTAL_COBALT, ga],
          [cx - 48 * unit, glowCy, 165 * unit, PORTAL_CYAN, ga * 0.85],
          [cx + 36 * unit, glowCy, 175 * unit, PORTAL_VIOLET, ga * 0.9],
          [cx, glowCy + 42 * unit, 165 * unit, PORTAL_ROSE, ga * 0.85],
        ];
        for (const [gx, gy, gr, gcol, alpha] of pts) {
          const rad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          rad.addColorStop(0, rgba(gcol, alpha));
          rad.addColorStop(1, 'transparent');
          ctx.fillStyle = rad;
          ctx.fillRect(0, 0, w, h);
        }
      }

      if (p >= 0.255 && p <= 0.595) drawEqualizerPulseBars(p, cx, cy, unit);
      if (p >= 0.47) drawCwWriteOn(p, cx, cy, unit);
      if (p >= 0.51) drawWordmarkAndRibbons(p, cx, cy, unit, '#FFFFFF');
    };

    const drawSubtitle = (p: number, cx: number, cy: number, unit: number) => {
      const subT = splashSmootherstep(0.76, 0.845, p);
      if (subT <= 0.01) return;
      const fontSize = 14.5 * unit;
      const subY = cy + 159.6 * unit + (1 - splashEaseOutCubic(0.76, 0.845, p)) * 10 * unit;
      ctx.save();
      ctx.globalAlpha = subT;
      ctx.font = `620 ${fontSize}px Inter, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = `${(9 * unit).toFixed(1)}px`;
      const grad = ctx.createLinearGradient(cx - 140 * unit, 0, cx + 140 * unit, 0);
      grad.addColorStop(0, '#82E8F8');
      grad.addColorStop(0.34, '#8AB4FF');
      grad.addColorStop(0.68, '#CCA0FF');
      grad.addColorStop(1, '#FF98AE');
      ctx.fillStyle = grad;
      ctx.fillText(SUBTITLE, cx, subY);
      ctx.restore();
    };

    const drawFrame = (now: number) => {
      if (finished) return;
      const elapsed = now - startTs;
      const p = clamp01(elapsed / SPLASH_MS);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const cx = w * 0.5;
      const cy = h * 0.49;
      const unit = splashUnit(w, h);

      const exitT = splashSmootherstep(0.945, 1.0, p);
      const exitZoom = splashLerp(1, 1.055, exitT);

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = 1 - exitT;
      ctx.translate(cx, cy);
      ctx.scale(exitZoom, exitZoom);
      ctx.translate(-cx, -cy);

      const blobP = auroraBlobProgress(p);
      if (blobP <= 0) {
        drawLightStage(p, w, h, cx, cy, unit);
      } else if (blobP >= 1) {
        drawDarkAuroraStage(p, w, h, cx, cy, unit);
      } else {
        // Light stage outside organic blob, Midnight Aurora stage inside blob (Reverse-XOR)
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        traceOrganicBlob(ctx, w, h, cx, blobP);
        // Combine outer rect and inner blob cleanly using evenodd clipping for outside region
        ctx.restore();

        // Draw outside region with evenodd rule:
        ctx.save();
        ctx.beginPath();
        const maxReach = Math.hypot(w, h) * 0.78;
        const rBase = splashLerp(0, maxReach, blobP);
        const bx = splashLerp(cx - 28 * unit, cx, blobP);
        const by = splashLerp(h * 0.484, h * 0.5, blobP);
        const rot = -0.25 + 0.55 * blobP;
        ctx.rect(0, 0, w, h);
        for (let i = 0; i < 72; i++) {
          const ang = (Math.PI * 2 * i) / 72;
          const lobe =
            1 +
            0.16 * Math.cos(2 * ang - 0.5) +
            0.1 * Math.sin(3 * ang + 0.8) +
            0.04 * Math.cos(4 * ang - 1.0);
          const r = rBase * lobe;
          const vx = bx + Math.cos(ang + rot) * r * 1.12;
          const vy = by + Math.sin(ang + rot) * r * 0.94;
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.clip('evenodd');
        drawLightStage(p, w, h, cx, cy, unit);
        ctx.restore();

        // Draw inside aurora blob:
        ctx.save();
        traceOrganicBlob(ctx, w, h, cx, blobP);
        ctx.clip();
        drawDarkAuroraStage(p, w, h, cx, cy, unit);
        ctx.restore();
      }

      if (p >= 0.76) drawSubtitle(p, cx, cy, unit);

      // Opening CW logo mark fading out cleanly into Earth iris
      const openingAlpha = 1 - splashSmoothstep(0.018, 0.072, p);
      if (openingAlpha > 0.01 && p < 0.08 && logoImg.complete && logoImg.naturalWidth > 0) {
        const openingScale = splashLerp(1, 0.24, splashEaseInCubic(0, 0.075, p));
        const markSize = 310 * unit * openingScale;
        ctx.save();
        ctx.globalAlpha = openingAlpha;
        ctx.drawImage(logoImg, cx - markSize * 0.5, cy - markSize * 0.5, markSize, markSize);
        ctx.restore();
      }

      ctx.restore();

      if (p >= 1) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="cw-android-splash"
      role="button"
      tabIndex={0}
      aria-label="ClaudeWaves Launch Screen (click to skip)"
      onClick={onDone}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') onDone();
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};
