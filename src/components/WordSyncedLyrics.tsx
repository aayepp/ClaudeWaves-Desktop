import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Languages, RotateCcw, Share2, Timer } from 'lucide-react';
import { usePlaybackPositionMs } from '../hooks/playbackClock';
import type {
  LyricLine,
  LyricsBounceStyle,
  LyricsDisplayMode,
  LyricsFontSize,
  LyricsResult,
  LyricsTranslateLang,
} from '../types';

interface WordSyncedLyricsProps {
  lyrics: LyricsResult;
  offsetMs: number;
  displayMode: LyricsDisplayMode;
  autoRomanize?: boolean;
  translateLang?: LyricsTranslateLang;
  large?: boolean;
  fontSize?: LyricsFontSize;
  bounceStyle?: LyricsBounceStyle;
  onDisplayModeChange: (mode: LyricsDisplayMode) => void;
  onToggleAutoRomanize?: () => void;
  onCycleTranslateLang?: () => void;
  onOpenQuoteModal?: () => void;
  onOffsetChange: (nextMs: number) => void;
  onSeekTo: (ms: number) => void;
}

interface LyricLineRowProps {
  line: LyricLine;
  isActive: boolean;
  isPast: boolean;
  activeMs: number; // -1 for inactive rows so React.memo skips non-active lines!
  wordMode: boolean;
  showRomanized: boolean;
  showTranslated: boolean;
  large: boolean;
  offsetMs: number;
  onSeekTo: (ms: number) => void;
  lineRef?: React.Ref<HTMLDivElement>;
}

const LyricLineRow = React.memo<LyricLineRowProps>(
  ({ line, isActive, isPast, activeMs, wordMode, showRomanized, showTranslated, large, offsetMs, onSeekTo, lineRef }) => {
    const words = wordMode && line.words && line.words.length > 0 ? line.words : null;
    const cls = large ? 'cw-full-lyric-line' : 'cw-side-lyric-line';
    const romLine = showRomanized && line.romanized ? (
      <div className="cw-lyric-romanized">{line.romanized}</div>
    ) : null;
    const transLine = showTranslated && line.translated ? (
      <div className="cw-lyric-translated">{line.translated}</div>
    ) : null;

    if (!words) {
      return (
        <div
          ref={lineRef}
          className={cls}
          data-active={isActive}
          data-past={isPast}
          onClick={() => onSeekTo(Math.max(0, line.timeMs - offsetMs))}
        >
          <div>{line.text}</div>
          {romLine}
          {transLine}
        </div>
      );
    }

    return (
      <div
        ref={lineRef}
        className={cls}
        data-active={isActive}
        data-past={isPast}
        onClick={() => onSeekTo(Math.max(0, line.timeMs - offsetMs))}
      >
        <div>
          {words.map((w, wi) => {
            let state: 'idle' | 'filling' | 'sung' = 'idle';
            let fillStyle: React.CSSProperties | undefined;

            if (isPast) {
              state = 'sung';
            } else if (isActive && activeMs >= 0) {
              const dur = Math.max(80, w.endMs - w.startMs);
              if (activeMs >= w.endMs) {
                state = 'sung';
              } else if (activeMs >= w.startMs) {
                const linear = Math.max(0, Math.min(1, (activeMs - w.startMs) / dur));
                // Android ModernLyricsKaraokeCanvas ease-out sweep (1 - (1 - t)^1.4)
                const p = 1 - Math.pow(1 - linear, 1.4);
                const pct = Math.round(p * 100);
                state = 'filling';
                fillStyle = { '--cw-fill': `${pct}%` } as React.CSSProperties;
              }
            }

            return (
              <React.Fragment key={`${w.startMs}-${wi}`}>
                <span
                  className="cw-lyric-word"
                  data-state={state}
                  style={fillStyle}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeekTo(Math.max(0, w.startMs - offsetMs));
                  }}
                >
                  {w.text}
                </span>
                {wi < words.length - 1 ? ' ' : ''}
              </React.Fragment>
            );
          })}
        </div>
        {romLine}
        {transLine}
      </div>
    );
  },
);

/**
 * Scale-aware vertical center target inside the scrollable lyrics container.
 * Uses getBoundingClientRect divided by current transform scale so entrance
 * animations (e.g. .cw-fullplayer scale(0.16)) never skew scroll positioning.
 */
function computeTargetTop(container: HTMLDivElement, el: HTMLDivElement): number | null {
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  if (cRect.height <= 0 || container.clientHeight <= 0) return null;
  const scaleY = cRect.height / container.clientHeight;
  const elCenterInContent =
    (eRect.top - cRect.top) / scaleY + container.scrollTop + (eRect.height / scaleY) / 2;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  return Math.max(0, Math.min(maxScroll, elCenterInContent - container.clientHeight / 2));
}

/**
 * 240Hz Synced Lyrics Viewer:
 * - Toggle between clean Sentence-by-Sentence mode and Apple/Android smooth Karaoke Word Sweep
 * - Memoized row rendering + scale-safe GPU rAF scroll centering
 * - Per-track Lyrics Sync Offset adjuster (-10s..+10s)
 */
