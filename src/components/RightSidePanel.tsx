import React, { useRef } from 'react';
import { GlassButton, GlassCard, GlassSegmented } from '@zakisheriff/liquid-glass';
import { Maximize2, Trash2, X } from 'lucide-react';
import type { PlayerState } from '../hooks/usePlayer';
import type { LyricsBounceStyle, LyricsDisplayMode, LyricsFontSize, LyricsTranslateLang } from '../types';
import { CoverArtWaves } from './CoverArtWaves';
import { WordSyncedLyrics } from './WordSyncedLyrics';

interface RightSidePanelProps {
  tab: 'lyrics' | 'queue';
  player: PlayerState;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  waveColorHex: string;
  isDark: boolean;
  intensity: number;
  lyricsFontSize: LyricsFontSize;
  lyricsBounce: LyricsBounceStyle;
  lyricsDisplayMode: LyricsDisplayMode;
  lyricsAutoRomanize?: boolean;
  lyricsTranslateLang?: LyricsTranslateLang;
  lyricsOffsetMs: number;
  onSelectTab: (tab: 'lyrics' | 'queue') => void;
  onClose: () => void;
  onExpandFull: () => void;
  onOpenArtist: (artistName: string) => void;
  onLyricsDisplayModeChange: (mode: LyricsDisplayMode) => void;
  onToggleLyricsAutoRomanize?: () => void;
  onCycleLyricsTranslateLang?: () => void;
  onOpenQuoteModal?: () => void;
  onLyricsOffsetChange: (ms: number) => void;
  onSeekTo: (ms: number) => void;
  onPlayQueueIndex: (idx: number) => void;
  onRemoveQueueIndex: (idx: number) => void;
}

export const RightSidePanel: React.FC<RightSidePanelProps> = React.memo(({
  tab,
  player,
  analyserRef,
  waveColorHex,
  isDark,
  intensity,
  lyricsFontSize,
  lyricsBounce,
  lyricsDisplayMode,
  lyricsAutoRomanize = true,
  lyricsTranslateLang = 'off',
  lyricsOffsetMs,
  onSelectTab,
  onClose,
  onExpandFull,
  onOpenArtist,
  onLyricsDisplayModeChange,
  onToggleLyricsAutoRomanize,
  onCycleLyricsTranslateLang,
  onOpenQuoteModal,
  onLyricsOffsetChange,
  onSeekTo,
  onPlayQueueIndex,
  onRemoveQueueIndex,
}) => {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <aside
      className="cw-right-panel cw-comic-frame"
      onPointerDown={(e) => {
        touchStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!touchStart.current) return;
        const dx = e.clientX - touchStart.current.x;
        const dy = Math.abs(e.clientY - touchStart.current.y);
        touchStart.current = null;
        // Swipe right to dismiss panel on touchscreen
        if (dx > 85 && dy < 60) onClose();
      }}
    >
      <GlassCard
        intensity={intensity}
        padding="14px"
        radius="24px"
        variant="regular"
        style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div className="cw-right-panel-header">
          <GlassSegmented
            size="sm"
            options={['Lyrics', `Queue (${player.queue.length})`]}
            value={tab === 'lyrics' ? 0 : 1}
            intensity={intensity}
            onChange={(i) => onSelectTab(i === 0 ? 'lyrics' : 'queue')}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {player.currentTrack && (
              <GlassButton
                size="sm"
                variant="clear"
                intensity={intensity}
                aria-label="Expand full player"
                icon={<Maximize2 size={14} className="cw-ic-expand" />}
                onClick={onExpandFull}
              />
            )}
            <GlassButton
              size="sm"
              variant="clear"
              intensity={intensity}
              aria-label="Close panel"
              icon={<X size={15} />}
              onClick={onClose}
            />
          </div>
        </div>

        {player.currentTrack && tab === 'lyrics' && (
          <div className="cw-side-lyric-hero">
            <div className="cw-side-lyric-stage">
              <CoverArtWaves
                analyserRef={analyserRef}
                isPlaying={player.isPlaying}
                colorHex={waveColorHex}
                isDark={isDark}
                variant="side"
              />
              <img
                key={player.currentTrack.videoId}
                className="cw-side-lyric-cover cw-art-flip"
                src={player.currentTrack.thumbnailUrl}
                alt={player.currentTrack.title}
                onClick={onExpandFull}
                title="Open Fullscreen Player"
              />
            </div>
            <div className="cw-side-lyric-meta">
              <div className="cw-track-title cw-ellipsis">{player.currentTrack.title}</div>
              <button
                type="button"
                className="cw-artist-link cw-ellipsis"
                onClick={() => onOpenArtist(player.currentTrack!.artist)}
              >
                {player.currentTrack.artist}
              </button>
            </div>
          </div>
        )}

        {player.currentTrack && tab === 'queue' && (
          <div className="cw-side-now">
            <img
              className="cw-side-thumb"
              src={player.currentTrack.thumbnailUrl}
              alt={player.currentTrack.title}
            />
            <div className="cw-row-meta">
              <div className="cw-track-title cw-ellipsis">{player.currentTrack.title}</div>
              <button
                type="button"
                className="cw-artist-link cw-ellipsis"
                onClick={() => onOpenArtist(player.currentTrack!.artist)}
              >
                {player.currentTrack.artist}
              </button>
            </div>
          </div>
        )}

        <div className="cw-side-scroll">
          {tab === 'lyrics' ? (
            <WordSyncedLyrics
              lyrics={player.lyrics}
              offsetMs={lyricsOffsetMs}
              displayMode={lyricsDisplayMode}
              autoRomanize={lyricsAutoRomanize}
              translateLang={lyricsTranslateLang}
              large={false}
              fontSize={lyricsFontSize}
              bounceStyle={lyricsBounce}
              onDisplayModeChange={onLyricsDisplayModeChange}
              onToggleAutoRomanize={onToggleLyricsAutoRomanize}
              onCycleTranslateLang={onCycleLyricsTranslateLang}
              onOpenQuoteModal={onOpenQuoteModal}
              onOffsetChange={onLyricsOffsetChange}
              onSeekTo={onSeekTo}
            />
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 4 }}>
              {player.queue.length === 0 ? (
                <div className="cw-muted" style={{ textAlign: 'center', padding: 24 }}>
                  Queue is empty.
                </div>
              ) : (
                player.queue.map((item, idx) => {
                  const current = idx === player.currentIndex;
                  return (
                    <div
                      key={`${item.videoId}-${idx}`}
                      className="cw-track-row"
                      data-active={current}
                      onClick={() => onPlayQueueIndex(idx)}
                    >
                      <img className="cw-row-thumb" src={item.thumbnailUrl} alt={item.title} />
                      <div className="cw-row-meta">
                        <div
                          className="cw-track-title cw-ellipsis"
                          style={current ? { color: 'var(--cw-accent)' } : undefined}
                        >
                          {item.title}
                        </div>
                        <div className="cw-track-artist cw-ellipsis">{item.artist}</div>
                      </div>
                      {!current && (
                        <button
                          type="button"
                          className="cw-row-icon-btn"
                          aria-label="Remove from queue"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveQueueIndex(idx);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </GlassCard>
    </aside>
  );
});
