import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Maximize2, Mic2, Minimize2, Move, X } from 'lucide-react';
import { getPlaybackPositionMs, subscribePlaybackPosition } from '../hooks/playbackClock';

export interface FloatingVideoBox {
  x: number;
  y: number;
  width: number;
}

export function getDefaultFloatingVideoBox(): FloatingVideoBox {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const width = Math.min(820, Math.max(420, Math.round(vw * 0.56)));
  const height = Math.round((width * 9) / 16);
  return {
    x: Math.max(16, Math.round((vw - width) / 2)),
    y: Math.max(16, Math.round((vh - height) / 2)),
    width,
  };
}

function clampFloatingBox(box: FloatingVideoBox): FloatingVideoBox {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.max(360, Math.min(1280, vw - 24));
  const width = Math.max(360, Math.min(maxW, Math.round(box.width)));
  const height = Math.round((width * 9) / 16);
  const maxX = Math.max(12, vw - width - 12);
  const maxY = Math.max(12, vh - height - 12);
  return {
    width,
    x: Math.max(12, Math.min(maxX, Math.round(box.x))),
    y: Math.max(12, Math.min(maxY, Math.round(box.y))),
  };
}

interface SyncedVideoPlayerProps {
  videoId: string;
  title: string;
  artist?: string;
  isPlaying: boolean;
  playbackRate: number;
  quality: number;
  mode: 'fullscreen' | 'pip';
  box?: FloatingVideoBox;
  onBoxChange?: (next: FloatingVideoBox) => void;
  onQualityChange: (q: number) => void;
  onClose: () => void;
  onExpandLyricsFullscreen?: (currentBox: FloatingVideoBox) => void;
}

interface VideoMeta {
  resolvedVideoId?: string;
  tier?: number;
  height: number;
  width?: number;
  fps?: number;
  bitrateKbps?: number;
  codec?: string;
  availableHeights: number[];
  mimeType?: string;
  proxyUrl: string;
}

const QUALITY_CHOICES = [480, 720, 1080];

/**
 * Audio-locked Music Video player (VP9 WebM / AV1 for universal Electron Chromium playback).
 * - External clock sync (zero React re-renders during playback)
 * - Cinema blur backdrop in popup mode (click anywhere outside to dismiss)
 * - Free drag + 16:9 corner resize + True Fullscreen & Fullscreen Lyrics buttons + Live resolution readout
 */
