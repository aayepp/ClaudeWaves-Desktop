import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { Track } from '../types';

interface CoverFlowDeckProps {
  tracks: Track[];
  currentVideoId: string | null;
  onPlayTrack: (track: Track, list: Track[]) => void;
  onOpenArtist: (artistName: string) => void;
}

/**
 * Full-Width 3D Stacked Cover-Flow Spotlight Stage (10+ curated home spotlight tracks):
 * - Center hero card + 2 symmetrical flanking depth cards on left & right
 * - Bold #1..#10 rank badge, Play pill, bottom-left TRACK + title, bottom-right ARTIST + clickable name
 * - Renders only cards near viewport (|offset| <= 3) with zero blur filter for locked 240Hz fluidity
 */
export const CoverFlowDeck: React.FC<CoverFlowDeckProps> = React.memo(({
  tracks,
  currentVideoId,
  onPlayTrack,
  onOpenArtist,
}) => {
  const items = tracks.slice(0, 12);
  const [activeIdx, setActiveIdx] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const firstId = items[0]?.videoId ?? '';

  useEffect(() => {
    setActiveIdx(0);
  }, [firstId]);

  if (items.length === 0) return null;
  const count = items.length;
  const safeIdx = ((activeIdx % count) + count) % count;

  const step = (delta: number) => {
    setActiveIdx((prev) => (prev + delta + count) % count);
  };

  const computeOffset = (idx: number): number => {
    let rel = idx - safeIdx;
    if (rel > count / 2) rel -= count;
    if (rel < -count / 2) rel += count;
    if (count % 2 === 0 && rel === -count / 2) rel = count / 2;
    return rel;
  };

  return (
    <section
      className="cw-cf-deck"
      aria-label="Featured Spotlight"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        dragStartX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (dragStartX.current === null) return;
        const dx = e.clientX - dragStartX.current;
        dragStartX.current = null;
        if (dx < -45) step(1);
        else if (dx > 45) step(-1);
      }}
    >
      <div className="cw-cf-stage">
        {count > 1 && (
          <button
            type="button"
            className="cw-cf-nav-btn cw-cf-nav-prev"
            aria-label="Previous spotlight"
            data-tip="Previous"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {items.map((track, idx) => {
          const offset = computeOffset(idx);
          const abs = Math.abs(offset);
          if (abs > 3) return null;

          const isCenter = offset === 0;
          const isPlayingThis = currentVideoId === track.videoId;
          const attrOffset = abs <= 2 ? String(offset) : 'hidden';

          return (
            <div
              key={`${track.videoId}-${idx}`}
              className="cw-cf-card cw-comic-frame"
              data-offset={attrOffset}
              data-playing={isPlayingThis}
              role="button"
              tabIndex={isCenter ? 0 : -1}
              aria-label={isCenter ? `Play ${track.title} by ${track.artist}` : `Focus ${track.title}`}
              onClick={() => {
                if (isCenter) {
                  onPlayTrack(track, tracks);
                } else {
                  setActiveIdx(idx);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (isCenter) onPlayTrack(track, tracks);
                  else setActiveIdx(idx);
                }
              }}
            >
              <img
                className="cw-cf-art"
                src={track.thumbnailUrl}
                alt={track.title}
                loading={abs <= 1 ? 'eager' : 'lazy'}
                draggable={false}
              />
              <div className="cw-cf-sheen" />
              <div className="cw-cf-scrim" />

              <div className="cw-cf-top">
                <span className="cw-cf-rank">#{idx + 1}</span>
                {isCenter && (
                  <button
                    type="button"
                    className="cw-cf-play"
                    data-active={isPlayingThis}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayTrack(track, tracks);
                    }}
                  >
                    <Play size={13} fill="currentColor" />
                    <span>{isPlayingThis ? 'Playing' : 'Play'}</span>
                  </button>
                )}
              </div>

              <div className="cw-cf-meta">
                <div className="cw-cf-meta-left">
                  <span className="cw-cf-eyebrow">Track</span>
                  <div className="cw-cf-title" title={track.title}>
                    {track.title}
                  </div>
                </div>
                <div className="cw-cf-meta-right">
                  <span className="cw-cf-eyebrow">Artist</span>
                  <button
                    type="button"
                    className="cw-cf-artist cw-ellipsis"
                    title={track.artist}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenArtist(track.artist);
                    }}
                  >
                    {track.artist}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {count > 1 && (
          <button
            type="button"
            className="cw-cf-nav-btn cw-cf-nav-next"
            aria-label="Next spotlight"
            data-tip="Next"
            onClick={() => step(1)}
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="cw-cflow-dots" role="tablist" aria-label="Spotlight slide">
          {items.map((t, i) => (
            <button
              key={`dot-${t.videoId}-${i}`}
              type="button"
              className="cw-cflow-dot"
              data-active={i === safeIdx}
              aria-label={`Spotlight ${i + 1}`}
              onClick={() => setActiveIdx(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
});