export const WordSyncedLyrics: React.FC<WordSyncedLyricsProps> = ({
  lyrics,
  offsetMs,
  displayMode,
  autoRomanize = true,
  translateLang = 'off',
  large = false,
  fontSize = 'normal',
  bounceStyle = 'expressive',
  onDisplayModeChange,
  onToggleAutoRomanize,
  onCycleTranslateLang,
  onOpenQuoteModal,
  onOffsetChange,
  onSeekTo,
}) => {
  const positionMs = usePlaybackPositionMs();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimRef = useRef<number>(0);
  const manualPauseUntilRef = useRef<number>(0);
  const hasSnappedRef = useRef<boolean>(false);
  const [offsetOpen, setOffsetOpen] = useState(false);

  const effectiveMs = Math.max(0, positionMs + offsetMs);

  const activeLineIndex = useMemo(() => {
    if (lyrics.kind !== 'synced') return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].timeMs <= effectiveMs + 120) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, effectiveMs]);

  const scrollToActiveLine = useCallback((immediate: boolean) => {
    const container = scrollRef.current;
    const el = activeLineRef.current;
    if (!container || !el) return;

    const targetTop = computeTargetTop(container, el);
    if (targetTop === null) return;

    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = 0;
    }

    if (immediate) {
      container.scrollTop = targetTop;
      return;
    }

    let current = container.scrollTop;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const diff = targetTop - current;
      if (Math.abs(diff) < 0.5) {
        container.scrollTop = targetTop;
        scrollAnimRef.current = 0;
        return;
      }
      current += diff * (1 - Math.exp(-8.5 * dt));
      container.scrollTop = current;
      scrollAnimRef.current = requestAnimationFrame(step);
    };

    scrollAnimRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    hasSnappedRef.current = false;
  }, [lyrics]);

  useEffect(() => {
    if (performance.now() < manualPauseUntilRef.current) return;
    if (!scrollRef.current || !activeLineRef.current) return;

    const immediate = !hasSnappedRef.current;
    hasSnappedRef.current = true;
    scrollToActiveLine(immediate);

    return () => {
      if (scrollAnimRef.current) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = 0;
      }
    };
  }, [activeLineIndex, lyrics, fontSize, autoRomanize, translateLang, large, scrollToActiveLine]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (performance.now() < manualPauseUntilRef.current) return;
      scrollToActiveLine(false);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [lyrics.kind, scrollToActiveLine]);

  const cancelAutoScroll = () => {
    manualPauseUntilRef.current = performance.now() + 2600;
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = 0;
    }
  };

  const nudgeOffset = (delta: number) => {
    const next = Math.max(-10000, Math.min(10000, offsetMs + delta));
    onOffsetChange(next);
  };

  if (lyrics.kind === 'idle') {
    return (
      <div className="cw-muted" style={{ padding: 24, textAlign: 'center' }}>
        Play a song to view synced lyrics.
      </div>
    );
  }
  if (lyrics.kind === 'loading') {
    return (
      <div className="cw-muted" style={{ padding: 24, textAlign: 'center' }}>
        Fetching lyrics...
      </div>
    );
  }
  if (lyrics.kind === 'empty') {
    return (
      <div className="cw-muted" style={{ padding: 24, textAlign: 'center' }}>
        No lyrics found for this track.
      </div>
    );
  }
  if (lyrics.kind === 'instrumental') {
    return (
      <div className="cw-muted" style={{ padding: 24, textAlign: 'center' }}>
        Instrumental track.
      </div>
    );
  }
  if (lyrics.kind === 'plain') {
    const plainLines = lyrics.text.split(/\r?\n/);
    const romLines = lyrics.romanizedLines;
    const transLines = lyrics.translatedLines;
    const hasRom = Boolean(autoRomanize && romLines && romLines.some(Boolean));
    const hasTrans = Boolean(translateLang !== 'off' && transLines && transLines.some(Boolean));
    const transLabel = translateLang === 'ms' ? 'BM' : translateLang === 'en' ? 'EN' : 'Trans';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {(onToggleAutoRomanize || onCycleTranslateLang || onOpenQuoteModal) && (
          <div className="cw-lyrics-toolbar">
            <span className="cw-lyric-source-tag" style={{ margin: 0, padding: 0 }}>
              Plain Lyrics
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {onToggleAutoRomanize && (
                <button
                  type="button"
                  className="cw-offset-toggle-pill"
                  data-active={autoRomanize}
                  onClick={onToggleAutoRomanize}
                  data-tip="Auto-romanize non-Latin lyrics"
                >
                  <span>Aa Romaji</span>
                </button>
              )}
              {onCycleTranslateLang && (
                <button
                  type="button"
                  className="cw-offset-toggle-pill"
                  data-active={translateLang !== 'off'}
                  onClick={onCycleTranslateLang}
                  data-tip="Translate Lyrics (Off / BM / EN)"
                >
                  <Languages size={11} />
                  <span>{transLabel}</span>
                </button>
              )}
              {onOpenQuoteModal && (
                <button
                  type="button"
                  className="cw-offset-toggle-pill"
                  onClick={onOpenQuoteModal}
                  data-tip="Export Lyric Quote Card (PNG)"
                >
                  <Share2 size={11} />
                  <span>Quote</span>
                </button>
              )}
            </div>
          </div>
        )}
        <div
          className="cw-plain-lyrics-wrap"
          style={{ fontSize: large ? 18 : 14 }}
        >
          {plainLines.map((ln, idx) => (
            <div key={idx} className="cw-plain-lyric-row">
              <div>{ln || '\u00A0'}</div>
              {hasRom && romLines?.[idx] && (
                <div className="cw-lyric-romanized">{romLines[idx]}</div>
              )}
              {hasTrans && transLines?.[idx] && (
                <div className="cw-lyric-translated">{transLines[idx]}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const offsetLabel =
    offsetMs === 0 ? 'Sync 0ms' : `Sync ${offsetMs > 0 ? '+' : ''}${offsetMs}ms`;
  const transLabel = translateLang === 'ms' ? 'BM' : translateLang === 'en' ? 'EN' : 'Trans';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="cw-lyrics-toolbar">
        <span className="cw-lyric-source-tag" style={{ margin: 0, padding: 0 }}>
          {lyrics.source || 'Synced'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div className="cw-lyrics-mode-pills" role="tablist" aria-label="Lyrics display style">
            <button
              type="button"
              className="cw-lyrics-mode-btn"
              data-active={displayMode === 'sentence'}
              onClick={() => onDisplayModeChange('sentence')}
            >
              Sentence
            </button>
            <button
              type="button"
              className="cw-lyrics-mode-btn"
              data-active={displayMode === 'word'}
              onClick={() => onDisplayModeChange('word')}
            >
              Word
            </button>
          </div>
          {onToggleAutoRomanize && (
            <button
              type="button"
              className="cw-offset-toggle-pill"
              data-active={autoRomanize}
              onClick={onToggleAutoRomanize}
              data-tip="Auto-romanize non-Latin lyrics"
            >
              <span>Aa Romaji</span>
            </button>
          )}
          {onCycleTranslateLang && (
            <button
              type="button"
              className="cw-offset-toggle-pill"
              data-active={translateLang !== 'off'}
              onClick={onCycleTranslateLang}
              data-tip="Translate Lyrics (Off / BM / EN)"
            >
              <Languages size={11} />
              <span>{transLabel}</span>
            </button>
          )}
          {onOpenQuoteModal && (
            <button
              type="button"
              className="cw-offset-toggle-pill"
              onClick={onOpenQuoteModal}
              data-tip="Export Lyric Quote Card (PNG)"
            >
              <Share2 size={11} />
              <span>Quote</span>
            </button>
          )}
          <button
            type="button"
            className="cw-offset-toggle-pill"
            data-active={offsetOpen || offsetMs !== 0}
            onClick={() => setOffsetOpen((v) => !v)}
            data-tip="Adjust lyrics timing offset"
          >
            <Timer size={12} />
            <span>{offsetLabel}</span>
          </button>
        </div>
      </div>

      {offsetOpen && (
        <div className="cw-offset-bar">
          <div className="cw-offset-btns">
            <button type="button" className="cw-offset-btn" onClick={() => nudgeOffset(-1000)}>
              −1s
            </button>
            <button type="button" className="cw-offset-btn" onClick={() => nudgeOffset(-250)}>
              −250ms
            </button>
            <button
              type="button"
              className="cw-offset-btn"
              onClick={() => onOffsetChange(0)}
              data-tip="Reset to 0ms"
            >
              <RotateCcw size={11} /> 0
            </button>
            <button type="button" className="cw-offset-btn" onClick={() => nudgeOffset(250)}>
              +250ms
            </button>
            <button type="button" className="cw-offset-btn" onClick={() => nudgeOffset(1000)}>
              +1s
            </button>
          </div>
          <input
            type="range"
            min={-10000}
            max={10000}
            step={50}
            value={offsetMs}
            onChange={(e) => onOffsetChange(Number(e.target.value))}
            className="cw-offset-slider"
            aria-label="Lyrics sync offset milliseconds"
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className={large ? 'cw-fullplayer-lyrics' : 'cw-side-lyrics'}
        data-size={fontSize}
        data-bounce={bounceStyle}
        data-mode={displayMode}
        onWheel={cancelAutoScroll}
        onTouchStart={cancelAutoScroll}
      >
        {lyrics.lines.map((line, idx) => {
          const isActive = idx === activeLineIndex;
          const isPast = idx < activeLineIndex;
          return (
            <LyricLineRow
              key={`${line.timeMs}-${idx}`}
              line={line}
              isActive={isActive}
              isPast={isPast}
              activeMs={isActive && displayMode === 'word' ? effectiveMs : -1}
              wordMode={displayMode === 'word'}
              showRomanized={autoRomanize}
              showTranslated={translateLang !== 'off'}
              large={large}
              offsetMs={offsetMs}
              onSeekTo={onSeekTo}
              lineRef={isActive ? activeLineRef : undefined}
            />
          );
        })}
      </div>
    </div>
  );
};
