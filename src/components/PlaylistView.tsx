import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GlassButton } from '@zakisheriff/liquid-glass';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Repeat,
  Search,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatDuration,
  type PlaylistTrackSort,
  type RepeatMode,
  type Track,
} from '../types';
import {
  loadPlaylistSort,
  PLAYLIST_SORT_OPTIONS,
  savePlaylistSort,
  sortAndFilterTracks,
} from '../utils/playlistSort';

interface PlaylistViewProps {
  playlistKey: string;
  title: string;
  isLikedView?: boolean;
  tracks: Track[];
  likedIds: Set<string>;
  currentTrackId: string | null;
  repeatMode: RepeatMode;
  queueTrackIds: Set<string>;
  accentHex: string;
  intensity: number;
  onPlayList: (
    startTrack: Track,
    list: Track[],
    opts?: { repeatMode?: RepeatMode; skipRadio?: boolean; shuffle?: boolean },
  ) => void;
  onSetRepeatMode: (mode: RepeatMode) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  downloadingBatch?: boolean;
  downloadedInListCount?: number;
  onDownloadAll?: () => void;
  headerExtra?: React.ReactNode;
  onDeletePlaylist?: () => void;
  renderTrackRow: (track: Track, index: number, contextList: Track[]) => React.ReactNode;
}

