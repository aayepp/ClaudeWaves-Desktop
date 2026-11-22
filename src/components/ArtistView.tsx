import React, { useState } from 'react';
import { GlassButton } from '@zakisheriff/liquid-glass';
import { ArrowLeft, Disc3, Heart, ListPlus, Play, Star } from 'lucide-react';
import { fetchAlbumPage } from '../api/extras';
import {
  formatDuration,
  type AlbumPageData,
  type ArtistPageData,
  type Track,
} from '../types';

interface ArtistViewProps {
  artist: ArtistPageData | null;
  loading: boolean;
  error: string | null;
  currentVideoId: string | null;
  isPlaying: boolean;
  likedIds: Set<string>;
  accentHex: string;
  intensity: number;
  onBack: () => void;
  onPlayTrack: (track: Track, list: Track[]) => void;
  onToggleLike: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export const ArtistView: React.FC<ArtistViewProps> = ({
  artist,
  loading,
  error,
  currentVideoId,
  isPlaying,
  likedIds,
  accentHex,
  intensity,
  onBack,
  onPlayTrack,
  onToggleLike,
  onAddToQueue,
}) => {
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumPageData | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);

  const openAlbum = async (browseId: string) => {
    setAlbumLoading(true);
    try {
      const data = await fetchAlbumPage(browseId);
      setSelectedAlbum(data);
    } catch {
      // Ignore
    } finally {
      setAlbumLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <GlassButton
          size="sm"
          variant="glass"
          intensity={intensity}
          icon={<ArrowLeft size={15} />}
          onClick={() => {
            if (selectedAlbum) setSelectedAlbum(null);
            else onBack();
          }}
        >
          {selectedAlbum ? `Back to ${artist?.name ?? 'Artist'}` : 'Back'}
        </GlassButton>
      </div>

      {loading && (
        <div className="cw-content-card" style={{ padding: 36, textAlign: 'center' }}>
          <div className="cw-muted">Loading artist profile, top songs &amp; albums...</div>
        </div>
      )}

      {error && !loading && (
        <div className="cw-content-card" style={{ padding: 24, color: '#ff5c5c' }}>
          {error}
        </div>
      )}

      {/* Selected Album Detail */}
      {selectedAlbum && (
        <div className="cw-page-view" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="cw-content-card cw-hero-banner" style={{ cursor: 'default' }}>
            {selectedAlbum.coverUrl && (
              <div className="cw-hero-bg" style={{ backgroundImage: `url(${selectedAlbum.coverUrl})` }} />
            )}
            {selectedAlbum.coverUrl && (
              <img className="cw-hero-cover" src={selectedAlbum.coverUrl} alt={selectedAlbum.title} />
            )}
            <div className="cw-hero-info">
              <div className="cw-shelf-sub">Album</div>
              <div className="cw-hero-title">{selectedAlbum.title}</div>
              <div className="cw-muted" style={{ marginBottom: 14 }}>{selectedAlbum.subtitle}</div>
              {selectedAlbum.tracks.length > 0 && (
                <GlassButton
                  size="sm"
                  variant="filled"
                  tint={accentHex}
                  intensity={intensity}
                  icon={<Play size={15} />}
                  onClick={() => onPlayTrack(selectedAlbum.tracks[0], selectedAlbum.tracks)}
                >
                  Play Album ({selectedAlbum.tracks.length})
                </GlassButton>
              )}
            </div>
          </div>

          <div className="cw-content-card" style={{ padding: 14 }}>
            {selectedAlbum.tracks.map((tr, i) => {
              const active = tr.videoId === currentVideoId;
              const liked = likedIds.has(tr.videoId);
              return (
                <div
                  key={`${tr.videoId}-${i}`}
                  className="cw-track-row"
                  data-active={active}
                  onClick={() => onPlayTrack(tr, selectedAlbum.tracks)}
                >
                  <div className="cw-track-index">
                    {active ? (
                      <span className="cw-eq-bars" data-playing={isPlaying}><span /><span /><span /></span>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <img className="cw-row-thumb" src={tr.thumbnailUrl} alt={tr.title} loading="lazy" />
                  <div className="cw-row-meta">
                    <div className="cw-track-title cw-ellipsis" style={active ? { color: 'var(--cw-accent)' } : undefined}>
                      {tr.title}
                    </div>
                    <div className="cw-track-artist cw-ellipsis">{tr.artist}</div>
                  </div>
                  {tr.durationMs > 0 && <span className="cw-time-label">{formatDuration(tr.durationMs)}</span>}
                  <div className="cw-row-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={`cw-row-icon-btn ${liked ? 'cw-heart-burst' : ''}`}
                      data-active={liked}
                      onClick={() => onToggleLike(tr)}
                    >
                      <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
                    </button>
                    <button type="button" className="cw-row-icon-btn" onClick={() => onAddToQueue(tr)}>
                      <ListPlus size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Artist Page */}
      {!selectedAlbum && artist && !loading && (
        <div className="cw-page-view" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Artist Hero Banner */}
          <div className="cw-content-card cw-artist-hero">
            {artist.bannerUrl && (
              <div className="cw-artist-hero-bg" style={{ backgroundImage: `url(${artist.bannerUrl})` }} />
            )}
            <div className="cw-artist-hero-content">
              {artist.bannerUrl && (
                <img className="cw-artist-avatar" src={artist.bannerUrl} alt={artist.name} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cw-shelf-sub">Artist</div>
                <h1 className="cw-h1" style={{ fontSize: 34 }}>{artist.name}</h1>
                {artist.subscribers && <div className="cw-muted">{artist.subscribers}</div>}
                {artist.description && (
                  <p className="cw-muted" style={{ margin: '8px 0 14px', maxWidth: 620, lineHeight: 1.45 }}>
                    {artist.description}
                  </p>
                )}
                {artist.topSongs.length > 0 && (
                  <GlassButton
                    size="sm"
                    variant="filled"
                    tint={accentHex}
                    intensity={intensity}
                    icon={<Play size={15} />}
                    onClick={() => onPlayTrack(artist.topSongs[0], artist.topSongs)}
                  >
                    Play Top Songs
                  </GlassButton>
                )}
              </div>
            </div>
          </div>

          {/* Top Songs with Star Remark */}
          {artist.topSongs.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Star size={18} fill="#F59E0B" color="#F59E0B" />
                <h2 className="cw-h2">Top Songs</h2>
              </div>
              <div className="cw-content-card" style={{ padding: 12 }}>
                {artist.topSongs.map((track, idx) => {
                  const active = track.videoId === currentVideoId;
                  const liked = likedIds.has(track.videoId);
                  return (
                    <div
                      key={`${track.videoId}-${idx}`}
                      className="cw-track-row"
                      data-active={active}
                      onClick={() => onPlayTrack(track, artist.topSongs)}
                    >
                      <div className="cw-track-index">
                        {active ? (
                          <span className="cw-eq-bars" data-playing={isPlaying}><span /><span /><span /></span>
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <img className="cw-row-thumb" src={track.thumbnailUrl} alt={track.title} loading="lazy" />
                      <div className="cw-row-meta">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span
                            className="cw-track-title cw-ellipsis"
                            style={active ? { color: 'var(--cw-accent)' } : undefined}
                          >
                            {track.title}
                          </span>
                          {track.isTopSong && (
                            <span className="cw-top-star-badge" title="Top Song">
                              <Star size={11} fill="currentColor" /> Top
                            </span>
                          )}
                        </div>
                        <div className="cw-track-artist cw-ellipsis">
                          {[track.album, track.plays].filter(Boolean).join(' • ') || track.artist}
                        </div>
                      </div>
                      {track.durationMs > 0 && (
                        <span className="cw-time-label">{formatDuration(track.durationMs)}</span>
                      )}
                      <div className="cw-row-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`cw-row-icon-btn ${liked ? 'cw-heart-burst' : ''}`}
                          data-active={liked}
                          onClick={() => onToggleLike(track)}
                        >
                          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
                        </button>
                        <button type="button" className="cw-row-icon-btn" onClick={() => onAddToQueue(track)}>
                          <ListPlus size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Albums & Singles */}
          {artist.albums.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Disc3 size={18} color="var(--cw-accent)" />
                <h2 className="cw-h2">Albums &amp; Singles</h2>
                {albumLoading && <span className="cw-muted">Loading album...</span>}
              </div>
              <div className="cw-carousel">
                {artist.albums.map((alb) => (
                  <div
                    key={alb.browseId}
                    className="cw-content-card cw-track-card"
                    onClick={() => openAlbum(alb.browseId)}
                  >
                    <div className="cw-art-wrap">
                      <img className="cw-art-img" src={alb.thumbnailUrl} alt={alb.title} loading="lazy" />
                      <div className="cw-art-play">
                        <span className="cw-play-pill" data-active="true">
                          <Play size={15} />
                        </span>
                      </div>
                    </div>
                    <div className="cw-track-title cw-ellipsis">{alb.title}</div>
                    <div className="cw-track-artist cw-ellipsis">{alb.subtitle}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
