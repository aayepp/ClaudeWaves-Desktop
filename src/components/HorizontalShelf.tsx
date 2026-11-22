import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalShelfProps {
  title: string;
  headerLeading?: React.ReactNode;
  headerTrailing?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Option A + B Horizontal Shelf (Zero-Rerender 240Hz Scroll):
 * - Direct DOM ref style updates inside requestAnimationFrame for floating hairline thumb
 * - React state updates ONLY when arrow visibility booleans flip
 */
export const HorizontalShelf: React.FC<HorizontalShelfProps> = React.memo(({
  title,
  headerLeading,
  headerTrailing,
  children,
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number>(0);
  const thumbMetricsRef = useRef({ widthPct: 100, leftPct: 0 });
  const dragState = useRef<{ pointerId: number; startX: number; startScroll: number } | null>(null);

  const [navState, setNavState] = useState({
    canLeft: false,
    canRight: false,
    hasOverflow: false,
  });

  const childCount = React.Children.count(children);

  const syncMetricsNow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);

    if (maxScroll <= 4) {
      thumbMetricsRef.current = { widthPct: 100, leftPct: 0 };
      if (thumbRef.current) {
        thumbRef.current.style.width = '100%';
        thumbRef.current.style.left = '0%';
      }
      setNavState((prev) =>
        !prev.canLeft && !prev.canRight && !prev.hasOverflow
          ? prev
          : { canLeft: false, canRight: false, hasOverflow: false },
      );
      return;
    }

    const widthPct = Math.max(16, Math.min(72, (clientWidth / scrollWidth) * 100));
    const leftPct = (scrollLeft / maxScroll) * (100 - widthPct);
    thumbMetricsRef.current = { widthPct, leftPct };

    if (thumbRef.current) {
      thumbRef.current.style.width = `${widthPct}%`;
      thumbRef.current.style.left = `${leftPct}%`;
    }

    const nextCanLeft = scrollLeft > 4;
    const nextCanRight = scrollLeft < maxScroll - 4;
    setNavState((prev) =>
      prev.canLeft === nextCanLeft && prev.canRight === nextCanRight && prev.hasOverflow
        ? prev
        : { canLeft: nextCanLeft, canRight: nextCanRight, hasOverflow: true },
    );
  }, []);

  const scheduleSync = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      syncMetricsNow();
    });
  }, [syncMetricsNow]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncMetricsNow();
    const ro = new ResizeObserver(scheduleSync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };
  }, [syncMetricsNow, scheduleSync, childCount]);

  // Apply cached thumb geometry when track first mounts
  useEffect(() => {
    if (navState.hasOverflow && thumbRef.current) {
      thumbRef.current.style.width = `${thumbMetricsRef.current.widthPct}%`;
      thumbRef.current.style.left = `${thumbMetricsRef.current.leftPct}%`;
    }
  }, [navState.hasOverflow]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.78), behavior: 'smooth' });
  };

  const scrubToClientX = (clientX: number) => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 1) return;
    const thumbW = (thumbMetricsRef.current.widthPct / 100) * rect.width;
    const usable = Math.max(1, rect.width - thumbW);
    const pct = Math.max(0, Math.min(1, (clientX - rect.left - thumbW / 2) / usable));
    scroller.scrollLeft = pct * (scroller.scrollWidth - scroller.clientWidth);
  };

  return (
    <section className="cw-shelf">
      <div className="cw-shelf-header">
        <div className="cw-shelf-title-group">
          {headerLeading}
          <h2 className="cw-h2">{title}</h2>
        </div>
        {(headerTrailing || navState.hasOverflow) && (
          <div className="cw-shelf-arrows">
            {headerTrailing}
            {navState.hasOverflow && (
              <>
                <button
                  type="button"
                  className="cw-shelf-arrow-btn"
                  disabled={!navState.canLeft}
                  aria-label={`Scroll ${title} left`}
                  data-tip="Scroll Left"
                  onClick={() => scrollByPage(-1)}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="cw-shelf-arrow-btn"
                  disabled={!navState.canRight}
                  aria-label={`Scroll ${title} right`}
                  data-tip="Scroll Right"
                  onClick={() => scrollByPage(1)}
                >
                  <ChevronRight size={15} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div ref={scrollerRef} className="cw-carousel" onScroll={scheduleSync}>
        {children}
      </div>

      {navState.hasOverflow && (
        <div
          ref={trackRef}
          className="cw-hairline-scroll"
          role="scrollbar"
          aria-label={`Scroll ${title}`}
          aria-valuenow={Math.round(thumbMetricsRef.current.leftPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          onPointerDown={(e) => {
            const scroller = scrollerRef.current;
            if (!scroller) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            if ((e.target as HTMLElement).classList.contains('cw-hairline-thumb')) {
              dragState.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startScroll: scroller.scrollLeft,
              };
            } else {
              scrubToClientX(e.clientX);
              dragState.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startScroll: scroller.scrollLeft,
              };
            }
          }}
          onPointerMove={(e) => {
            const d = dragState.current;
            const scroller = scrollerRef.current;
            const track = trackRef.current;
            if (!d || d.pointerId !== e.pointerId || !scroller || !track) return;
            const rect = track.getBoundingClientRect();
            const maxScroll = Math.max(1, scroller.scrollWidth - scroller.clientWidth);
            const thumbW = (thumbMetricsRef.current.widthPct / 100) * rect.width;
            const usableTrack = Math.max(1, rect.width - thumbW);
            const dx = e.clientX - d.startX;
            scroller.scrollLeft = d.startScroll + (dx / usableTrack) * maxScroll;
          }}
          onPointerUp={(e) => {
            if (dragState.current?.pointerId === e.pointerId) {
              dragState.current = null;
            }
          }}
          onPointerCancel={() => {
            dragState.current = null;
          }}
        >
          <div className="cw-hairline-track">
            <div ref={thumbRef} className="cw-hairline-thumb" />
          </div>
        </div>
      )}
    </section>
  );
});
