import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassButton, GlassCard } from '@zakisheriff/liquid-glass';
import { Check, Copy, Download, Sparkles, X } from 'lucide-react';
import type { LyricsResult, LyricsTranslateLang, Track } from '../types';

type QuoteCardStyle = 'aura' | 'glass' | 'cream' | 'comic';
type QuoteAspect = '4:5' | '9:16';

interface SelectableLyricRow {
  idx: number;
  text: string;
  romanized?: string;
  translated?: string;
  timeMs?: number;
}

interface LyricQuoteModalProps {
  open: boolean;
  track: Track | null;
  lyrics: LyricsResult;
  activeMs: number;
  offsetMs: number;
  autoRomanize: boolean;
  translateLang: LyricsTranslateLang;
  accentHex: string;
  intensity: number;
  onClose: () => void;
  onToast: (msg: string) => void;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return [text.trim()];
  const out: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const cand = `${line} ${words[i]}`;
    if (ctx.measureText(cand).width <= maxWidth) {
      line = cand;
    } else {
      out.push(line);
      line = words[i];
    }
  }
  out.push(line);
  return out;
}

export const LyricQuoteModal: React.FC<LyricQuoteModalProps> = ({
  open,
  track,
  lyrics,
  activeMs,
  offsetMs,
  autoRomanize,
  translateLang,
  accentHex,
  intensity,
  onClose,
  onToast,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [cardStyle, setCardStyle] = useState<QuoteCardStyle>('aura');
  const [aspect, setAspect] = useState<QuoteAspect>('4:5');
  const [showRoman, setShowRoman] = useState(true);
  const [showTrans, setShowTrans] = useState(true);
  const [copied, setCopied] = useState(false);
  const [coverBitmap, setCoverBitmap] = useState<HTMLImageElement | null>(null);

  const rows = useMemo<SelectableLyricRow[]>(() => {
    if (lyrics.kind === 'synced') {
      return lyrics.lines
        .map((ln, idx) => ({
          idx,
          text: ln.text.trim(),
          romanized: ln.romanized,
          translated: ln.translated,
          timeMs: ln.timeMs,
        }))
        .filter((r) => Boolean(r.text));
    }
    if (lyrics.kind === 'plain') {
      return lyrics.text
        .split(/\r?\n/)
        .map((line, idx) => ({
          idx,
          text: line.trim(),
          romanized: lyrics.romanizedLines?.[idx] ?? undefined,
          translated: lyrics.translatedLines?.[idx] ?? undefined,
        }))
        .filter((r) => Boolean(r.text));
    }
    return [];
  }, [lyrics]);

  const hasRoman = useMemo(() => rows.some((r) => Boolean(r.romanized)), [rows]);
  const hasTrans = useMemo(() => rows.some((r) => Boolean(r.translated)), [rows]);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setShowRoman(autoRomanize);
    setShowTrans(translateLang !== 'off');

    if (rows.length === 0) {
      setSelectedIndices([]);
      return;
    }
    let anchor = 0;
    if (lyrics.kind === 'synced') {
      const effective = activeMs + offsetMs;
      let bestIdx = 0;
      rows.forEach((r, i) => {
        if ((r.timeMs ?? 0) <= effective + 120) bestIdx = i;
      });
      anchor = bestIdx;
    }
    const picked = [
      rows[anchor]?.idx,
      rows[anchor + 1]?.idx,
    ].filter((v): v is number => v !== undefined);
    setSelectedIndices(picked.length > 0 ? picked : [rows[0].idx]);
  }, [open, track?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !track?.thumbnailUrl) {
      setCoverBitmap(null);
      return;
    }
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (alive) setCoverBitmap(img);
    };
    img.onerror = () => {
      if (alive) setCoverBitmap(null);
    };
    img.src = track.thumbnailUrl;
    return () => {
      alive = false;
    };
  }, [open, track?.thumbnailUrl]);

  const selectedRows = useMemo(
    () =>
      rows
        .filter((r) => selectedIndices.includes(r.idx))
        .slice(0, 4),
    [rows, selectedIndices],
  );

  const toggleIndex = (idx: number) => {
    setSelectedIndices((prev) => {
      if (prev.includes(idx)) {
        return prev.length > 1 ? prev.filter((i) => i !== idx) : prev;
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), idx].sort((a, b) => a - b);
      }
      return [...prev, idx].sort((a, b) => a - b);
    });
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track) return;
    const width = 1080;
    const height = aspect === '9:16' ? 1920 : 1350;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cleanAccent = accentHex && accentHex !== 'neutral' ? accentHex : '#38BDF8';
    ctx.clearRect(0, 0, width, height);

    // Background layer
    if (cardStyle === 'cream') {
      ctx.fillStyle = '#F6F0E4';
      ctx.fillRect(0, 0, width, height);
    } else if (cardStyle === 'comic') {
      ctx.fillStyle = '#FFE45E';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(17, 19, 24, 0.08)';
      for (let gx = 20; gx < width; gx += 34) {
        for (let gy = 20; gy < height; gy += 34) {
          ctx.beginPath();
          ctx.arc(gx, gy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.fillStyle = '#090B12';
      ctx.fillRect(0, 0, width, height);
      if (coverBitmap && cardStyle === 'aura') {
        ctx.save();
        ctx.filter = 'blur(72px) saturate(1.7) brightness(0.45)';
        ctx.drawImage(coverBitmap, -80, -80, width + 160, height + 160);
        ctx.restore();
      }
      const grad = ctx.createRadialGradient(
        width * 0.25,
        height * 0.2,
        40,
        width * 0.5,
        height * 0.55,
        height * 0.72,
      );
      grad.addColorStop(0, `${cleanAccent}44`);
      grad.addColorStop(0.55, 'rgba(10, 12, 18, 0.62)');
      grad.addColorStop(1, 'rgba(6, 8, 12, 0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Inner Card Frame
    const marginX = 76;
    const marginY = aspect === '9:16' ? 140 : 88;
    const cardW = width - marginX * 2;
    const cardH = height - marginY * 2;

    if (cardStyle === 'comic') {
      drawRoundedRect(ctx, marginX + 14, marginY + 14, cardW, cardH, 36);
      ctx.fillStyle = '#111318';
      ctx.fill();
    }

    drawRoundedRect(ctx, marginX, marginY, cardW, cardH, 36);
    if (cardStyle === 'cream') {
      ctx.fillStyle = '#FFFDF7';
      ctx.fill();
      ctx.strokeStyle = 'rgba(24, 24, 28, 0.14)';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (cardStyle === 'comic') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#111318';
      ctx.lineWidth = 7;
      ctx.stroke();
    } else {
      ctx.fillStyle = cardStyle === 'glass' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(12, 14, 20, 0.58)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    const inkPrimary = cardStyle === 'cream' || cardStyle === 'comic' ? '#111318' : '#FFFFFF';
    const inkMuted = cardStyle === 'cream' || cardStyle === 'comic' ? 'rgba(17, 19, 24, 0.66)' : 'rgba(255, 255, 255, 0.68)';
    const quoteAccent = cardStyle === 'comic' ? '#D22018' : cardStyle === 'cream' ? '#B45309' : cleanAccent;

    // Header: Cover + Track Info
    const pad = 64;
    const artSize = 112;
    const headerX = marginX + pad;
    const headerY = marginY + pad;

    ctx.save();
    drawRoundedRect(ctx, headerX, headerY, artSize, artSize, 22);
    ctx.clip();
    if (coverBitmap) {
      ctx.drawImage(coverBitmap, headerX, headerY, artSize, artSize);
    } else {
      ctx.fillStyle = quoteAccent;
      ctx.fillRect(headerX, headerY, artSize, artSize);
    }
    ctx.restore();

    if (cardStyle === 'comic') {
      drawRoundedRect(ctx, headerX, headerY, artSize, artSize, 22);
      ctx.strokeStyle = '#111318';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    ctx.fillStyle = inkPrimary;
    ctx.font = '800 34px "Segoe UI", Inter, sans-serif';
    ctx.fillText(track.title.slice(0, 32), headerX + artSize + 28, headerY + 48);

    ctx.fillStyle = inkMuted;
    ctx.font = '600 25px "Segoe UI", Inter, sans-serif';
    ctx.fillText(track.artist.slice(0, 40), headerX + artSize + 28, headerY + 88);

    // Selected Lyric Lines Block
    const contentW = cardW - pad * 2;
    const bodyTop = headerY + artSize + 64;
    const bodyBottom = marginY + cardH - 110;
    const lineCount = Math.max(1, selectedRows.length);
    const mainFontSize = lineCount <= 2 ? 48 : 38;
    const mainLineHeight = lineCount <= 2 ? 62 : 50;

    // Measure total block height to center vertically inside body area
    const renderedBlocks: Array<{
      main: string[];
      roman: string[];
      trans: string[];
    }> = [];

    let totalBlockHeight = 0;
    for (const r of selectedRows) {
      ctx.font = `800 ${mainFontSize}px "Segoe UI", Inter, sans-serif`;
      const mainWrapped = wrapText(ctx, r.text, contentW);
      let blockH = mainWrapped.length * mainLineHeight;

      let romanWrapped: string[] = [];
      if (showRoman && r.romanized) {
        ctx.font = 'italic 600 25px "Segoe UI", Inter, sans-serif';
        romanWrapped = wrapText(ctx, r.romanized, contentW);
        blockH += romanWrapped.length * 32 + 6;
      }

      let transWrapped: string[] = [];
      if (showTrans && r.translated) {
        ctx.font = '600 25px "Segoe UI", Inter, sans-serif';
        transWrapped = wrapText(ctx, r.translated, contentW);
        blockH += transWrapped.length * 32 + 6;
      }

      renderedBlocks.push({ main: mainWrapped, roman: romanWrapped, trans: transWrapped });
      totalBlockHeight += blockH + 26;
    }

    const availH = Math.max(200, bodyBottom - bodyTop);
    let cursorY = bodyTop + Math.max(0, (availH - totalBlockHeight) / 2);

    // Decorative quote mark
    ctx.fillStyle = quoteAccent;
    ctx.font = '900 72px Georgia, serif';
    ctx.fillText('“', headerX - 4, Math.max(bodyTop + 26, cursorY - 12));

    for (const blk of renderedBlocks) {
      ctx.fillStyle = inkPrimary;
      ctx.font = `800 ${mainFontSize}px "Segoe UI", Inter, sans-serif`;
      for (const ln of blk.main) {
        cursorY += mainLineHeight;
        if (cursorY > bodyBottom) break;
        ctx.fillText(ln, headerX, cursorY);
      }
      if (blk.roman.length > 0) {
        cursorY += 8;
        ctx.fillStyle = quoteAccent;
        ctx.font = 'italic 600 25px "Segoe UI", Inter, sans-serif';
        for (const ln of blk.roman) {
          cursorY += 32;
          if (cursorY > bodyBottom) break;
          ctx.fillText(ln, headerX, cursorY);
        }
      }
      if (blk.trans.length > 0) {
        cursorY += 6;
        ctx.fillStyle = inkMuted;
        ctx.font = '600 25px "Segoe UI", Inter, sans-serif';
        for (const ln of blk.trans) {
          cursorY += 32;
          if (cursorY > bodyBottom) break;
          ctx.fillText(ln, headerX, cursorY);
        }
      }
      cursorY += 28;
    }

    // Footer branding
    const footerY = marginY + cardH - pad;
    ctx.fillStyle = quoteAccent;
    ctx.beginPath();
    ctx.arc(headerX + 8, footerY - 8, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = inkMuted;
    ctx.font = '700 22px "Segoe UI", Inter, sans-serif';
    ctx.fillText('ClaudeWaves Desktop', headerX + 26, footerY);
  }, [track, aspect, cardStyle, accentHex, coverBitmap, selectedRows, showRoman, showTrans]);

  useEffect(() => {
    if (open) renderCanvas();
  }, [open, renderCanvas]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !track) return null;

  const handleDownload = () => {
    renderCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const slug = track.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'lyric';
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `claudewaves-quote-${slug}.png`;
    a.click();
    onToast('Lyric Quote Card PNG downloaded!');
  };

  const handleCopy = () => {
    renderCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        onToast('Lyric Quote Card copied to clipboard!');
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        onToast('Clipboard unavailable — click Download PNG instead.');
      }
    }, 'image/png');
  };

  return (
    <div
      className="cw-modal-backdrop cw-quote-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Export Lyric Quote Card"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cw-quote-modal cw-comic-frame">
        <GlassCard intensity={intensity} padding="20px 22px" radius="24px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="var(--cw-accent)" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>Lyric Quote Card Exporter</div>
                  <div className="cw-muted" style={{ fontSize: 12 }}>
                    Pilih 1–4 baris lirik untuk dikongsi sebagai gambar PNG berkualiti tinggi
                  </div>
                </div>
              </div>
              <button type="button" className="cw-skin-icon-btn" aria-label="Close" onClick={onClose}>
                <X size={16} />
              </button>
            </div>

            <div className="cw-quote-grid">
              {/* Left: Line picker + Style controls */}
              <div className="cw-quote-controls">
                <div className="cw-muted" style={{ fontSize: 11.5, fontWeight: 700 }}>
                  PILIH BARIS ({selectedRows.length}/4)
                </div>
                <div className="cw-quote-line-picker">
                  {rows.length === 0 ? (
                    <div className="cw-muted" style={{ padding: 18, textAlign: 'center', fontSize: 12.5 }}>
                      Tiada lirik tersedia untuk lagu ini.
                    </div>
                  ) : (
                    rows.map((r) => {
                      const picked = selectedIndices.includes(r.idx);
                      return (
                        <button
                          key={r.idx}
                          type="button"
                          className="cw-quote-line-item"
                          data-active={picked}
                          onClick={() => toggleIndex(r.idx)}
                        >
                          <div style={{ fontWeight: picked ? 700 : 500, fontSize: 13 }}>{r.text}</div>
                          {r.romanized && (
                            <div className="cw-lyric-romanized" style={{ marginTop: 1 }}>
                              {r.romanized}
                            </div>
                          )}
                          {r.translated && (
                            <div className="cw-lyric-translated" style={{ marginTop: 1 }}>
                              {r.translated}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="cw-muted" style={{ fontSize: 11.5, fontWeight: 700 }}>GAYA KAD</div>
                  <div className="cw-chips">
                    {(
                      [
                        ['aura', 'Cover Aura'],
                        ['glass', 'Glass Dark'],
                        ['cream', 'Vinyl Cream'],
                        ['comic', 'Comic Pop'],
                      ] as Array<[QuoteCardStyle, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className="cw-mood-chip"
                        style={{ padding: '4px 10px', fontSize: 11.5 }}
                        data-active={cardStyle === id}
                        onClick={() => setCardStyle(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div className="cw-chips">
                    {(
                      [
                        ['4:5', '4:5 Feed'],
                        ['9:16', '9:16 Story'],
                      ] as Array<[QuoteAspect, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className="cw-mood-chip"
                        style={{ padding: '4px 10px', fontSize: 11.5 }}
                        data-active={aspect === id}
                        onClick={() => setAspect(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    {hasRoman && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <input type="checkbox" checked={showRoman} onChange={(e) => setShowRoman(e.target.checked)} />
                        <span>Romaji</span>
                      </label>
                    )}
                    {hasTrans && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <input type="checkbox" checked={showTrans} onChange={(e) => setShowTrans(e.target.checked)} />
                        <span>Terjemahan</span>
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Live Canvas Preview */}
              <div className="cw-quote-preview-col">
                <canvas ref={canvasRef} className="cw-quote-canvas-preview" />
                <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
                  <GlassButton
                    size="sm"
                    variant="glass"
                    intensity={intensity}
                    disabled={selectedRows.length === 0}
                    icon={copied ? <Check size={14} /> : <Copy size={14} />}
                    onClick={handleCopy}
                  >
                    {copied ? 'Copied!' : 'Copy PNG'}
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="filled"
                    tint={accentHex}
                    intensity={intensity}
                    disabled={selectedRows.length === 0}
                    icon={<Download size={14} />}
                    onClick={handleDownload}
                  >
                    Download PNG
                  </GlassButton>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
