import React, { useMemo } from 'react';
import { GlassCard } from '@zakisheriff/liquid-glass';
import {
  BarChart3,
  Camera,
  Clock,
  Compass,
  Download,
  HardDrive,
  Heart,
  Home,
  Library,
  ListMusic,
  Moon,
  Plus,
  Radio,
  Search,
  Settings,
  Sliders,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  formatDuration,
  type LayoutSkin,
  type ListeningStats,
  type UserPlaylist,
} from '../types';

export type SidebarRoute =
  | { kind: 'home' }
  | { kind: 'explore' }
  | { kind: 'search' }
  | { kind: 'liked' }
  | { kind: 'recent' }
  | { kind: 'downloads' }
  | { kind: 'stats' }
  | { kind: 'playlist'; id: string }
  | { kind: 'artist'; name: string }
  | { kind: 'settings' };

interface SidebarProps {
  route: SidebarRoute;
  profileName: string;
  profileAvatar: string | null;
  ytAccountName?: string;
  likedCount: number;
  recentCount: number;
  downloadedCount?: number;
  offlineMode?: boolean;
  smartPlaylists?: UserPlaylist[];
  playlists: UserPlaylist[];
  stats: ListeningStats;
  eqPreset: string;
  eqOpen?: boolean;
  autoRadio: boolean;
  sleepRemainingSec: number | null;
  intensity: number;
  onSelectRoute: (route: SidebarRoute) => void;
  onOpenProfile: () => void;
  onNewPlaylist: () => void;
  onImportPlaylist: () => void;
  onOpenEq: () => void;
  onCycleSleepTimer: () => void;
  onToggleAutoRadio: () => void;
  onOpenArtist: (artistName: string) => void;
  layoutSkin?: LayoutSkin;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onSearchSubmit?: () => void;
  onSearchClear?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  route,
  profileName,
  profileAvatar,
  ytAccountName,
  likedCount,
  recentCount,
  downloadedCount = 0,
  offlineMode = false,
  smartPlaylists = [],
  playlists,
  stats,
  eqPreset,
  eqOpen = false,
  autoRadio,
  sleepRemainingSec,
  intensity,
  onSelectRoute,
  onOpenProfile,
  onNewPlaylist,
  onImportPlaylist,
  onOpenEq,
  onCycleSleepTimer,
  onToggleAutoRadio,
  onOpenArtist,
  layoutSkin = 'default',
  searchQuery = '',
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  searchInputRef,
}) => {
  const isRoute = (kind: SidebarRoute['kind'], id?: string) => {
    if (route.kind !== kind) return false;
    if (kind === 'playlist' && route.kind === 'playlist') return route.id === id;
    return true;
  };

  const displayName = profileName.trim() || ytAccountName || 'Your Profile';

  const totalMin = Math.round((stats.totalListenSec || 0) / 60);
  const listenLabel =
    totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : `${totalMin}m`;

  const topArtist = useMemo(() => {
    let best = '—';
    let max = 0;
    for (const [artist, count] of Object.entries(stats.artistCounts || {})) {
      if (count > max) {
        max = count;
        best = artist;
      }
    }
    return best;
  }, [stats.artistCounts]);

  return (
    <aside className="cw-sidebar cw-comic-frame">
      <GlassCard
        intensity={intensity}
        padding="14px 12px"
        radius="24px"
        variant="regular"
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {/* Brand & Profile Header (Default & YTM Brand Only) */}
        {layoutSkin === 'default' && (
          <>
            <div className="cw-sidebar-brand" onClick={() => onSelectRoute({ kind: 'home' })}>
              <img className="cw-brand-logo-img" src="/app_icon.png" alt="ClaudeWaves" />
              <div>
                <div className="cw-brand-title">ClaudeWaves</div>
                <div className="cw-brand-sub">Desktop</div>
              </div>
            </div>

            <button
              type="button"
              className="cw-sidebar-profile"
              onClick={onOpenProfile}
              title="Edit profile & upload photo"
            >
              <div className="cw-sidebar-avatar-wrap">
                {profileAvatar ? (
                  <img className="cw-sidebar-avatar" src={profileAvatar} alt={displayName} />
                ) : (
                  <div className="cw-sidebar-avatar cw-sidebar-avatar-fallback">
                    <User size={16} />
                  </div>
                )}
                <span className="cw-sidebar-avatar-cam">
                  <Camera size={10} />
                </span>
              </div>
              <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                <div className="cw-sidebar-profile-name cw-ellipsis">{displayName}</div>
                <div className="cw-sidebar-profile-sub cw-ellipsis">
                  {ytAccountName ? 'YT Music Connected' : 'Tap to edit photo'}
                </div>
              </div>
            </button>
          </>
        )}

        {layoutSkin === 'ytmusic' && (
          <div className="cw-ytm-rail-brand" onClick={() => onSelectRoute({ kind: 'home' })}>
            <span className="cw-ytm-play-badge">
              <img className="cw-brand-logo-img" src="/app_icon.png" alt="ClaudeWaves" />
            </span>
            <span className="cw-ytm-brand-word">ClaudeWaves</span>
          </div>
        )}

        {layoutSkin === 'tidal' && (
          <div className="cw-tidal-rail-brand" onClick={() => onSelectRoute({ kind: 'home' })}>
            <span className="cw-tidal-brand-word">CLAUDEWAVES</span>
            <span className="cw-tidal-max-badge">MAX</span>
          </div>
        )}

        {layoutSkin === 'soundcloud' && (
          <div className="cw-sc-rail-brand" onClick={() => onSelectRoute({ kind: 'home' })}>
            <img className="cw-brand-logo-img" src="/app_icon.png" alt="ClaudeWaves" />
            <span className="cw-sc-brand-word">CloudWaves</span>
          </div>
        )}

        {layoutSkin === 'nothing' && (
          <div className="cw-nothing-rail-brand" onClick={() => onSelectRoute({ kind: 'home' })}>
            <span className="cw-nothing-dot-live" />
            <span className="cw-nothing-brand-word">CW // OS</span>
          </div>
        )}

        {layoutSkin === 'apple' && (
          <form
            className="cw-apple-sidebar-search"
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit?.();
            }}
          >
            <Search size={13} className="cw-apple-sidebar-search-ic" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              placeholder="Search"
              aria-label="Search music"
              onChange={(e) => onSearchChange?.(e.target.value)}
              onFocus={() => {
                if (searchQuery.trim() && route.kind !== 'search') {
                  onSelectRoute({ kind: 'search' });
                }
              }}
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                className="cw-apple-sidebar-search-clear"
                aria-label="Clear search"
                onClick={() => onSearchClear?.()}
              >
                <X size={12} />
              </button>
            )}
          </form>
        )}

        {layoutSkin === 'spotify' ? (
          <div className="cw-sidebar-scroll cw-spotify-library-scroll">
            <div className="cw-spotify-lib-head">
              <div className="cw-spotify-lib-title">
                <Library size={18} />
                <span>Your Library</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="cw-tip-anchor" data-tip="Import Playlist (YT / Spotify)" data-tip-pos="bottom">
                  <button
                    type="button"
                    className="cw-sidebar-mini-btn"
                    aria-label="Import playlist"
                    onClick={onImportPlaylist}
                  >
                    <Download size={13} />
                  </button>
                </span>
                <button
                  type="button"
                  className="cw-spotify-create-btn"
                  aria-label="Create playlist"
                  onClick={onNewPlaylist}
                >
                  <Plus size={14} />
                  <span>Create</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="cw-spotify-lib-row"
              data-active={isRoute('liked')}
              onClick={() => onSelectRoute({ kind: 'liked' })}
            >
              <div className="cw-spotify-lib-art cw-spotify-liked-tile">
                <Heart size={18} fill="#ffffff" color="#ffffff" />
              </div>
              <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                <div className="cw-spotify-lib-name cw-ellipsis">Liked Songs</div>
                <div className="cw-spotify-lib-sub cw-ellipsis">
                  Playlist · {likedCount} {likedCount === 1 ? 'song' : 'songs'}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="cw-spotify-lib-row"
              data-active={isRoute('recent')}
              onClick={() => onSelectRoute({ kind: 'recent' })}
            >
              <div className="cw-spotify-lib-art cw-spotify-recent-tile">
                <Clock size={18} />
              </div>
              <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                <div className="cw-spotify-lib-name cw-ellipsis">Recently Played</div>
                <div className="cw-spotify-lib-sub cw-ellipsis">
                  History · {recentCount} {recentCount === 1 ? 'track' : 'tracks'}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="cw-spotify-lib-row"
              data-active={isRoute('downloads')}
              onClick={() => onSelectRoute({ kind: 'downloads' })}
            >
              <div className="cw-spotify-lib-art cw-spotify-dl-tile">
                <HardDrive size={18} />
              </div>
              <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                <div className="cw-spotify-lib-name cw-ellipsis">Downloads</div>
                <div className="cw-spotify-lib-sub cw-ellipsis">
                  {downloadedCount} saved{offlineMode ? ' · OFFLINE' : ''}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="cw-spotify-lib-row"
              data-active={isRoute('stats')}
              onClick={() => onSelectRoute({ kind: 'stats' })}
            >
              <div className="cw-spotify-lib-art cw-spotify-stats-tile">
                <BarChart3 size={18} />
              </div>
              <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                <div className="cw-spotify-lib-name cw-ellipsis">Stats &amp; Wrapped</div>
                <div className="cw-spotify-lib-sub cw-ellipsis">
                  {stats.totalPlays} plays · {listenLabel}
                </div>
              </div>
            </button>

            {smartPlaylists.map((sp) => (
              <button
                key={sp.id}
                type="button"
                className="cw-spotify-lib-row"
                data-active={isRoute('playlist', sp.id)}
                onClick={() => onSelectRoute({ kind: 'playlist', id: sp.id })}
              >
                <div className="cw-spotify-lib-art cw-spotify-stats-tile">
                  <Sparkles size={17} />
                </div>
                <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                  <div className="cw-spotify-lib-name cw-ellipsis">{sp.name}</div>
                  <div className="cw-spotify-lib-sub cw-ellipsis">
                    Smart Mix · {sp.tracks.length} {sp.tracks.length === 1 ? 'song' : 'songs'}
                  </div>
                </div>
              </button>
            ))}

            {playlists.length === 0 ? (
              <div className="cw-sidebar-empty">No playlists yet</div>
            ) : (
              playlists.map((pl) => {
                const thumb = pl.tracks.find((t) => Boolean(t.thumbnailUrl))?.thumbnailUrl;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    className="cw-spotify-lib-row"
                    data-active={isRoute('playlist', pl.id)}
                    onClick={() => onSelectRoute({ kind: 'playlist', id: pl.id })}
                  >
                    {thumb ? (
                      <img className="cw-spotify-lib-art" src={thumb} alt="" />
                    ) : (
                      <div className="cw-spotify-lib-art cw-spotify-empty-tile">
                        <ListMusic size={17} />
                      </div>
                    )}
                    <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                      <div className="cw-spotify-lib-name cw-ellipsis">{pl.name}</div>
                      <div className="cw-spotify-lib-sub cw-ellipsis">
                        Playlist · {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="cw-sidebar-scroll">
            {/* Discover */}
            <div className="cw-sidebar-section-label">
              {layoutSkin === 'apple'
                ? 'Apple Music'
                : layoutSkin === 'tidal'
                  ? 'DISCOVER // HIFI'
                  : layoutSkin === 'nothing'
                    ? '01 DISCOVER'
                    : 'Discover'}
            </div>
            <SidebarNavButton
              icon={<Home size={17} className="cw-ic-home" />}
              label="Home"
              active={isRoute('home')}
              onClick={() => onSelectRoute({ kind: 'home' })}
            />
            <SidebarNavButton
              icon={<Compass size={17} className="cw-ic-explore" />}
              label="Explore"
              active={isRoute('explore')}
              onClick={() => onSelectRoute({ kind: 'explore' })}
            />
            {layoutSkin !== 'apple' && (
              <SidebarNavButton
                icon={<Search size={17} className="cw-ic-search" />}
                label="Search"
                active={isRoute('search')}
                onClick={() => onSelectRoute({ kind: 'search' })}
              />
            )}

            {layoutSkin === 'ytmusic' && <div className="cw-ytm-rail-divider" />}

            {/* Library */}
            <div className="cw-sidebar-section-label">
              {layoutSkin === 'tidal'
                ? 'MY COLLECTION'
                : layoutSkin === 'nothing'
                  ? '02 LIBRARY'
                  : 'Library'}
            </div>
            <SidebarNavButton
              icon={<Heart size={17} className="cw-ic-liked" />}
              label="Liked Songs"
              badge={likedCount > 0 ? String(likedCount) : undefined}
              active={isRoute('liked')}
              onClick={() => onSelectRoute({ kind: 'liked' })}
            />
            <SidebarNavButton
              icon={<Clock size={17} className="cw-ic-recent" />}
              label="Recently Played"
              badge={recentCount > 0 ? String(recentCount) : undefined}
              active={isRoute('recent')}
              onClick={() => onSelectRoute({ kind: 'recent' })}
            />
            <SidebarNavButton
              icon={<HardDrive size={17} />}
              label="Downloads"
              badge={offlineMode ? 'OFFLINE' : downloadedCount > 0 ? String(downloadedCount) : undefined}
              active={isRoute('downloads')}
              onClick={() => onSelectRoute({ kind: 'downloads' })}
            />
            <SidebarNavButton
              icon={<BarChart3 size={17} className="cw-ic-stats" />}
              label="Stats & Wrapped"
              badge={stats.totalPlays > 0 ? String(stats.totalPlays) : undefined}
              active={isRoute('stats')}
              onClick={() => onSelectRoute({ kind: 'stats' })}
            />

            {layoutSkin === 'ytmusic' && (
              <div className="cw-ytm-new-pl-wrap">
                <button
                  type="button"
                  className="cw-ytm-new-pl-btn"
                  onClick={onNewPlaylist}
                >
                  <Plus size={15} />
                  <span>New playlist</span>
                </button>
                <span className="cw-tip-anchor" data-tip="Import Playlist" data-tip-pos="bottom">
                  <button
                    type="button"
                    className="cw-sidebar-mini-btn"
                    aria-label="Import playlist"
                    onClick={onImportPlaylist}
                  >
                    <Download size={13} className="cw-ic-import" />
                  </button>
                </span>
              </div>
            )}

            {smartPlaylists.length > 0 && (
              <>
                <div className="cw-sidebar-section-label">Smart Mixes</div>
                {smartPlaylists.map((sp) => (
                  <SidebarNavButton
                    key={sp.id}
                    icon={<Sparkles size={15} className="cw-ic-sparkle" />}
                    label={sp.name}
                    badge={sp.tracks.length > 0 ? String(sp.tracks.length) : undefined}
                    active={isRoute('playlist', sp.id)}
                    onClick={() => onSelectRoute({ kind: 'playlist', id: sp.id })}
                  />
                ))}
              </>
            )}

            {/* Playlists */}
            <div className="cw-sidebar-section-header">
              <span className="cw-sidebar-section-label" style={{ margin: 0, padding: 0 }}>
                Playlists
              </span>
              {layoutSkin !== 'ytmusic' && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className="cw-tip-anchor" data-tip="Import Playlist (YT / Spotify)" data-tip-pos="bottom">
                    <button
                      type="button"
                      className="cw-sidebar-mini-btn"
                      aria-label="Import playlist"
                      onClick={onImportPlaylist}
                    >
                      <Download size={13} className="cw-ic-import" />
                    </button>
                  </span>
                  <span className="cw-tip-anchor" data-tip="Create New Playlist" data-tip-pos="bottom">
                    <button
                      type="button"
                      className="cw-sidebar-mini-btn"
                      aria-label="Create playlist"
                      onClick={onNewPlaylist}
                    >
                      <Plus size={13} className="cw-ic-add" />
                    </button>
                  </span>
                </div>
              )}
            </div>

            {playlists.length === 0 ? (
              <div className="cw-sidebar-empty">No playlists yet</div>
            ) : (
              playlists.map((pl) => {
                const thumb = pl.tracks.find((t) => Boolean(t.thumbnailUrl))?.thumbnailUrl;
                return (
                  <SidebarNavButton
                    key={pl.id}
                    icon={
                      thumb ? (
                        <img className="cw-sidebar-pl-thumb" src={thumb} alt="" />
                      ) : (
                        <ListMusic size={16} className="cw-ic-playlist" />
                      )
                    }
                    label={pl.name}
                    badge={pl.tracks.length > 0 ? String(pl.tracks.length) : undefined}
                    active={isRoute('playlist', pl.id)}
                    onClick={() => onSelectRoute({ kind: 'playlist', id: pl.id })}
                  />
                );
              })
            )}
          </div>
        )}

        {/* Mini Stats + Quick Tools Card (ClaudeWaves Default Skin) */}
        {layoutSkin === 'default' && (
        <div className="cw-sidebar-widget">
          <div
            className="cw-sidebar-widget-head"
            style={{ cursor: 'pointer' }}
            title="Open Full Stats & Listening Wrapped"
            onClick={() => onSelectRoute({ kind: 'stats' })}
          >
            <span className="cw-sidebar-widget-title">
              <BarChart3 size={12} color="var(--cw-accent)" />
              <span>STATS</span>
              <span className="cw-sidebar-widget-arrow" aria-hidden="true">›</span>
            </span>
            <span className="cw-sidebar-widget-pill">{listenLabel}</span>
          </div>

          <div className="cw-sidebar-widget-metrics">
            <div className="cw-sidebar-metric">
              <div className="cw-sidebar-metric-label">Plays</div>
              <div className="cw-sidebar-metric-val">{stats.totalPlays}</div>
            </div>
            <div className="cw-sidebar-metric">
              <div className="cw-sidebar-metric-label">Top Artist</div>
              <button
                type="button"
                className="cw-sidebar-artist-btn cw-ellipsis"
                disabled={topArtist === '—'}
                title={topArtist !== '—' ? `Open artist: ${topArtist}` : undefined}
                onClick={() => topArtist !== '—' && onOpenArtist(topArtist)}
              >
                {topArtist}
              </button>
            </div>
          </div>

          <div className="cw-sidebar-quick-grid">
            <button
              type="button"
              className="cw-sidebar-quick-btn cw-tip-anchor"
              data-eq-trigger="true"
              data-tip={eqOpen ? 'Close Equalizer' : `10-Band EQ (${eqPreset})`}
              data-active={eqOpen || eqPreset !== 'Flat'}
              onClick={onOpenEq}
            >
              <Sliders size={13} />
              <span>EQ</span>
            </button>
            <button
              type="button"
              className="cw-sidebar-quick-btn cw-tip-anchor"
              data-tip="Cycle Sleep Timer"
              data-active={sleepRemainingSec !== null}
              onClick={onCycleSleepTimer}
            >
              <Moon size={13} />
              <span>{sleepRemainingSec !== null ? formatDuration(sleepRemainingSec * 1000) : 'Sleep'}</span>
            </button>
            <button
              type="button"
              className="cw-sidebar-quick-btn cw-tip-anchor"
              data-tip={autoRadio ? 'Auto-Radio On' : 'Auto-Radio Off'}
              data-active={autoRadio}
              onClick={onToggleAutoRadio}
            >
              <Radio size={13} />
              <span>Radio</span>
            </button>
          </div>
        </div>
        )}

        {/* Bottom Settings */}
        <div className="cw-sidebar-footer">
          <SidebarNavButton
            icon={<Settings size={17} className="cw-ic-settings" />}
            label="Settings"
            active={isRoute('settings')}
            onClick={() => onSelectRoute({ kind: 'settings' })}
          />
        </div>
      </GlassCard>
    </aside>
  );
});

interface SidebarNavButtonProps {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}

const SidebarNavButton: React.FC<SidebarNavButtonProps> = ({
  icon,
  label,
  badge,
  active,
  onClick,
}) => (
  <button
    type="button"
    className="cw-sidebar-item"
    data-active={active}
    onClick={onClick}
  >
    <span className="cw-sidebar-item-icon">{icon}</span>
    <span className="cw-sidebar-item-label cw-ellipsis">{label}</span>
    {badge && <span className="cw-sidebar-badge">{badge}</span>}
  </button>
);