export const PlaylistView: React.FC<PlaylistViewProps> = ({
  playlistKey,
  title,
  isLikedView = false,
  tracks,
  likedIds,
  currentTrackId,
  repeatMode,
  queueTrackIds,
  accentHex,
  intensity,
  onPlayList,
  onSetRepeatMode,
  refreshing = false,
  onRefresh,
  downloadingBatch = false,
  downloadedInListCount = 0,
  onDownloadAll,
  headerExtra,
  onDeletePlaylist,
  renderTrackRow,
}) => {
  const initialPref = loadPlaylistSort(playlistKey, isLikedView);
  const [sort, setSort] = useState<PlaylistTrackSort>(initialPref.sort);
  const [ascending, setAscending] = useState<boolean>(initialPref.ascending);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const pref = loadPlaylistSort(playlistKey, isLikedView);
    setSort(pref.sort);
    setAscending(pref.ascending);
    setQuery('');
    setMenuOpen(false);
  }, [playlistKey, isLikedView]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const displayTracks = useMemo(
    () =>
      sortAndFilterTracks(tracks, {
        sort,
        ascending,
        query,
        likedIds,
        isLikedView,
      }),
    [tracks, sort, ascending, query, likedIds, isLikedView],
  );

  const totalDurationMs = useMemo(
    () => tracks.reduce((sum, t) => sum + Math.max(0, t.durationMs || 0), 0),
    [tracks],
  );

  const totalDurationLabel = useMemo(() => {
    const totalMin = Math.round(totalDurationMs / 60_000);
    if (totalMin >= 60) {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return totalMin > 0 ? `${totalMin}m` : formatDuration(totalDurationMs);
  }, [totalDurationMs]);

  const isQueueFromThisList = Boolean(
    currentTrackId &&
      tracks.length > 0 &&
      queueTrackIds.has(currentTrackId) &&
      tracks.every((t) => queueTrackIds.has(t.videoId)),
  );
  const isThisListLooping = repeatMode === 'all' && isQueueFromThisList;

  const currentSortLabel =
    PLAYLIST_SORT_OPTIONS.find((o) => o.id === sort)?.label ?? 'Custom Order';

  const handleSelectSort = (nextSort: PlaylistTrackSort) => {
    const nextAsc =
      nextSort === sort
        ? !ascending
        : nextSort === 'latest_liked' || nextSort === 'date_added'
          ? false
          : true;
    setSort(nextSort);
    setAscending(nextAsc);
    savePlaylistSort(playlistKey, nextSort, nextAsc, isLikedView);
    setMenuOpen(false);
  };

  const handleToggleDirection = () => {
    const nextAsc = !ascending;
    setAscending(nextAsc);
    savePlaylistSort(playlistKey, sort, nextAsc, isLikedView);
  };

  const handleRepeatAllClick = () => {
    if (displayTracks.length === 0) return;
    if (isThisListLooping) {
      onSetRepeatMode('off');
      return;
    }
    if (isQueueFromThisList) {
      onSetRepeatMode('all');
      return;
    }
    onPlayList(displayTracks[0], displayTracks, { repeatMode: 'all', skipRadio: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="cw-section-header">
        <div>
          <h1 className="cw-h1">{title}</h1>
          <div className="cw-muted">
            {query.trim()
              ? `${displayTracks.length} of ${tracks.length} tracks`
              : `${tracks.length} tracks`}
            {totalDurationMs > 0 ? ` • ${totalDurationLabel}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {displayTracks.length > 0 && (
            <>
              <GlassButton
                size="sm"
                variant="filled"
                tint={accentHex}
                intensity={intensity}
                icon={<Play size={14} />}
                onClick={() => onPlayList(displayTracks[0], displayTracks, { skipRadio: true })}
              >
                Play All
              </GlassButton>
              <GlassButton
                size="sm"
                variant="glass"
                intensity={intensity}
                icon={<Shuffle size={14} className="cw-ic-shuffle" />}
                onClick={() => {
                  const pick = displayTracks[Math.floor(Math.random() * displayTracks.length)] ?? displayTracks[0];
                  onPlayList(pick, displayTracks, { shuffle: true, skipRadio: true });
                }}
              >
                Shuffle
              </GlassButton>
              <GlassButton
                size="sm"
                variant={isThisListLooping ? 'tinted' : 'glass'}
                tint={accentHex}
                intensity={intensity}
                icon={<Repeat size={14} className="cw-ic-repeat" />}
                onClick={handleRepeatAllClick}
              >
                {isThisListLooping ? 'Looping All' : 'Repeat All'}
              </GlassButton>
            </>
          )}
          {onRefresh && (
            <GlassButton
              size="sm"
              variant="glass"
              intensity={intensity}
              disabled={refreshing}
              aria-label="Refresh latest songs from YouTube or Spotify"
              icon={<RefreshCw size={14} className={refreshing ? 'cw-ic-refresh cw-spin' : 'cw-ic-refresh'} />}
              onClick={onRefresh}
            >
              {refreshing ? 'Syncing...' : 'Refresh'}
            </GlassButton>
          )}
          {onDownloadAll && tracks.length > 0 && (() => {
            const allSaved = downloadedInListCount >= tracks.length;
            return (
              <GlassButton
                size="sm"
                variant={allSaved ? 'tinted' : 'glass'}
                tint={accentHex}
                intensity={intensity}
                disabled={downloadingBatch || allSaved}
                aria-label="Download all songs for offline playback"
                icon={
                  downloadingBatch ? (
                    <Loader2 size={14} className="cw-spin" />
                  ) : allSaved ? (
                    <Check size={14} />
                  ) : (
                    <Download size={14} />
                  )
                }
                onClick={onDownloadAll}
              >
                {downloadingBatch
                  ? 'Downloading...'
                  : allSaved
                    ? `Saved (${downloadedInListCount}/${tracks.length})`
                    : `Download All (${downloadedInListCount}/${tracks.length})`}
              </GlassButton>
            );
          })()}
          {headerExtra}
          {onDeletePlaylist && (
            <GlassButton
              size="sm"
              variant="glass"
              destructive
              intensity={intensity}
              icon={<Trash2 size={14} />}
              onClick={onDeletePlaylist}
            >
              Delete
            </GlassButton>
          )}
        </div>
      </div>

      {tracks.length > 0 && (
        <div className="cw-pl-toolbar">
          <div className="cw-pl-filter-wrap">
            <Search size={14} className="cw-pl-filter-ic" />
            <input
              type="text"
              className="cw-pl-filter-input"
              placeholder="Filter songs or artists..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="cw-pl-filter-clear"
                aria-label="Clear filter"
                onClick={() => setQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="cw-pl-sort-group" ref={sortMenuRef}>
            <button
              type="button"
              className="cw-pl-sort-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <ArrowUpDown size={13} />
              <span>{currentSortLabel}</span>
            </button>
            <button
              type="button"
              className="cw-pl-dir-btn cw-tip-anchor"
              data-tip={ascending ? 'Ascending (click to flip)' : 'Descending (click to flip)'}
              aria-label={ascending ? 'Sort Ascending' : 'Sort Descending'}
              onClick={handleToggleDirection}
            >
              {ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
            </button>

            {menuOpen && (
              <div className="cw-sort-menu" role="menu">
                {PLAYLIST_SORT_OPTIONS.map((opt) => {
                  const active = opt.id === sort;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className="cw-sort-menu-item"
                      data-active={active}
                      onClick={() => handleSelectSort(opt.id)}
                    >
                      <span>{opt.label}</span>
                      {active && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cw-content-card" style={{ padding: 16 }}>
        {tracks.length === 0 ? (
          <div className="cw-muted" style={{ padding: 24, textAlign: 'center' }}>
            {isLikedView
              ? 'No liked songs yet. Tap the heart icon on any track.'
              : 'Empty playlist. Click the “+” button on any track row to add songs here.'}
          </div>
        ) : displayTracks.length === 0 ? (
          <div className="cw-muted" style={{ padding: 24, textAlign: 'center' }}>
            No tracks match “{query.trim()}”.
          </div>
        ) : (
          displayTracks.map((t, i) => renderTrackRow(t, i, displayTracks))
        )}
      </div>
    </div>
  );
};