export const SyncedVideoPlayer: React.FC<SyncedVideoPlayerProps> = ({
  videoId,
  title,
  artist = '',
  isPlaying,
  playbackRate,
  quality,
  mode,
  box: controlledBox,
  onBoxChange,
  onQualityChange,
  onClose,
  onExpandLyricsFullscreen,
}) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backdropPressedRef = useRef(false);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [decodedRes, setDecodedRes] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTrueFullscreen, setIsTrueFullscreen] = useState(false);
  const [cinemaFullFallback, setCinemaFullFallback] = useState(false);
  const [localBox, setLocalBox] = useState<FloatingVideoBox>(getDefaultFloatingVideoBox);
  const manualMovedRef = useRef(false);

  const activeBox = controlledBox ?? localBox;
  const activeBoxRef = useRef(activeBox);
  activeBoxRef.current = activeBox;

  const updateBox = useCallback(
    (next: FloatingVideoBox) => {
      if (onBoxChange) onBoxChange(next);
      else setLocalBox(next);
    },
    [onBoxChange],
  );

  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;
  const rateRef = useRef(playbackRate);
  rateRef.current = playbackRate;

  const interactionRef = useRef<
    | {
        kind: 'drag' | 'resize-se' | 'resize-sw';
        pointerId: number;
        startX: number;
        startY: number;
        origin: FloatingVideoBox;
      }
    | null
  >(null);

  const activeFull = isTrueFullscreen || cinemaFullFallback;

  useEffect(() => {
    const onFsChange = () => {
      const full = Boolean(frameRef.current && document.fullscreenElement === frameRef.current);
      setIsTrueFullscreen(full);
      if (full) setCinemaFullFallback(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (mode !== 'pip') return;
    const onResize = () => {
      updateBox(
        manualMovedRef.current
          ? clampFloatingBox(activeBoxRef.current)
          : getDefaultFloatingVideoBox(),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mode, updateBox]);

  const exitFullscreenIfNeeded = useCallback(() => {
    if (frameRef.current && document.fullscreenElement === frameRef.current) {
      document.exitFullscreen().catch(() => {});
    }
    setCinemaFullFallback(false);
  }, []);

  const handleClose = useCallback(() => {
    exitFullscreenIfNeeded();
    onClose();
  }, [exitFullscreenIfNeeded, onClose]);

  const handleExpandLyrics = useCallback(() => {
    exitFullscreenIfNeeded();
    onExpandLyricsFullscreen?.(activeBoxRef.current);
  }, [exitFullscreenIfNeeded, onExpandLyricsFullscreen]);

  const toggleTrueFullscreen = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      document.exitFullscreen().catch(() => {});
      setCinemaFullFallback(false);
    } else if (cinemaFullFallback) {
      setCinemaFullFallback(false);
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setCinemaFullFallback(true));
    } else {
      setCinemaFullFallback(true);
    }
  }, [cinemaFullFallback]);

  useEffect(() => {
    if (mode !== 'pip') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeFull) {
          exitFullscreenIfNeeded();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, activeFull, exitFullscreenIfNeeded, onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBuffering(true);
    setError(null);
    setMeta(null);
    setDecodedRes(null);

    const qs = new URLSearchParams({
      videoId,
      quality: String(quality),
      title,
      artist,
    });
    fetch(`/api/yt/video?${qs.toString()}`)
      .then(async (res) => {
        const d = (await res.json()) as VideoMeta & { error?: string };
        if (!res.ok || d.error) throw new Error(d.error || 'Video unavailable');
        return d;
      })
      .then((d) => {
        if (!cancelled) {
          setMeta(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No video available');
          setLoading(false);
          setBuffering(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, quality, title, artist]);

  // Sync play/pause & playbackRate with master audio
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !meta) return;
    el.playbackRate = Math.max(0.5, Math.min(2, playbackRate || 1));
    if (isPlaying) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isPlaying, playbackRate, meta]);

  // Drift lock via external clock subscription (zero React re-renders)
  useEffect(() => {
    if (!meta) return;
    const syncDrift = () => {
      const el = videoRef.current;
      if (!el || el.readyState < 2) return;
      const rawTarget = getPlaybackPositionMs() / 1000;
      const targetSec =
        Number.isFinite(el.duration) && el.duration > 1
          ? Math.min(el.duration - 0.3, rawTarget)
          : rawTarget;
      if (Math.abs(el.currentTime - targetSec) > 0.38) {
        try {
          el.currentTime = Math.max(0, targetSec);
        } catch {
          // Ignore transient seek errors while buffering
        }
      }
    };
    syncDrift();
    return subscribePlaybackPosition(syncDrift);
  }, [meta]);

  const qualities = meta?.availableHeights?.length ? meta.availableHeights : QUALITY_CHOICES;
  const resolvedTier = meta?.tier ?? meta?.height;

  const beginInteraction = (
    kind: 'drag' | 'resize-se' | 'resize-sw',
    e: React.PointerEvent<HTMLElement>,
  ) => {
    if (mode !== 'pip' || activeFull) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    manualMovedRef.current = true;
    interactionRef.current = {
      kind,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: activeBoxRef.current,
    };
  };

  const handleInteractionMove = (e: React.PointerEvent<HTMLElement>) => {
    const act = interactionRef.current;
    if (!act || act.pointerId !== e.pointerId) return;
    const dx = e.clientX - act.startX;
    const dy = e.clientY - act.startY;

    if (act.kind === 'drag') {
      updateBox(
        clampFloatingBox({
          x: act.origin.x + dx,
          y: act.origin.y + dy,
          width: act.origin.width,
        }),
      );
    } else if (act.kind === 'resize-se') {
      const nextWidth = Math.max(act.origin.width + dx, act.origin.width + dy * (16 / 9));
      updateBox(
        clampFloatingBox({
          x: act.origin.x,
          y: act.origin.y,
          width: nextWidth,
        }),
      );
    } else {
      const deltaW = Math.max(-dx, dy * (16 / 9));
      const clamped = clampFloatingBox({
        x: act.origin.x - deltaW,
        y: act.origin.y,
        width: act.origin.width + deltaW,
      });
      const rightEdge = act.origin.x + act.origin.width;
      updateBox(
        clampFloatingBox({
          x: rightEdge - clamped.width,
          y: act.origin.y,
          width: clamped.width,
        }),
      );
    }
  };

  const endInteraction = (e: React.PointerEvent<HTMLElement>) => {
    if (interactionRef.current?.pointerId === e.pointerId) {
      interactionRef.current = null;
    }
  };

  const safeBox = mode === 'pip' && !activeFull ? clampFloatingBox(activeBox) : activeBox;

  const frameContent = (
    <div
      ref={frameRef}
      className={
        activeFull
          ? 'cw-video-cinema-full cw-video-frame'
          : mode === 'pip'
            ? 'cw-video-floating-window cw-comic-frame cw-video-frame'
            : 'cw-full-video-stage cw-video-frame'
      }
      style={
        mode === 'pip' && !activeFull
          ? {
              width: safeBox.width,
              height: Math.round((safeBox.width * 9) / 16),
              transform: `translate3d(${safeBox.x}px, ${safeBox.y}px, 0)`,
            }
          : undefined
      }
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, [data-resize]')) return;
        beginInteraction('drag', e);
      }}
      onPointerMove={handleInteractionMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
    >
      {(loading || (buffering && !error)) && (
        <div className="cw-video-status">
          <Loader2 size={20} className="cw-spin" />
          <span>{loading ? `Loading ${quality === 2160 ? '4K' : `${quality}p`} MV...` : 'Syncing video...'}</span>
        </div>
      )}
      {error && !loading && (
        <div className="cw-video-status" style={{ color: '#ff7070', padding: '0 14px', textAlign: 'center' }}>
          <span>{error}</span>
        </div>
      )}
      {meta && !error && (
        <video
          ref={videoRef}
          key={meta.proxyUrl}
          src={meta.proxyUrl}
          muted
          autoPlay
          playsInline
          preload="auto"
          className="cw-video-el"
          style={activeFull ? { objectFit: 'contain' } : undefined}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && v.videoHeight > 0) {
              setDecodedRes(`${v.videoWidth}×${v.videoHeight}`);
            }
          }}
          onLoadedData={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && v.videoHeight > 0) {
              setDecodedRes(`${v.videoWidth}×${v.videoHeight}`);
            }
            const raw = getPlaybackPositionMs() / 1000;
            v.currentTime =
              Number.isFinite(v.duration) && v.duration > 1
                ? Math.min(v.duration - 0.3, raw)
                : raw;
            v.playbackRate = Math.max(0.5, Math.min(2, rateRef.current || 1));
            setBuffering(false);
            if (playingRef.current) v.play().catch(() => {});
          }}
          onCanPlay={(e) => {
            setBuffering(false);
            if (playingRef.current && e.currentTarget.paused) {
              e.currentTarget.play().catch(() => {});
            }
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onError={(e) => {
            const code = e.currentTarget.error?.code;
            setBuffering(false);
            setError(`Video decode failed (code ${code ?? '?'})`);
          }}
        />
      )}

      {/* Overlay controls: Quality pills (incl. 1440p/4K) + live resolution readout + 2 Fullscreen modes */}
      <div className="cw-video-overlay-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div className="cw-video-qualities">
            {qualities.map((q) => (
              <button
                key={q}
                type="button"
                className="cw-quality-pill"
                data-active={resolvedTier ? resolvedTier === q : quality === q}
                onClick={() => onQualityChange(q)}
              >
                {q === 2160 ? '4K' : `${q}p`}
              </button>
            ))}
          </div>
          {decodedRes && (
            <span className="cw-video-res-badge">
              {decodedRes}
              {meta?.codec ? ` • ${meta.codec}` : ''}
            </span>
          )}
          {mode === 'pip' && !activeFull && (
            <span className="cw-video-drag-badge cw-tip-anchor" data-tip="Drag to move" data-tip-pos="bottom">
              <Move size={11} />
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            type="button"
            className="cw-video-action-btn cw-tip-anchor"
            data-tip={activeFull ? 'Exit Fullscreen' : 'True Fullscreen (Video Only)'}
            data-tip-pos="bottom"
            aria-label="Toggle True Fullscreen"
            onClick={toggleTrueFullscreen}
          >
            {activeFull ? <Minimize2 size={14} className="cw-ic-expand" /> : <Maximize2 size={14} className="cw-ic-expand" />}
          </button>

          {mode === 'pip' && onExpandLyricsFullscreen && (
            <button
              type="button"
              className="cw-video-action-btn cw-tip-anchor"
              data-tip="Fullscreen + Lyrics Mode"
              data-tip-pos="bottom"
              aria-label="Open Fullscreen Lyrics with Video"
              onClick={handleExpandLyrics}
            >
              <Mic2 size={14} className="cw-ic-lyrics" />
            </button>
          )}

          <button
            type="button"
            className="cw-video-action-btn cw-tip-anchor"
            data-tip="Close Video (Esc)"
            data-tip-pos="bottom"
            aria-label="Close Video Mode"
            onClick={handleClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {mode === 'pip' && (
        <div className="cw-pip-caption cw-ellipsis">
          MV • {title}{artist ? ` — ${artist}` : ''}
        </div>
      )}

      {mode === 'pip' && !activeFull && (
        <>
          <div
            className="cw-video-resize-sw"
            data-resize="sw"
            title="Drag to resize"
            onPointerDown={(e) => beginInteraction('resize-sw', e)}
            onPointerMove={handleInteractionMove}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
          />
          <div
            className="cw-video-resize-se"
            data-resize="se"
            title="Drag to resize"
            onPointerDown={(e) => beginInteraction('resize-se', e)}
            onPointerMove={handleInteractionMove}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
          />
        </>
      )}
    </div>
  );

  if (mode === 'pip') {
    return (
      <div
        className="cw-video-backdrop"
        data-fullscreen={activeFull}
        onPointerDown={(e) => {
          backdropPressedRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && backdropPressedRef.current) {
            handleClose();
          }
          backdropPressedRef.current = false;
        }}
      >
        {frameContent}
      </div>
    );
  }

  return frameContent;
};
