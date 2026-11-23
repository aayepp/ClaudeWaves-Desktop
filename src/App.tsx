import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSegmented,
  GlassSheet,
  setGlassQuality,
} from '@zakisheriff/liquid-glass';
import {
  Check,
  Compass,
  Download,
  GripVertical,
  HardDrive,
  Heart,
  Home,
  ListMusic,
  ListPlus,
  Loader2,
  Mic2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  fetchAuthStatus,
  fetchMySpotifyPlaylists,
  fetchMyYtPlaylists,
  importPlaylistByUrl,
  loginSpotify,
  loginYouTubeMusic,
  logoutSpotify,
  logoutYouTubeMusic,
  type AuthStatus,
} from './api/auth';
import {
  controlFloatingLyrics,
  extractDominantHex,
  fetchArtistPage,
  setDesktopFullscreen,
  setMiniWindowMode,
  updateDesktopConfig,
} from './api/extras';
import { fetchExploreFeed, fetchHomeFeed, searchYouTubeMusic } from './api/youtube';
import {
  clearOfflineTracksApi,
  deleteOfflineTrackApi,
  downloadTrackToDisk,
  fetchOfflineList,
} from './api/offline';
import {
  checkAppUpdates,
  downloadAndInstallUpdate,
  fetchLastFmStatus,
  openReleaseUrl,
  type LastFmStatus,
  type UpdateCheckResult,
} from './api/social';
import { AmbientVisualizerView } from './components/AmbientVisualizerView';
import { AndroidSplash } from './components/AndroidSplash';
import { ArtistView } from './components/ArtistView';
import { CoverFlowDeck } from './components/CoverFlowDeck';
import { buildWaveHeights } from './components/FlatSeekbar';
import {
  FloatingLyricsBridge,
  resolveActiveLyricPair,
} from './components/FloatingLyricsBridge';
import { HorizontalShelf } from './components/HorizontalShelf';
import { ImportModal } from './components/ImportModal';
import { MiniPlayerView } from './components/MiniPlayerView';
import { NowPlayingSheet, type SheetOrigin } from './components/NowPlayingSheet';
import { PlayerDock } from './components/PlayerDock';
import { PlaylistView } from './components/PlaylistView';
import { ProfileModal } from './components/ProfileModal';
import { QuickEqPopover } from './components/QuickEqPopover';
import { RightSidePanel } from './components/RightSidePanel';
import { SettingsView, type SettingsTab } from './components/SettingsView';
import { Sidebar, type SidebarRoute } from './components/Sidebar';
import { SocialPresenceBridge } from './components/SocialPresenceBridge';
import { OnboardingWizard } from './components/SplashAndOnboarding';
import { StatsView } from './components/StatsView';
import {
  getDefaultFloatingVideoBox,
  SyncedVideoPlayer,
  type FloatingVideoBox,
} from './components/SyncedVideoPlayer';
import { getPlaybackPositionMs } from './hooks/playbackClock';
import { usePlayer } from './hooks/usePlayer';
import { LAST_PLAYBACK_STORAGE_KEY, useLibrary } from './store/useLibrary';
import {
  formatDuration,
  type AppSettings,
  type ArtistPageData,
  type HomeShelf,
  type OfflineTrackEntry,
  type SavedPlaybackState,
  type SearchFilter,
  type Track,
  type UserPlaylist,
} from './types';

const QUICK_SEARCHES = [
  'Lo-fi beats',
  'Daft Punk',
  'The Weeknd',
  'Nujabes',
  'YOASOBI',
  'Yuna',
  'Radiohead',
  'Ambient focus',
];

const FILTERS: SearchFilter[] = ['all', 'songs', 'videos'];

const MOOD_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'energize', label: 'Energize' },
  { id: 'chill', label: 'Chill' },
  { id: 'focus', label: 'Focus' },
  { id: 'workout', label: 'Workout' },
  { id: 'pop', label: 'Pop' },
  { id: 'malay', label: 'Malay & Indie' },
  { id: 'latenight', label: 'Late Night' },
] as const;

function srgbLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0.5;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = toLin(parseInt(clean.slice(0, 2), 16) / 255);
  const g = toLin(parseInt(clean.slice(2, 4), 16) / 255);
  const b = toLin(parseInt(clean.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Guarantees every accent color (cover-extracted or custom preset) meets readable contrast
 * against Dark or Light surfaces so text/icons NEVER vanish on any theme.
 */
function ensureReadableAccent(hex: string, isDark: boolean): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return isDark ? '#FFFFFF' : '#111318';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  if (s < 0.1) return isDark ? '#FFFFFF' : '#111318';
  // Clamp lightness for high contrast on dark vs light surfaces
  const targetL = isDark ? Math.max(0.62, Math.min(0.78, l)) : Math.max(0.3, Math.min(0.44, l));
  const targetS = isDark ? Math.max(0.5, Math.min(0.92, s)) : Math.max(0.56, Math.min(0.95, s));

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v * 255))).toString(16).padStart(2, '0');
  return `#${toHex(hue2rgb(p, q, h + 1 / 3))}${toHex(hue2rgb(p, q, h))}${toHex(hue2rgb(p, q, h - 1 / 3))}`;
}

function isChromaticHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 0 && (max - min) / max >= 0.16;
}

export const App: React.FC = () => {
  const {
    library,
    updateSettings,
    toggleLike,
    recordRecent,
    createPlaylist,
    mergeLikedTracks,
    syncPlaylistTracks,
    deletePlaylist,
    addTrackToPlaylist,
    exportBackupJson,
    importBackupJson,
    clearHistoryCache,
    setTrackLyricsOffset,
    saveLastPlayback,
  } = useLibrary();

  const { settings } = library;
  const intensity = settings.glassIntensity;

  const [route, setRoute] = useState<SidebarRoute>({ kind: 'home' });
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('accounts');
  const prevRouteRef = useRef<SidebarRoute>({ kind: 'home' });
  const mainScrollRef = useRef<HTMLElement | null>(null);

  // Draggable Home Section state (hover grip armed -> drop before/after)
  const [dragArmId, setDragArmId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);

  // Android 1:1 Splash & First-Time 5-Step Onboarding Wizard
  const [splashVisible, setSplashVisible] = useState(true);
  const [onboardingOpen, setOnboardingOpen] = useState(!settings.onboardingCompleted);
  const [onboardingRepeat, setOnboardingRepeat] = useState(false);

  // Mini Floating Always-on-Top Player Mode
  const [miniMode, setMiniMode] = useState(false);

  // Toast feedback (e.g. Best Part jump)
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2400);
  }, []);

  // Home + Moods
  const [activeMood, setActiveMood] = useState<string>('all');
  const moodCacheRef = useRef<Record<string, HomeShelf[]>>({});
  const [homeShelves, setHomeShelves] = useState<HomeShelf[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  // Explore
  const [exploreShelves, setExploreShelves] = useState<HomeShelf[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);

  // Artist Page
  const [artistData, setArtistData] = useState<ArtistPageData | null>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilterIdx, setSearchFilterIdx] = useState(1);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Panels & Modals
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'lyrics' | 'queue'>('lyrics');
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [sheetOrigin, setSheetOrigin] = useState<SheetOrigin>({ mode: 'dock' });
  const [videoMode, setVideoMode] = useState(false);
  const [floatingVideoBox, setFloatingVideoBox] = useState<FloatingVideoBox>(getDefaultFloatingVideoBox);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState<number>(0);
  const [pendingImportTab, setPendingImportTab] = useState<number | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [floatingLyricsOpen, setFloatingLyricsOpen] = useState(false);
  const [ambientModeOpen, setAmbientModeOpen] = useState(false);
  const ambientModeRef = useRef(ambientModeOpen);
  ambientModeRef.current = ambientModeOpen;
  const [eqPopupOpen, setEqPopupOpen] = useState(false);
  const eqPopupOpenRef = useRef(eqPopupOpen);
  eqPopupOpenRef.current = eqPopupOpen;

  // Offline downloads store
  const [offlineEntries, setOfflineEntries] = useState<OfflineTrackEntry[]>([]);
  const [offlineTotalBytes, setOfflineTotalBytes] = useState(0);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadingBatch, setDownloadingBatch] = useState(false);

  const refreshOfflineList = useCallback(async () => {
    const res = await fetchOfflineList();
    setOfflineEntries(res.tracks);
    setOfflineTotalBytes(res.totalBytes);
  }, []);

  useEffect(() => {
    refreshOfflineList();
  }, [refreshOfflineList]);

  const offlineIds = useMemo(
    () => new Set(offlineEntries.map((t) => t.videoId)),
    [offlineEntries],
  );

  // Auth status
  const [auth, setAuth] = useState<AuthStatus>({
    yt: { connected: false },
    spotify: { connected: false },
    nativeLoginAvailable: false,
  });

  const [lastFmStatus, setLastFmStatus] = useState<LastFmStatus>({
    connected: false,
    username: '',
    scrobbledCount: 0,
  });
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const [bannerUpdating, setBannerUpdating] = useState(false);

  useEffect(() => {
    fetchAuthStatus().then(setAuth).catch(() => {});
    fetchLastFmStatus().then(setLastFmStatus).catch(() => {});
    const updateTimer = window.setTimeout(() => {
      checkAppUpdates().then((info) => {
        if (info) setUpdateInfo(info);
      });
    }, 4000);
    return () => window.clearTimeout(updateTimer);
  }, []);

  const handleSponsorSkip = useCallback(
    (category: string) => {
      const label = category === 'music_offtopic' ? 'Non-Music Segment' : category;
      showToast(`SponsorBlock: Skipped ${label}`);
    },
    [showToast],
  );

  const dspOptions = useMemo(
    () => ({
      volumeNormalizer: settings.volumeNormalizer,
      spatialAudio: settings.spatialAudio,
      autoEqProfile: settings.autoEqProfile,
      sponsorBlockEnabled: settings.sponsorBlockEnabled,
      offlineMode: settings.offlineMode,
      offlineIds,
      onSponsorSkip: handleSponsorSkip,
    }),
    [
      settings.volumeNormalizer,
      settings.spatialAudio,
      settings.autoEqProfile,
      settings.sponsorBlockEnabled,
      settings.offlineMode,
      offlineIds,
      handleSponsorSkip,
    ],
  );

  const player = usePlayer(
    settings.volume,
    settings.eqGains,
    settings.playbackRate,
    settings.crossfadeSec,
    settings.autoRadio,
    recordRecent,
    dspOptions,
  );
  const playerStateRef = useRef(player.state);
  playerStateRef.current = player.state;
  const uiPanelRef = useRef({ rightPanelOpen, rightPanelTab, fullSheetOpen });
  uiPanelRef.current = { rightPanelOpen, rightPanelTab, fullSheetOpen };
  const restoredPlaybackRef = useRef(false);

  const buildPlaybackSnapshot = useCallback((): SavedPlaybackState | null => {
    const cur = playerStateRef.current;
    if (!cur.currentTrack) return null;
    const MAX_Q = 60;
    let queue = cur.queue;
    let idx = Math.max(0, cur.currentIndex);
    if (queue.length > MAX_Q) {
      const start = Math.max(0, Math.min(queue.length - MAX_Q, idx - Math.floor(MAX_Q / 2)));
      queue = queue.slice(start, start + MAX_Q);
      idx = Math.max(0, Math.min(queue.length - 1, idx - start));
    }
    const ui = uiPanelRef.current;
    return {
      currentTrack: cur.currentTrack,
      queue,
      currentIndex: idx,
      positionMs: Math.max(0, Math.round(getPlaybackPositionMs())),
      durationMs: Math.max(0, Math.round(cur.durationMs || cur.currentTrack.durationMs)),
      shuffle: cur.shuffle,
      repeatMode: cur.repeatMode,
      rightPanelOpen: ui.rightPanelOpen,
      rightPanelTab: ui.rightPanelTab,
      fullSheetOpen: ui.fullSheetOpen,
    };
  }, []);

  // Auto-restore last played track, queue, exact position (Paused) & last open Lyrics view
  useEffect(() => {
    if (restoredPlaybackRef.current || player.state.currentTrack) return;
    let candidate = library.lastPlayback ?? null;
    if (!candidate) {
      try {
        const raw = localStorage.getItem(LAST_PLAYBACK_STORAGE_KEY);
        if (raw) candidate = JSON.parse(raw) as SavedPlaybackState;
      } catch {
        // Ignore invalid JSON
      }
    }
    if (candidate?.currentTrack) {
      restoredPlaybackRef.current = true;
      player.restoreSession(candidate);
      if (candidate.fullSheetOpen && candidate.rightPanelTab === 'lyrics') {
        setRightPanelTab('lyrics');
        setFullSheetOpen(true);
      } else if (candidate.rightPanelOpen) {
        setRightPanelTab(candidate.rightPanelTab ?? 'lyrics');
        setRightPanelOpen(true);
      }
    }
  }, [library.lastPlayback, player.state.currentTrack, player.restoreSession]);

  // Persist playback immediately on track/pause/shuffle/repeat/lyrics-panel transitions
  useEffect(() => {
    if (!player.state.currentTrack) return;
    const snap = buildPlaybackSnapshot();
    if (snap) saveLastPlayback(snap);
  }, [
    player.state.currentTrack?.videoId,
    player.state.isPlaying,
    player.state.shuffle,
    player.state.repeatMode,
    player.state.queue.length,
    rightPanelOpen,
    rightPanelTab,
    fullSheetOpen,
    buildPlaybackSnapshot,
    saveLastPlayback,
  ]);

  // Throttled 2.5s progress snapshot while playing + immediate flush on window close
  useEffect(() => {
    if (!player.state.isPlaying) return;
    const timer = window.setInterval(() => {
      const snap = buildPlaybackSnapshot();
      if (snap) saveLastPlayback(snap);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [player.state.isPlaying, buildPlaybackSnapshot, saveLastPlayback]);

  useEffect(() => {
    const onBeforeUnload = () => {
      const snap = buildPlaybackSnapshot();
      if (snap) saveLastPlayback(snap, true);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [buildPlaybackSnapshot, saveLastPlayback]);

  const likedIds = useMemo(
    () => new Set(library.likedTracks.map((t) => t.videoId)),
    [library.likedTracks],
  );

  // Cover Art Accent / Wave Palette Extraction (always run once per track for cover-colored waves)
  const [trackCoverHex, setTrackCoverHex] = useState<string | null>(null);
  useEffect(() => {
    const thumb = player.state.currentTrack?.thumbnailUrl;
    if (!thumb) {
      setTrackCoverHex(null);
      return;
    }
    let cancelled = false;
    extractDominantHex(thumb).then((hex) => {
      if (!cancelled) setTrackCoverHex(hex);
    });
    return () => {
      cancelled = true;
    };
  }, [player.state.currentTrack?.thumbnailUrl]);

  // System Light / Dark detection
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = settings.themeMode === 'system' ? systemDark : settings.themeMode === 'dark';

  const activeAccent = useMemo(() => {
    if (settings.followCoverAccent && trackCoverHex) {
      return ensureReadableAccent(trackCoverHex, isDark);
    }
    if (settings.layoutSkin === 'spotify') {
      if (settings.accentHex.startsWith('#')) {
        return ensureReadableAccent(settings.accentHex, isDark);
      }
      return isDark ? '#1ED760' : '#169C46';
    }
    if (settings.layoutSkin === 'ytmusic') {
      if (settings.accentHex.startsWith('#')) {
        return ensureReadableAccent(settings.accentHex, isDark);
      }
      return isDark ? '#FF0033' : '#D9002B';
    }
    if (settings.layoutSkin === 'apple') {
      if (settings.accentHex.startsWith('#')) {
        return ensureReadableAccent(settings.accentHex, isDark);
      }
      return isDark ? '#FA2D48' : '#D60017';
    }
    if (settings.layoutSkin === 'tidal') {
      if (settings.accentHex.startsWith('#')) {
        return ensureReadableAccent(settings.accentHex, isDark);
      }
      return isDark ? '#00E5FF' : '#007F8C';
    }
    if (settings.layoutSkin === 'soundcloud') {
      if (settings.accentHex.startsWith('#')) {
        return ensureReadableAccent(settings.accentHex, isDark);
      }
      return isDark ? '#FF5500' : '#D94600';
    }
    if (settings.layoutSkin === 'nothing') {
      if (settings.accentHex.startsWith('#')) {
        return ensureReadableAccent(settings.accentHex, isDark);
      }
      return isDark ? '#D71921' : '#C9161D';
    }
    if (settings.themePreset === 'comic') {
      if (settings.accentHex.startsWith('#')) {
        return ensureReadableAccent(settings.accentHex, isDark);
      }
      return isDark ? '#FFD60A' : '#D22018';
    }
    if (settings.themePreset === 'rhythmo') {
      if (settings.accentHex.startsWith('#')) {
        return ensureReadableAccent(settings.accentHex, isDark);
      }
      return isDark ? '#259D8A' : '#0F8C78';
    }
    if (settings.themePreset === 'dynamic' && settings.accentHex.startsWith('#')) {
      return ensureReadableAccent(settings.accentHex, isDark);
    }
    return isDark ? '#FFFFFF' : '#111318';
  }, [
    settings.layoutSkin,
    settings.themePreset,
    settings.accentHex,
    settings.followCoverAccent,
    trackCoverHex,
    isDark,
  ]);

  const waveColorHex = useMemo(() => {
    if (trackCoverHex && isChromaticHex(trackCoverHex)) {
      return ensureReadableAccent(trackCoverHex, isDark);
    }
    if (
      settings.layoutSkin !== 'default' ||
      settings.themePreset === 'comic' ||
      settings.themePreset === 'rhythmo'
    ) {
      return activeAccent;
    }
    if (settings.themePreset === 'dynamic' && settings.accentHex.startsWith('#')) {
      return activeAccent;
    }
    return isDark ? '#60A5FA' : '#0A66E6';
  }, [
    trackCoverHex,
    isDark,
    settings.layoutSkin,
    settings.themePreset,
    settings.accentHex,
    activeAccent,
  ]);

  useEffect(() => {
    setGlassQuality(
      settings.layoutSkin !== 'default' || settings.themePreset === 'rhythmo'
        ? 'low'
        : settings.glassQuality,
    );
  }, [settings.glassQuality, settings.themePreset, settings.layoutSkin]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = isDark ? 'dark' : 'light';
    html.dataset.preset = settings.layoutSkin === 'default' ? settings.themePreset : 'skin';
    html.dataset.skin = settings.layoutSkin;
    html.dataset.amoled = String(settings.amoled);

    const onAccent = srgbLuminance(activeAccent) > 0.34 ? '#0b0c10' : '#ffffff';
    const isCustomColor =
      (settings.followCoverAccent && Boolean(trackCoverHex)) ||
      ((settings.layoutSkin !== 'default' ||
        settings.themePreset === 'dynamic' ||
        settings.themePreset === 'comic' ||
        settings.themePreset === 'rhythmo') &&
        settings.accentHex.startsWith('#'));

    if (isCustomColor) {
      html.style.setProperty('--cw-accent', activeAccent);
      html.style.setProperty('--cw-on-accent', onAccent);
      html.style.setProperty('--lg-accent', activeAccent);
      html.style.setProperty('--cw-blob-a', `${activeAccent}2e`);
      html.style.setProperty('--cw-row-active', `${activeAccent}22`);
      html.style.setProperty('--cw-lyric-hl', activeAccent);
      html.style.setProperty('--cw-lyric-hl-bg', `${activeAccent}22`);
      html.style.setProperty('--cw-lyric-hl-border', `${activeAccent}55`);
      html.style.setProperty('--cw-lyric-hl-glow', `${activeAccent}85`);
    } else {
      html.style.removeProperty('--cw-accent');
      html.style.removeProperty('--cw-on-accent');
      html.style.removeProperty('--lg-accent');
      html.style.removeProperty('--cw-blob-a');
      html.style.removeProperty('--cw-row-active');
      html.style.removeProperty('--cw-lyric-hl');
      html.style.removeProperty('--cw-lyric-hl-bg');
      html.style.removeProperty('--cw-lyric-hl-border');
      html.style.removeProperty('--cw-lyric-hl-glow');
    }
  }, [
    isDark,
    settings.layoutSkin,
    settings.themePreset,
    settings.amoled,
    settings.accentHex,
    settings.followCoverAccent,
    trackCoverHex,
    activeAccent,
  ]);

  const routeScrollKey =
    route.kind === 'playlist'
      ? `pl-${route.id}`
      : route.kind === 'artist'
        ? `ar-${route.name}`
        : `${route.kind}-${activeMood}`;

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [routeScrollKey]);

  const loadHome = useCallback(async (mood: string = activeMood, force = false) => {
    if (!force && moodCacheRef.current[mood]?.length) {
      setHomeShelves(moodCacheRef.current[mood]);
      setHomeError(null);
      return;
    }
    setHomeLoading(true);
    setHomeError(null);
    try {
      const data = await fetchHomeFeed(mood);
      moodCacheRef.current[mood] = data;
      setHomeShelves(data);
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : 'Failed to load Home Feed');
    } finally {
      setHomeLoading(false);
    }
  }, [activeMood]);

  const loadExplore = useCallback(async () => {
    setExploreLoading(true);
    setExploreError(null);
    try {
      const data = await fetchExploreFeed();
      setExploreShelves(data);
    } catch (err) {
      setExploreError(err instanceof Error ? err.message : 'Failed to load Explore');
    } finally {
      setExploreLoading(false);
    }
  }, []);

  const openArtist = useCallback((artistName: string) => {
    const clean = artistName.trim();
    if (!clean) return;
    if (route.kind !== 'artist') prevRouteRef.current = route;
    setRoute({ kind: 'artist', name: clean });
    setArtistLoading(true);
    setArtistError(null);
    setArtistData(null);
    fetchArtistPage(clean)
      .then(setArtistData)
      .catch((err) => setArtistError(err instanceof Error ? err.message : 'Failed to load artist'))
      .finally(() => setArtistLoading(false));
  }, [route]);

  const handleBestPart = useCallback(() => {
    const info = player.jumpToBestPart();
    if (info) {
      showToast(`✨ Best Part • ${formatDuration(info.timeMs)} (${info.source})`);
    }
  }, [player, showToast]);

  const toggleMiniMode = useCallback(async (enable: boolean) => {
    setMiniMode(enable);
    if (enable) setFullSheetOpen(false);
    await setMiniWindowMode(enable);
  }, []);

  useEffect(() => {
    loadHome('all');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (route.kind === 'explore' && exploreShelves.length === 0 && !exploreLoading) {
      loadExplore();
    }
  }, [route.kind, exploreShelves.length, exploreLoading, loadExplore]);

  const runSearch = useCallback(
    async (q: string = searchQuery, filterIndex: number = searchFilterIdx) => {
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }
      setRoute({ kind: 'search' });
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await searchYouTubeMusic(q, FILTERS[filterIndex] ?? 'songs');
        setSearchResults(res);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearchLoading(false);
      }
    },
    [searchQuery, searchFilterIdx],
  );

  const toggleRightPanel = useCallback(
    (tab: 'lyrics' | 'queue') => {
      setRightPanelOpen((open) => {
        if (open && rightPanelTab === tab) return false;
        setRightPanelTab(tab);
        return true;
      });
    },
    [rightPanelTab],
  );

  // Curated 10+ spotlight tracks starting from homeShelves[0] topped up from following shelves
  const spotlightTracks = useMemo(() => {
    const out: Track[] = [];
    const seen = new Set<string>();
    for (const shelf of homeShelves) {
      for (const track of shelf.tracks) {
        if (seen.has(track.videoId)) continue;
        seen.add(track.videoId);
        out.push(track);
        if (out.length >= 10) return out;
      }
    }
    return out;
  }, [homeShelves]);

  // Skin-specific Home hero derivations (no playback clock subscription here)
  const spotifyShortcuts = useMemo(() => {
    const out: Array<{ track: Track; list: Track[] }> = [];
    const seen = new Set<string>();
    const recentList = library.recentlyPlayed;
    const shelfList = homeShelves[0]?.tracks ?? spotlightTracks;
    for (const track of recentList) {
      if (seen.has(track.videoId)) continue;
      seen.add(track.videoId);
      out.push({ track, list: recentList });
      if (out.length >= 8) return out;
    }
    for (const track of shelfList) {
      if (seen.has(track.videoId)) continue;
      seen.add(track.videoId);
      out.push({ track, list: shelfList });
      if (out.length >= 8) return out;
    }
    return out;
  }, [library.recentlyPlayed, homeShelves, spotlightTracks]);

  const ytmQuickPicks = useMemo(() => {
    const source = homeShelves[0]?.tracks?.length ? homeShelves[0].tracks : spotlightTracks;
    const out: Track[] = [];
    const seen = new Set<string>();
    for (const track of source) {
      if (seen.has(track.videoId)) continue;
      seen.add(track.videoId);
      out.push(track);
      if (out.length >= 12) return out;
    }
    for (const track of spotlightTracks) {
      if (seen.has(track.videoId)) continue;
      seen.add(track.videoId);
      out.push(track);
      if (out.length >= 12) return out;
    }
    return out;
  }, [homeShelves, spotlightTracks]);

  const appleTopPicks = useMemo(() => spotlightTracks.slice(0, 4), [spotlightTracks]);
  const tidalSpotlights = useMemo(() => spotlightTracks.slice(0, 2), [spotlightTracks]);
  const scWaveCards = useMemo(() => spotlightTracks.slice(0, 4), [spotlightTracks]);
  const nothingWidgets = useMemo(() => spotlightTracks.slice(0, 4), [spotlightTracks]);

  // Stabilized callbacks for React.memo Sidebar, CoverFlowDeck, RightSidePanel & PlayerDock
  const handleSearchChange = useCallback((q: string) => setSearchQuery(q), []);
  const handleSearchSubmit = useCallback(() => runSearch(), [runSearch]);
  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, []);
  const handleSelectRoute = useCallback((next: SidebarRoute) => {
    setRoute(next);
    if (next.kind === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, []);
  const handleOpenProfile = useCallback(() => setProfileModalOpen(true), []);
  const handleNewPlaylist = useCallback(() => setPlaylistModalOpen(true), []);
  const handleImportPlaylist = useCallback(() => {
    setImportInitialTab(auth.yt.connected ? 1 : auth.spotify.connected ? 2 : 0);
    setImportModalOpen(true);
  }, [auth.yt.connected, auth.spotify.connected]);
  const handlePlayFromList = useCallback((t: Track, list: Track[]) => player.playTrack(t, list), [player.playTrack]);
  const handleOpenFullSheet = useCallback(() => {
    setSheetOrigin({ mode: 'dock' });
    setFullSheetOpen(true);
  }, []);
  const handleEnterMini = useCallback(() => toggleMiniMode(true), [toggleMiniMode]);
  const handleToggleVideoMode = useCallback(() => {
    setVideoMode((prev) => {
      const next = !prev;
      if (next) setFloatingVideoBox(getDefaultFloatingVideoBox());
      return next;
    });
  }, []);
  const handleOpenEq = useCallback(() => {
    setEqPopupOpen((prev) => !prev);
  }, []);
  const handleCycleSleepTimer = useCallback(() => {
    const rem = playerStateRef.current.sleepRemainingSec;
    const nextMin =
      rem === null ? 15 : rem <= 900 ? 30 : rem <= 1800 ? 45 : rem <= 2700 ? 60 : null;
    player.setSleepTimer(nextMin);
    showToast(nextMin === null ? 'Sleep Timer: Off' : `Sleep Timer: ${nextMin}m`);
  }, [player.setSleepTimer, showToast]);
  const handleToggleAutoRadio = useCallback(() => {
    const next = !settings.autoRadio;
    updateSettings({ autoRadio: next });
    showToast(next ? 'Auto-Radio Up-Next: On' : 'Auto-Radio Up-Next: Off');
  }, [settings.autoRadio, updateSettings, showToast]);
  const queueTrackIds = useMemo(
    () => new Set(player.state.queue.map((t) => t.videoId)),
    [player.state.queue],
  );
  const [refreshingPlaylistKey, setRefreshingPlaylistKey] = useState<string | null>(null);

  const handleRefreshLiked = useCallback(async () => {
    if (refreshingPlaylistKey !== null) return;
    if (!auth.yt.connected) {
      showToast('Connect YouTube Music in Settings to sync Liked Songs.');
      return;
    }
    setRefreshingPlaylistKey('liked-songs');
    try {
      const res = await importPlaylistByUrl('VLLM');
      const { added, total } = mergeLikedTracks(res.tracks);
      showToast(
        added > 0
          ? `+${added} lagu liked baru dikemaskini! (${total} total)`
          : `Liked Songs sudah terkini (${total} lagu)`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Refresh gagal.');
    } finally {
      setRefreshingPlaylistKey(null);
    }
  }, [refreshingPlaylistKey, auth.yt.connected, mergeLikedTracks, showToast]);

  const handleRefreshPlaylist = useCallback(
    async (playlist: UserPlaylist) => {
      if (refreshingPlaylistKey !== null) return;
      setRefreshingPlaylistKey(playlist.id);
      try {
        let targetSource = playlist.source;
        let targetId = playlist.sourceId;

        if (!targetId) {
          if (/liked\s*(music|songs)/i.test(playlist.name)) {
            if (!auth.yt.connected) {
              throw new Error('Connect YouTube Music in Settings to refresh Liked Music.');
            }
            targetSource = 'youtube';
            targetId = 'VLLM';
          } else {
            const needle = playlist.name.trim().toLowerCase();
            if (auth.yt.connected) {
              const ytLists = await fetchMyYtPlaylists();
              const hit = ytLists.find((p) => p.title.trim().toLowerCase() === needle);
              if (hit) {
                targetSource = 'youtube';
                targetId = hit.url || hit.id;
              }
            }
            if (!targetId && auth.spotify.connected) {
              const spLists = await fetchMySpotifyPlaylists();
              const hit = spLists.find((p) => p.title.trim().toLowerCase() === needle);
              if (hit) {
                targetSource = 'spotify';
                targetId = hit.url || hit.id;
              }
            }
          }
        }

        if (!targetId) {
          showToast('Playlist lokal — tiada pautan YouTube/Spotify ditemui.');
          return;
        }

        const res = await importPlaylistByUrl(targetId);
        const { added, total } = syncPlaylistTracks(playlist.id, res.tracks, {
          source: res.source ?? targetSource,
          sourceId: targetId,
        });
        showToast(
          added > 0
            ? `+${added} lagu baru dikemaskini! (${total} lagu)`
            : `Playlist sudah terkini (${total} lagu)`,
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Refresh gagal.');
      } finally {
        setRefreshingPlaylistKey(null);
      }
    },
    [refreshingPlaylistKey, auth.yt.connected, auth.spotify.connected, syncPlaylistTracks, showToast],
  );
  const handleCloseRightPanel = useCallback(() => setRightPanelOpen(false), []);
  const handleLyricsModeChange = useCallback(
    (lyricsDisplayMode: AppSettings['lyricsDisplayMode']) => updateSettings({ lyricsDisplayMode }),
    [updateSettings],
  );
  const handleLyricsOffsetChange = useCallback(
    (ms: number) => {
      const vid = playerStateRef.current.currentTrack?.videoId;
      if (vid) setTrackLyricsOffset(vid, ms);
    },
    [setTrackLyricsOffset],
  );
  const handleToggleLikeCurrent = useCallback(() => {
    const cur = playerStateRef.current.currentTrack;
    if (cur) toggleLike(cur);
  }, [toggleLike]);
  const handlePlayQueueIndex = useCallback((idx: number) => player.playAtIndex(idx), [player.playAtIndex]);
  const handleVolumeChange = useCallback((v: number) => updateSettings({ volume: Math.round(v) }), [updateSettings]);

  const handleToggleFloatingLyrics = useCallback(async () => {
    const cur = playerStateRef.current.currentTrack;
    const offset = cur ? (library.lyricsOffsets[cur.videoId] ?? 0) : 0;
    const { line, nextLine } = resolveActiveLyricPair(
      cur,
      playerStateRef.current.lyrics,
      getPlaybackPositionMs(),
      offset,
    );
    const res = await controlFloatingLyrics({
      action: 'toggle',
      state: {
        title: cur?.title ?? '',
        artist: cur?.artist ?? '',
        line,
        nextLine,
        isPlaying: playerStateRef.current.isPlaying,
        accentHex: activeAccent,
      },
    });
    setFloatingLyricsOpen(res.open);
  }, [library.lyricsOffsets, activeAccent]);

  const ambientEnteredFullscreenRef = useRef(false);

  const handleOpenAmbientMode = useCallback(() => {
    setFullSheetOpen(false);
    setEqPopupOpen(false);
    setAmbientModeOpen(true);
    ambientEnteredFullscreenRef.current = true;
    setDesktopFullscreen(true);
  }, []);

  const handleOpenAmbientScreensaver = useCallback(() => {
    setFullSheetOpen(false);
    setEqPopupOpen(false);
    setAmbientModeOpen(true);
    ambientEnteredFullscreenRef.current = false;
  }, []);

  const handleCloseAmbientMode = useCallback(() => {
    setAmbientModeOpen(false);
    if (ambientEnteredFullscreenRef.current) {
      ambientEnteredFullscreenRef.current = false;
      setDesktopFullscreen(false);
    }
  }, []);

  const handleToggleAmbientMode = useCallback(() => {
    if (ambientModeRef.current) {
      handleCloseAmbientMode();
    } else {
      handleOpenAmbientMode();
    }
  }, [handleCloseAmbientMode, handleOpenAmbientMode]);

  // Auto-Ambient Screensaver when playing and user is idle inside app window
  useEffect(() => {
    const idleMin = settings.ambientIdleMinutes ?? 3;
    const eligible =
      idleMin > 0 &&
      player.state.isPlaying &&
      Boolean(player.state.currentTrack) &&
      !ambientModeOpen &&
      !miniMode &&
      !videoMode &&
      !onboardingOpen &&
      !splashVisible &&
      !importModalOpen &&
      !playlistModalOpen &&
      !profileModalOpen;
    if (!eligible) return;

    const timeoutMs = idleMin * 60_000;
    let timerId: number | null = null;
    let lastMoveResetAt = 0;

    const clearTimer = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleTimer = () => {
      clearTimer();
      if (document.hidden) return;
      timerId = window.setTimeout(() => {
        if (
          !document.hidden &&
          playerStateRef.current.isPlaying &&
          Boolean(playerStateRef.current.currentTrack) &&
          !ambientModeRef.current
        ) {
          handleOpenAmbientScreensaver();
        }
      }, timeoutMs);
    };

    const onPointerMove = () => {
      const now = Date.now();
      if (now - lastMoveResetAt < 500) return;
      lastMoveResetAt = now;
      scheduleTimer();
    };

    const onUserActivity = () => {
      lastMoveResetAt = Date.now();
      scheduleTimer();
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearTimer();
      else scheduleTimer();
    };

    scheduleTimer();
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });
    window.addEventListener('wheel', onUserActivity, { passive: true });
    window.addEventListener('touchstart', onUserActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimer();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('wheel', onUserActivity);
      window.removeEventListener('touchstart', onUserActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    settings.ambientIdleMinutes,
    player.state.isPlaying,
    player.state.currentTrack?.videoId,
    ambientModeOpen,
    miniMode,
    videoMode,
    onboardingOpen,
    splashVisible,
    importModalOpen,
    playlistModalOpen,
    profileModalOpen,
    handleOpenAmbientScreensaver,
  ]);

  const handleDownloadTrack = useCallback(
    async (track: Track) => {
      if (downloadingIds.has(track.videoId)) return;
      setDownloadingIds((prev) => new Set(prev).add(track.videoId));
      try {
        await downloadTrackToDisk(track);
        await refreshOfflineList();
        showToast(`Disimpan offline: ${track.title}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Muat turun gagal');
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(track.videoId);
          return next;
        });
      }
    },
    [downloadingIds, refreshOfflineList, showToast],
  );

  const handleRemoveDownload = useCallback(
    async (videoId: string) => {
      await deleteOfflineTrackApi(videoId);
      await refreshOfflineList();
      showToast('Lagu offline dipadam');
    },
    [refreshOfflineList, showToast],
  );

  const handleDownloadPlaylist = useCallback(
    async (tracks: Track[]) => {
      if (downloadingBatch || tracks.length === 0) return;
      const missing = tracks.filter((t) => !offlineIds.has(t.videoId));
      if (missing.length === 0) {
        showToast('Semua lagu dalam senarai sudah disimpan offline');
        return;
      }
      setDownloadingBatch(true);
      let okCount = 0;
      for (const track of missing) {
        setDownloadingIds((prev) => new Set(prev).add(track.videoId));
        try {
          await downloadTrackToDisk(track);
          okCount++;
        } catch {
          // Continue saving remaining tracks
        } finally {
          setDownloadingIds((prev) => {
            const next = new Set(prev);
            next.delete(track.videoId);
            return next;
          });
        }
      }
      await refreshOfflineList();
      setDownloadingBatch(false);
      showToast(`${okCount}/${missing.length} lagu disimpan untuk Offline Mode`);
    },
    [downloadingBatch, offlineIds, refreshOfflineList, showToast],
  );

  const handleClearDownloads = useCallback(async () => {
    await clearOfflineTracksApi();
    await refreshOfflineList();
    showToast('Semua fail offline dipadam');
  }, [refreshOfflineList, showToast]);

  useEffect(() => {
    updateDesktopConfig({
      closeToTray: settings.closeToTray,
      globalMediaKeys: settings.globalMediaKeys,
    });
  }, [settings.closeToTray, settings.globalMediaKeys]);

  useEffect(() => {
    const onNativeAction = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === 'play-pause') player.togglePlayPause();
      else if (action === 'next') player.next();
      else if (action === 'prev') player.previous();
      else if (action === 'stop') {
        if (playerStateRef.current.isPlaying) player.togglePlayPause();
      } else if (action === 'toggle-lyrics-overlay') {
        handleToggleFloatingLyrics();
      } else if (action === 'lyrics-overlay-closed') {
        setFloatingLyricsOpen(false);
      }
    };
    window.addEventListener('cw-native-action', onNativeAction);
    return () => window.removeEventListener('cw-native-action', onNativeAction);
  }, [player, handleToggleFloatingLyrics]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && eqPopupOpenRef.current) {
        e.preventDefault();
        setEqPopupOpen(false);
        return;
      }
      if (e.key === 'Escape' && ambientModeRef.current) {
        e.preventDefault();
        handleCloseAmbientMode();
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        handleToggleAmbientMode();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setFullSheetOpen(false);
        handleCloseAmbientMode();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (typing) return;

      if (e.code === 'Space') {
        e.preventDefault();
        player.togglePlayPause();
      } else if (e.key === 'ArrowRight') {
        player.seekTo(getPlaybackPositionMs() + 5000);
      } else if (e.key === 'ArrowLeft') {
        player.seekTo(getPlaybackPositionMs() - 5000);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateSettings({ volume: Math.min(100, settings.volume + 5) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSettings({ volume: Math.max(0, settings.volume - 5) });
      } else if (e.key.toLowerCase() === 'b') {
        handleBestPart();
      } else if (e.key.toLowerCase() === 'l') {
        toggleRightPanel('lyrics');
      } else if (e.key.toLowerCase() === 'q') {
        toggleRightPanel('queue');
      } else if (e.key.toLowerCase() === 'v' && player.state.currentTrack) {
        setVideoMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    player,
    settings.volume,
    updateSettings,
    toggleRightPanel,
    handleBestPart,
    handleCloseAmbientMode,
    handleToggleAmbientMode,
  ]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (miniMode) {
    return (
      <>
        {toastMsg && <div className="cw-toast">{toastMsg}</div>}
        <MiniPlayerView
          player={player.state}
          analyserRef={player.analyserRef}
          accentHex={activeAccent}
          intensity={intensity}
          isLiked={Boolean(player.state.currentTrack && likedIds.has(player.state.currentTrack.videoId))}
          onExitMini={() => toggleMiniMode(false)}
          onTogglePlayPause={player.togglePlayPause}
          onNext={player.next}
          onPrev={player.previous}
          onToggleLike={() => player.state.currentTrack && toggleLike(player.state.currentTrack)}
          onBestPart={handleBestPart}
        />
      </>
    );
  }

  const renderTrackRow = (track: Track, index: number, list: Track[]) => {
    const active = player.state.currentTrack?.videoId === track.videoId;
    const liked = likedIds.has(track.videoId);
    const isDownloading = downloadingIds.has(track.videoId);
    const isDownloaded = offlineIds.has(track.videoId);

    return (
      <div
        key={`${track.videoId}-${index}`}
        className="cw-track-row"
        data-active={active}
        onClick={() => player.playTrack(track, list)}
      >
        <div className="cw-track-index">
          {active ? (
            <span className="cw-eq-bars" data-playing={player.state.isPlaying}>
              <span /><span /><span />
            </span>
          ) : (
            index + 1
          )}
        </div>
        <img className="cw-row-thumb" src={track.thumbnailUrl} alt={track.title} loading="lazy" />
        <div className="cw-row-meta">
          <div
            className="cw-track-title cw-ellipsis"
            style={active ? { color: 'var(--cw-accent)' } : undefined}
          >
            {track.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className="cw-artist-link cw-ellipsis"
              onClick={(e) => {
                e.stopPropagation();
                openArtist(track.artist);
              }}
            >
              {track.artist}
            </button>
            {track.album && (
              <span className="cw-track-artist cw-ellipsis">• {track.album}</span>
            )}
          </div>
        </div>
        {track.durationMs > 0 && (
          <span className="cw-time-label">{formatDuration(track.durationMs)}</span>
        )}
        <div className="cw-row-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="cw-row-icon-btn cw-dl-btn"
            data-saved={isDownloaded}
            disabled={isDownloading}
            aria-label={isDownloaded ? 'Remove offline copy' : 'Download for offline'}
            title={isDownloaded ? 'Saved Offline (click to remove)' : 'Download for offline'}
            onClick={() =>
              isDownloaded ? handleRemoveDownload(track.videoId) : handleDownloadTrack(track)
            }
          >
            {isDownloading ? (
              <Loader2 size={14} className="cw-spin" />
            ) : isDownloaded ? (
              <Check size={14} />
            ) : (
              <Download size={14} />
            )}
          </button>
          <button
            type="button"
            className={`cw-row-icon-btn ${liked ? 'cw-heart-burst' : ''}`}
            data-active={liked}
            aria-label={liked ? 'Unlike' : 'Like'}
            onClick={() => toggleLike(track)}
          >
            <Heart size={15} className="cw-ic-liked" fill={liked ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="cw-row-icon-btn"
            aria-label="Add to queue"
            title="Add to queue"
            onClick={() => player.addToQueue(track)}
          >
            <ListPlus size={15} />
          </button>
          {library.playlists[0] && (
            <button
              type="button"
              className="cw-row-icon-btn"
              aria-label={`Add to ${library.playlists[0].name}`}
              title={`Add to ${library.playlists[0].name}`}
              onClick={() => addTrackToPlaylist(library.playlists[0].id, track)}
            >
              <Plus size={15} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderTrackCard = (track: Track, list: Track[], keyPrefix: string) => {
    const active = player.state.currentTrack?.videoId === track.videoId;
    return (
      <div
        key={`${keyPrefix}-${track.videoId}`}
        className="cw-track-card"
        data-active={active}
        onClick={() => player.playTrack(track, list)}
      >
        <div className="cw-art-wrap">
          <img className="cw-art-img" src={track.thumbnailUrl} alt={track.title} loading="lazy" />
          <div className="cw-art-play">
            <span className="cw-play-pill" data-active="true">
              <Play size={14} />
            </span>
          </div>
        </div>
        <div
          className="cw-track-title cw-ellipsis"
          style={active ? { color: 'var(--cw-accent)' } : undefined}
        >
          {track.title}
        </div>
        <button
          type="button"
          className="cw-artist-link cw-ellipsis"
          onClick={(e) => {
            e.stopPropagation();
            openArtist(track.artist);
          }}
        >
          {track.artist}
        </button>
      </div>
    );
  };

  const renderShelves = (shelves: HomeShelf[], layout: 'home' | 'explore') => {
    const firstShelf = shelves[0];
    const quickTracks = layout === 'home' ? firstShelf?.tracks.slice(0, 9) ?? [] : [];
    const chartTracks = layout === 'explore' ? firstShelf?.tracks.slice(0, 10) ?? [] : [];
    const overflowTracks =
      layout === 'home' && firstShelf && firstShelf.tracks.length > 9
        ? firstShelf.tracks.slice(9)
        : layout === 'explore' && firstShelf && firstShelf.tracks.length > 10
          ? firstShelf.tracks.slice(10)
          : [];
    const remainingShelves: HomeShelf[] = [
      ...(overflowTracks.length > 0
        ? [{ title: `More ${firstShelf.title}`, tracks: overflowTracks }]
        : []),
      ...((quickTracks.length > 0 || chartTracks.length > 0) ? shelves.slice(1) : shelves),
    ];

    if (layout === 'explore') {
      return (
        <>
          {chartTracks.length > 0 && (
            <section className="cw-shelf">
              <h2 className="cw-h2" style={{ marginBottom: 10 }}>
                {firstShelf.title}
              </h2>
              <div className="cw-explore-charts-grid">
                {chartTracks.map((track, idx) => {
                  const active = player.state.currentTrack?.videoId === track.videoId;
                  return (
                    <div
                      key={`chart-${track.videoId}-${idx}`}
                      className="cw-quick-tile cw-comic-frame"
                      data-active={active}
                      onClick={() => player.playTrack(track, firstShelf.tracks)}
                    >
                      <span className="cw-chart-rank">{idx + 1}</span>
                      <img className="cw-quick-thumb" src={track.thumbnailUrl} alt={track.title} loading="lazy" />
                      <div className="cw-row-meta">
                        <div
                          className="cw-track-title cw-ellipsis"
                          style={active ? { color: 'var(--cw-accent)' } : undefined}
                        >
                          {track.title}
                        </div>
                        <button
                          type="button"
                          className="cw-artist-link cw-ellipsis"
                          onClick={(e) => {
                            e.stopPropagation();
                            openArtist(track.artist);
                          }}
                        >
                          {track.artist}
                        </button>
                      </div>
                      {track.durationMs > 0 && (
                        <span className="cw-time-label" style={{ textAlign: 'right' }}>
                          {formatDuration(track.durationMs)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {remainingShelves.map((shelf) => (
            <HorizontalShelf key={shelf.title} title={shelf.title}>
              {shelf.tracks.map((track) => renderTrackCard(track, shelf.tracks, shelf.title))}
            </HorizontalShelf>
          ))}
        </>
      );
    }

    const sections: Array<{ id: string; render: (grip: React.ReactNode) => React.ReactNode }> = [];

    if (library.recentlyPlayed.length > 0) {
      sections.push({
        id: 'recent',
        render: (grip) => (
          <HorizontalShelf
            title="Recently Played"
            headerLeading={grip}
            headerTrailing={(
              <button
                type="button"
                className="cw-artist-link"
                onClick={() => setRoute({ kind: 'recent' })}
              >
                See all
              </button>
            )}
          >
            {library.recentlyPlayed.slice(0, 16).map((track) =>
              renderTrackCard(track, library.recentlyPlayed, 'recent-shelf'),
            )}
          </HorizontalShelf>
        ),
      });
    }

    if (quickTracks.length > 0 && settings.layoutSkin !== 'ytmusic') {
      sections.push({
        id: 'quick',
        render: (grip) => (
          <section className="cw-shelf">
            <div className="cw-shelf-header">
              <div className="cw-shelf-title-group">
                {grip}
                <h2 className="cw-h2">
                  {activeMood === 'all' ? 'Made For You' : firstShelf.title}
                </h2>
              </div>
            </div>
            <div className="cw-quick-grid">
              {quickTracks.map((track) => {
                const active = player.state.currentTrack?.videoId === track.videoId;
                return (
                  <div
                    key={`quick-${track.videoId}`}
                    className="cw-quick-tile cw-comic-frame"
                    data-active={active}
                    onClick={() => player.playTrack(track, firstShelf.tracks)}
                  >
                    <img className="cw-quick-thumb" src={track.thumbnailUrl} alt={track.title} loading="lazy" />
                    <div className="cw-row-meta">
                      <div
                        className="cw-track-title cw-ellipsis"
                        style={active ? { color: 'var(--cw-accent)' } : undefined}
                      >
                        {track.title}
                      </div>
                      <button
                        type="button"
                        className="cw-artist-link cw-ellipsis"
                        onClick={(e) => {
                          e.stopPropagation();
                          openArtist(track.artist);
                        }}
                      >
                        {track.artist}
                      </button>
                    </div>
                    <span className="cw-quick-play" data-active={active}>
                      {active ? (
                        <span className="cw-eq-bars" data-playing={player.state.isPlaying}>
                          <span /><span /><span />
                        </span>
                      ) : (
                        <Play size={13} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ),
      });
    }

    for (const shelf of remainingShelves) {
      const sid = `shelf:${shelf.title.toLowerCase()}`;
      sections.push({
        id: sid,
        render: (grip) => (
          <HorizontalShelf title={shelf.title} headerLeading={grip}>
            {shelf.tracks.map((track) => renderTrackCard(track, shelf.tracks, shelf.title))}
          </HorizontalShelf>
        ),
      });
    }

    const rank = new Map<string, number>();
    settings.homeSectionOrder.forEach((id, i) => rank.set(id, i));
    const ordered = [...sections].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : 10_000 + sections.indexOf(a);
      const rb = rank.has(b.id) ? rank.get(b.id)! : 10_000 + sections.indexOf(b);
      return ra - rb;
    });

    return ordered.map((item, idx) => {
      const grip = (
        <button
          type="button"
          className="cw-drag-grip"
          data-tip="Drag to reorder"
          aria-label="Drag section to reorder"
          onPointerDown={() => setDragArmId(item.id)}
          onPointerUp={() => setDragArmId(null)}
        >
          <GripVertical size={15} />
        </button>
      );

      return (
        <div
          key={item.id}
          className="cw-draggable-section"
          style={{ '--shelf-idx': idx } as React.CSSProperties}
          draggable={dragArmId === item.id}
          data-dragging={draggingId === item.id}
          data-drop-pos={dropTarget?.id === item.id ? dropTarget.position : undefined}
          onDragStart={(e) => {
            if (dragArmId !== item.id) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
            setDraggingId(item.id);
          }}
          onDragOver={(e) => {
            if (!draggingId || draggingId === item.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rect = e.currentTarget.getBoundingClientRect();
            const pos: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            if (!dropTarget || dropTarget.id !== item.id || dropTarget.position !== pos) {
              setDropTarget({ id: item.id, position: pos });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const sourceId = draggingId || e.dataTransfer.getData('text/plain');
            const pos = dropTarget?.id === item.id ? dropTarget.position : 'before';
            setDragArmId(null);
            setDraggingId(null);
            setDropTarget(null);
            if (!sourceId || sourceId === item.id) return;

            const currentIds = ordered.map((s) => s.id);
            if (!currentIds.includes(sourceId)) return;
            const nextOrder = currentIds.filter((id) => id !== sourceId);
            let insertAt = nextOrder.indexOf(item.id);
            if (insertAt === -1) return;
            if (pos === 'after') insertAt += 1;
            nextOrder.splice(insertAt, 0, sourceId);
            updateSettings({ homeSectionOrder: nextOrder });
            showToast('Susunan Home disimpan');
          }}
          onDragEnd={() => {
            setDragArmId(null);
            setDraggingId(null);
            setDropTarget(null);
          }}
        >
          {item.render(grip)}
        </div>
      );
    });
  };

  const activePlaylist =
    route.kind === 'playlist' ? library.playlists.find((p) => p.id === route.id) ?? null : null;

  const resolvedProfileAvatar = settings.profileAvatar || auth.yt.photoUrl || null;
  const resolvedProfileName =
    settings.profileName.trim() || (auth.yt.connected ? auth.yt.accountName : '');

  const renderPlayerDock = () => (
    <PlayerDock
      player={player.state}
      accentHex={activeAccent}
      intensity={intensity}
      volume={settings.volume}
      isLiked={Boolean(player.state.currentTrack && likedIds.has(player.state.currentTrack.videoId))}
      videoMode={videoMode}
      rightPanelOpen={rightPanelOpen}
      rightPanelTab={rightPanelTab}
      layoutSkin={settings.layoutSkin}
      profileAvatar={resolvedProfileAvatar}
      profileName={resolvedProfileName}
      onOpenProfile={handleOpenProfile}
      onVolumeChange={handleVolumeChange}
      onTogglePlayPause={player.togglePlayPause}
      onNext={player.next}
      onPrev={player.previous}
      onSeekTo={player.seekTo}
      onBestPart={handleBestPart}
      onToggleShuffle={player.toggleShuffle}
      onCycleRepeat={player.cycleRepeat}
      onToggleLike={handleToggleLikeCurrent}
      onToggleVideoMode={handleToggleVideoMode}
      onOpenArtist={openArtist}
      onToggleRightPanel={toggleRightPanel}
      onOpenFullSheet={handleOpenFullSheet}
      onEnterMini={handleEnterMini}
      floatingLyricsOpen={floatingLyricsOpen}
      onToggleFloatingLyrics={handleToggleFloatingLyrics}
      onOpenAmbientMode={handleOpenAmbientMode}
    />
  );

  const renderSkinSearchForm = (formClass: string, iconClass: string, placeholder: string) => (
    <form
      className={formClass}
      onSubmit={(e) => {
        e.preventDefault();
        runSearch();
      }}
    >
      <Search size={16} className={iconClass} />
      <input
        ref={searchInputRef}
        type="search"
        value={searchQuery}
        placeholder={placeholder}
        aria-label="Search music"
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => {
          if (searchQuery.trim() && route.kind !== 'search') {
            setRoute({ kind: 'search' });
          }
        }}
      />
      {searchQuery && (
        <button
          type="button"
          className="cw-skin-search-clear"
          aria-label="Clear search"
          onClick={handleSearchClear}
        >
          <X size={14} />
        </button>
      )}
    </form>
  );

  const renderSkinTopTools = (showSettingsBtn: boolean) => (
    <div className="cw-top-right-tools">
      {(route.kind === 'home' || route.kind === 'explore') && (
        <button
          type="button"
          className="cw-skin-tool-btn cw-tip-anchor"
          data-tip="Refresh Feed"
          data-tip-pos="bottom"
          aria-label="Refresh Feed"
          onClick={route.kind === 'home' ? () => loadHome(activeMood, true) : loadExplore}
        >
          <RefreshCw size={15} />
        </button>
      )}
      <button
        type="button"
        className="cw-skin-tool-btn cw-tip-anchor"
        data-active={rightPanelOpen && rightPanelTab === 'lyrics'}
        data-tip="Lyrics (L)"
        data-tip-pos="bottom"
        aria-label="Toggle Lyrics"
        onClick={() => toggleRightPanel('lyrics')}
      >
        <Mic2 size={15} />
      </button>
      <button
        type="button"
        className="cw-skin-tool-btn cw-tip-anchor"
        data-active={rightPanelOpen && rightPanelTab === 'queue'}
        data-tip="Queue (Q)"
        data-tip-pos="bottom"
        aria-label="Toggle Queue"
        onClick={() => toggleRightPanel('queue')}
      >
        <ListMusic size={15} />
      </button>
      {showSettingsBtn && (
        <button
          type="button"
          className="cw-skin-tool-btn cw-tip-anchor"
          data-active={route.kind === 'settings'}
          data-tip="Settings"
          data-tip-pos="bottom"
          aria-label="Settings"
          onClick={() => handleSelectRoute({ kind: 'settings' })}
        >
          <Settings size={15} />
        </button>
      )}
      <button
        type="button"
        className="cw-skin-avatar-btn cw-tip-anchor"
        data-tip={resolvedProfileName || 'Account & Profile'}
        data-tip-pos="bottom"
        aria-label="Profile"
        onClick={handleOpenProfile}
      >
        {resolvedProfileAvatar ? (
          <img src={resolvedProfileAvatar} alt={resolvedProfileName || 'Profile'} />
        ) : (
          <User size={15} />
        )}
      </button>
    </div>
  );

  return (
    <>
      {toastMsg && <div className="cw-toast">{toastMsg}</div>}

      {/* Velvety atmospheric canvas + darkened artwork aura + fine grain */}
      <div className="cw-backdrop">
        {settings.artworkBackdrop && player.state.currentTrack && (
          <div
            className="cw-backdrop-artwork"
            style={{ backgroundImage: `url(${player.state.currentTrack.thumbnailUrl})` }}
          />
        )}
        <div className="cw-backdrop-vignette" />
        <div className="cw-backdrop-grain" />
      </div>

      {/* Apple Music macOS: Full-Width Top Player Bar sits above the workspace */}
      {settings.layoutSkin === 'apple' && renderPlayerDock()}

      {/* Desktop Workspace (3-region or Skin-specific frame) */}
      <div className="cw-workspace">
        <Sidebar
          route={route}
          profileName={settings.profileName}
          profileAvatar={resolvedProfileAvatar}
          ytAccountName={auth.yt.connected ? auth.yt.accountName : undefined}
          likedCount={library.likedTracks.length}
          recentCount={library.recentlyPlayed.length}
          downloadedCount={offlineEntries.length}
          offlineMode={settings.offlineMode}
          playlists={library.playlists}
          stats={library.stats}
          eqPreset={settings.eqPreset}
          eqOpen={eqPopupOpen}
          autoRadio={settings.autoRadio}
          sleepRemainingSec={player.state.sleepRemainingSec}
          intensity={intensity}
          layoutSkin={settings.layoutSkin}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSearchSubmit={handleSearchSubmit}
          onSearchClear={handleSearchClear}
          searchInputRef={searchInputRef}
          onSelectRoute={handleSelectRoute}
          onOpenProfile={handleOpenProfile}
          onNewPlaylist={handleNewPlaylist}
          onImportPlaylist={handleImportPlaylist}
          onOpenEq={handleOpenEq}
          onCycleSleepTimer={handleCycleSleepTimer}
          onToggleAutoRadio={handleToggleAutoRadio}
          onOpenArtist={openArtist}
        />

        <div className="cw-center-col">
          {settings.layoutSkin === 'spotify' ? (
            <header className="cw-top-utility cw-spotify-header">
              <div className="cw-spotify-head-left">
                <button
                  type="button"
                  className="cw-spotify-brand cw-tip-anchor"
                  data-tip="ClaudeWaves Home"
                  data-tip-pos="bottom"
                  onClick={() => handleSelectRoute({ kind: 'home' })}
                >
                  <img className="cw-brand-logo-img" src="/app_icon.png" alt="ClaudeWaves" />
                </button>
              </div>

              <div className="cw-spotify-head-center">
                <button
                  type="button"
                  className="cw-spotify-circle-btn cw-tip-anchor"
                  data-active={route.kind === 'home'}
                  data-tip="Home"
                  data-tip-pos="bottom"
                  aria-label="Home"
                  onClick={() => handleSelectRoute({ kind: 'home' })}
                >
                  <Home size={18} />
                </button>
                {renderSkinSearchForm(
                  'cw-spotify-search-pill',
                  'cw-spotify-search-ic',
                  'What do you want to play? (Ctrl+K)',
                )}
                <button
                  type="button"
                  className="cw-spotify-circle-btn cw-tip-anchor"
                  data-active={route.kind === 'explore'}
                  data-tip="Explore Charts"
                  data-tip-pos="bottom"
                  aria-label="Explore"
                  onClick={() => handleSelectRoute({ kind: 'explore' })}
                >
                  <Compass size={17} />
                </button>
              </div>

              {renderSkinTopTools(true)}
            </header>
          ) : settings.layoutSkin === 'ytmusic' ? (
            <header className="cw-top-utility cw-ytm-header">
              {renderSkinSearchForm(
                'cw-ytm-search-pill',
                'cw-ytm-search-ic',
                'Search songs, albums, artists, podcasts (Ctrl+K)',
              )}
              {renderSkinTopTools(false)}
            </header>
          ) : settings.layoutSkin === 'tidal' ? (
            <header className="cw-top-utility cw-tidal-header">
              {renderSkinSearchForm(
                'cw-tidal-search-pill',
                'cw-spotify-search-ic',
                'Search lossless music, artists, albums (Ctrl+K)',
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="cw-tidal-max-pill">FLAC · MAX</span>
                {renderSkinTopTools(true)}
              </div>
            </header>
          ) : settings.layoutSkin === 'soundcloud' ? (
            <header className="cw-top-utility cw-sc-header">
              <div className="cw-sc-header-left">
                <button
                  type="button"
                  className="cw-sc-tab-btn"
                  data-active={route.kind === 'home'}
                  onClick={() => handleSelectRoute({ kind: 'home' })}
                >
                  Home
                </button>
                <button
                  type="button"
                  className="cw-sc-tab-btn"
                  data-active={route.kind === 'explore'}
                  onClick={() => handleSelectRoute({ kind: 'explore' })}
                >
                  Stream Charts
                </button>
              </div>
              {renderSkinSearchForm(
                'cw-sc-search-pill',
                'cw-spotify-search-ic',
                'Search artists, mixes, tracks (Ctrl+K)',
              )}
              {renderSkinTopTools(true)}
            </header>
          ) : settings.layoutSkin === 'nothing' ? (
            <header className="cw-top-utility cw-nothing-header">
              {renderSkinSearchForm(
                'cw-nothing-search-pill',
                'cw-spotify-search-ic',
                'SEARCH // LIBRARY (CTRL+K)',
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="cw-nothing-status-pill">AUDIO // ACTIVE</span>
                {renderSkinTopTools(true)}
              </div>
            </header>
          ) : settings.layoutSkin !== 'apple' ? (
            <header className="cw-top-utility">
              <form
                className="cw-search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch();
                }}
              >
                <GlassInput
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  tint={activeAccent}
                  intensity={intensity}
                  placeholder="Search songs, artists, albums (Ctrl+K)..."
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchQuery.trim() && route.kind !== 'search') {
                      setRoute({ kind: 'search' });
                    }
                  }}
                  onClear={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                />
              </form>

              <div className="cw-top-right-tools">
                {(route.kind === 'home' || route.kind === 'explore') && (
                  <span className="cw-tip-anchor" data-tip="Refresh Feed" data-tip-pos="bottom">
                    <GlassButton
                      size="sm"
                      variant="glass"
                      intensity={intensity}
                      icon={<RefreshCw size={15} className="cw-ic-refresh" />}
                      onClick={route.kind === 'home' ? () => loadHome(activeMood, true) : loadExplore}
                    >
                      Refresh
                    </GlassButton>
                  </span>
                )}
                <span className="cw-tip-anchor" data-tip="Word-Synced Lyrics (L)" data-tip-pos="bottom">
                  <GlassButton
                    size="sm"
                    variant={rightPanelOpen && rightPanelTab === 'lyrics' ? 'tinted' : 'glass'}
                    tint={activeAccent}
                    intensity={intensity}
                    icon={<Mic2 size={15} className="cw-ic-lyrics" />}
                    onClick={() => toggleRightPanel('lyrics')}
                  >
                    Lyrics
                  </GlassButton>
                </span>
                <span className="cw-tip-anchor" data-tip="Up Next Queue (Q)" data-tip-pos="bottom">
                  <GlassButton
                    size="sm"
                    variant={rightPanelOpen && rightPanelTab === 'queue' ? 'tinted' : 'glass'}
                    tint={activeAccent}
                    intensity={intensity}
                    icon={<ListMusic size={15} className="cw-ic-queue" />}
                    onClick={() => toggleRightPanel('queue')}
                  >
                    Queue
                  </GlassButton>
                </span>
              </div>
            </header>
          ) : null}

          <main ref={mainScrollRef} className="cw-main-scroll">
            <div key={routeScrollKey} className="cw-page-view">
              {settings.offlineMode && (
                <div className="cw-offline-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HardDrive size={15} color="var(--cw-accent)" />
                    <span>
                      <strong>Offline Mode Aktif</strong> — Main lagu yang disimpan sahaja ({offlineEntries.length} lagu tersedia).
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="cw-reset-layout-btn"
                      onClick={() => setRoute({ kind: 'downloads' })}
                    >
                      Buka Downloads
                    </button>
                    <button
                      type="button"
                      className="cw-reset-layout-btn"
                      onClick={() => updateSettings({ offlineMode: false })}
                    >
                      Tutup Offline
                    </button>
                  </div>
                </div>
              )}

              {updateInfo?.hasUpdate && !updateBannerDismissed && (
                <div className="cw-update-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} color="var(--cw-accent)" />
                    <span>
                      <strong>Update v{updateInfo.latestVersion} tersedia</strong> — {updateInfo.releaseName || 'ClaudeWaves Desktop'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="cw-reset-layout-btn"
                      disabled={bannerUpdating}
                      onClick={async () => {
                        if (!updateInfo.downloadUrl) {
                          openReleaseUrl(updateInfo.htmlUrl);
                          return;
                        }
                        setBannerUpdating(true);
                        try {
                          await downloadAndInstallUpdate(updateInfo.downloadUrl, updateInfo.assetName, true);
                          showToast('Installer launched! Check Windows prompt.');
                        } catch (err) {
                          showToast(err instanceof Error ? err.message : 'Update download failed');
                        } finally {
                          setBannerUpdating(false);
                        }
                      }}
                    >
                      {bannerUpdating ? 'Downloading...' : 'Download & Install'}
                    </button>
                    <button
                      type="button"
                      className="cw-reset-layout-btn"
                      onClick={() => {
                        setSettingsTab('about');
                        setRoute({ kind: 'settings' });
                      }}
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      className="cw-reset-layout-btn"
                      onClick={() => setUpdateBannerDismissed(true)}
                      aria-label="Dismiss update banner"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* HOME */}
              {route.kind === 'home' && (
                <>
                  {settings.layoutSkin === 'spotify' && (
                    <div className="cw-spotify-home-wash" aria-hidden="true" />
                  )}

                  <div className="cw-home-head cw-home-head-inline">
                    <h1 className="cw-h1">
                      {settings.layoutSkin === 'apple'
                        ? 'Home'
                        : settings.layoutSkin === 'spotify'
                          ? greeting
                          : `${greeting}${settings.profileName.trim() ? `, ${settings.profileName.trim()}` : ''}`}
                    </h1>
                    {/* Inline Mood Filter Strip + Optional Reset Layout */}
                    <div className="cw-mood-strip-wrap">
                      <div className="cw-mood-bar" role="tablist" aria-label="Filter by mood">
                        {MOOD_CHIPS.map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            className="cw-mood-chip"
                            data-active={activeMood === chip.id}
                            onClick={() => {
                              setActiveMood(chip.id);
                              loadHome(chip.id);
                            }}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                      {settings.layoutSkin === 'apple' && (
                        <button
                          type="button"
                          className="cw-reset-layout-btn"
                          data-tip="Refresh Home Feed"
                          onClick={() => loadHome(activeMood, true)}
                        >
                          <RefreshCw size={12} />
                          <span>Refresh</span>
                        </button>
                      )}
                      {settings.homeSectionOrder.length > 0 && (
                        <button
                          type="button"
                          className="cw-reset-layout-btn"
                          data-tip="Reset Home section order"
                          onClick={() => {
                            updateSettings({ homeSectionOrder: [] });
                            showToast('Susunan Home di-reset');
                          }}
                        >
                          <RotateCcw size={12} />
                          <span>Reset Layout</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Skin-Specific Home Hero */}
                  {settings.layoutSkin === 'spotify' && spotifyShortcuts.length > 0 && (
                    <section className="cw-spotify-hero-grid" aria-label="Quick Resume">
                      {spotifyShortcuts.map(({ track, list }, idx) => {
                        const active = player.state.currentTrack?.videoId === track.videoId;
                        return (
                          <button
                            key={`sp-short-${track.videoId}`}
                            type="button"
                            className="cw-spotify-shortcut-card"
                            data-active={active}
                            style={{ '--item-idx': idx } as React.CSSProperties}
                            onClick={() => handlePlayFromList(track, list)}
                          >
                            <img
                              className="cw-spotify-shortcut-art"
                              src={track.thumbnailUrl}
                              alt={track.title}
                              loading="lazy"
                            />
                            <span className="cw-spotify-shortcut-title">{track.title}</span>
                            {active && player.state.isPlaying && (
                              <span className="cw-eq-bars cw-sp-shortcut-eq" data-playing="true" aria-hidden="true">
                                <span /><span /><span />
                              </span>
                            )}
                            <span className="cw-spotify-shortcut-play" aria-hidden="true">
                              <Play size={14} fill="currentColor" style={{ marginLeft: 1 }} />
                            </span>
                          </button>
                        );
                      })}
                    </section>
                  )}

                  {settings.layoutSkin === 'ytmusic' && ytmQuickPicks.length > 0 && (
                    <section className="cw-ytm-quick-section" aria-label="Quick picks">
                      <div className="cw-ytm-quick-head">
                        <div>
                          <div className="cw-ytm-eyebrow">START RADIO FROM A SONG</div>
                          <h2 className="cw-ytm-quick-title">Quick picks</h2>
                        </div>
                        <button
                          type="button"
                          className="cw-ytm-playall-btn"
                          onClick={() =>
                            handlePlayFromList(ytmQuickPicks[0], homeShelves[0]?.tracks ?? ytmQuickPicks)
                          }
                        >
                          Play all
                        </button>
                      </div>
                      <div className="cw-ytm-quick-grid">
                        {ytmQuickPicks.map((track, idx) => {
                          const active = player.state.currentTrack?.videoId === track.videoId;
                          const trackLiked = likedIds.has(track.videoId);
                          return (
                            <div
                              key={`ytm-qp-${track.videoId}`}
                              className="cw-ytm-quick-row"
                              data-active={active}
                              style={{ '--item-idx': idx } as React.CSSProperties}
                              onClick={() =>
                                handlePlayFromList(track, homeShelves[0]?.tracks ?? ytmQuickPicks)
                              }
                            >
                              <div className="cw-ytm-quick-thumb-wrap">
                                <img
                                  className="cw-ytm-quick-thumb"
                                  src={track.thumbnailUrl}
                                  alt={track.title}
                                  loading="lazy"
                                />
                                {active && player.state.isPlaying && (
                                  <span className="cw-ytm-active-eq" aria-hidden="true">
                                    <span className="cw-eq-bars" data-playing="true">
                                      <span /><span /><span />
                                    </span>
                                  </span>
                                )}
                                <span className="cw-ytm-quick-play-overlay" aria-hidden="true">
                                  <Play size={14} fill="currentColor" style={{ marginLeft: 1 }} />
                                </span>
                              </div>
                              <div className="cw-row-meta">
                                <div className="cw-ytm-quick-name cw-ellipsis">{track.title}</div>
                                <div
                                  className="cw-ytm-quick-artist cw-ellipsis"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openArtist(track.artist);
                                  }}
                                >
                                  {track.artist}
                                </div>
                              </div>
                              <div
                                className="cw-ytm-quick-actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="cw-skin-icon-btn"
                                  data-active={trackLiked}
                                  aria-label="Toggle Like"
                                  onClick={() => toggleLike(track)}
                                >
                                  <Heart size={13} fill={trackLiked ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                  type="button"
                                  className="cw-skin-icon-btn"
                                  aria-label="Add to Queue"
                                  onClick={() => player.addToQueue(track)}
                                >
                                  <ListPlus size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {settings.layoutSkin === 'apple' && appleTopPicks.length > 0 && (
                    <section className="cw-apple-top-picks" aria-label="Top Picks for You">
                      <div className="cw-apple-section-head">
                        <h2 className="cw-h2">Top Picks for You</h2>
                      </div>
                      <div className="cw-apple-top-picks-grid">
                        {appleTopPicks.map((track, idx) => {
                          const active = player.state.currentTrack?.videoId === track.videoId;
                          return (
                            <div
                              key={`ap-pick-${track.videoId}`}
                              className="cw-apple-pick-card"
                              data-active={active}
                              style={{ '--item-idx': idx } as React.CSSProperties}
                              onClick={() => handlePlayFromList(track, spotlightTracks)}
                            >
                              <img
                                className="cw-apple-pick-img"
                                src={track.thumbnailUrl}
                                alt={track.title}
                                loading="lazy"
                              />
                              <div className="cw-apple-pick-sheen" aria-hidden="true" />
                              <div className="cw-apple-pick-eyebrow">
                                {idx === 0 ? 'MADE FOR YOU' : 'CURATED MIX'}
                              </div>
                              <div className="cw-apple-pick-scrim">
                                <div className="cw-apple-pick-title cw-ellipsis">{track.title}</div>
                                <div className="cw-apple-pick-sub cw-ellipsis">{track.artist}</div>
                              </div>
                              <span className="cw-apple-pick-play" aria-hidden="true">
                                <Play size={15} fill="currentColor" style={{ marginLeft: 1.5 }} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {settings.layoutSkin === 'tidal' && tidalSpotlights.length > 0 && (
                    <section className="cw-tidal-hero" aria-label="HiFi Editorial Spotlights">
                      {tidalSpotlights.map((track, idx) => {
                        const active = player.state.currentTrack?.videoId === track.videoId;
                        return (
                          <div
                            key={`td-hero-${track.videoId}`}
                            className="cw-tidal-hero-card"
                            data-active={active}
                            style={{ '--item-idx': idx } as React.CSSProperties}
                            onClick={() => handlePlayFromList(track, spotlightTracks)}
                          >
                            <div
                              className="cw-tidal-hero-bg"
                              style={{ backgroundImage: `url(${track.thumbnailUrl})` }}
                            />
                            <img
                              className="cw-tidal-hero-img"
                              src={track.thumbnailUrl}
                              alt={track.title}
                              loading="lazy"
                            />
                            <div className="cw-tidal-hero-meta">
                              <span className="cw-tidal-max-badge">MASTER · HI-RES</span>
                              <div className="cw-tidal-hero-title cw-ellipsis">{track.title}</div>
                              <div className="cw-tidal-hero-sub cw-ellipsis">{track.artist}</div>
                              <span className="cw-tidal-hero-cta">
                                <Play size={13} fill="currentColor" style={{ marginLeft: 1 }} />
                                <span>{active && player.state.isPlaying ? 'Playing' : 'Stream in HiFi'}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  )}

                  {settings.layoutSkin === 'soundcloud' && scWaveCards.length > 0 && (
                    <section className="cw-sc-hero-stream" aria-label="Waveform Feed">
                      {scWaveCards.map((track, idx) => {
                        const active = player.state.currentTrack?.videoId === track.videoId;
                        const bars = buildWaveHeights(track.videoId, 36);
                        return (
                          <div
                            key={`sc-hero-${track.videoId}`}
                            className="cw-sc-stream-card"
                            data-active={active}
                            style={{ '--item-idx': idx } as React.CSSProperties}
                            onClick={() => handlePlayFromList(track, spotlightTracks)}
                          >
                            <img
                              className="cw-sc-stream-art"
                              src={track.thumbnailUrl}
                              alt={track.title}
                              loading="lazy"
                            />
                            <div className="cw-sc-stream-body">
                              <div className="cw-sc-stream-head">
                                <span className="cw-sc-stream-play" aria-hidden="true">
                                  <Play size={13} fill="currentColor" style={{ marginLeft: 1 }} />
                                </span>
                                <div className="cw-row-meta">
                                  <div className="cw-sc-stream-artist cw-ellipsis">{track.artist}</div>
                                  <div className="cw-sc-stream-title cw-ellipsis">{track.title}</div>
                                </div>
                              </div>
                              <div className="cw-sc-card-wave" aria-hidden="true">
                                {bars.map((h, bIdx) => (
                                  <span
                                    key={bIdx}
                                    data-lit={active && bIdx < 20}
                                    style={{ height: `${h}%` }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  )}

                  {settings.layoutSkin === 'nothing' && nothingWidgets.length > 0 && (
                    <section className="cw-nothing-hero" aria-label="Nothing Audio Modules">
                      <div className="cw-nothing-widget-grid">
                        {nothingWidgets.map((track, idx) => {
                          const active = player.state.currentTrack?.videoId === track.videoId;
                          return (
                            <button
                              key={`nt-wid-${track.videoId}`}
                              type="button"
                              className="cw-nothing-widget"
                              data-active={active}
                              style={{ '--item-idx': idx } as React.CSSProperties}
                              onClick={() => handlePlayFromList(track, spotlightTracks)}
                            >
                              <div className="cw-nothing-wid-top">
                                <span className="cw-nothing-num">0{idx + 1}</span>
                                <span className="cw-nothing-dot-badge" data-active={active} />
                              </div>
                              <img
                                className="cw-nothing-wid-art"
                                src={track.thumbnailUrl}
                                alt={track.title}
                                loading="lazy"
                              />
                              <div className="cw-nothing-wid-title cw-ellipsis">{track.title}</div>
                              <div className="cw-nothing-wid-sub cw-ellipsis">
                                {track.artist} · {formatDuration(track.durationMs)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {settings.layoutSkin === 'default' && spotlightTracks.length > 0 && (
                    <CoverFlowDeck
                      tracks={spotlightTracks}
                      currentVideoId={player.state.currentTrack?.videoId ?? null}
                      onPlayTrack={handlePlayFromList}
                      onOpenArtist={openArtist}
                    />
                  )}

                  {homeLoading && homeShelves.length === 0 && (
                    <div className="cw-muted" style={{ padding: '24px 4px' }}>
                      Loading YouTube Music...
                    </div>
                  )}

                  {homeError && homeShelves.length === 0 && (
                    <GlassCard intensity={intensity} padding="20px">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <h2 className="cw-h2">Could not load Home</h2>
                        <div className="cw-muted">{homeError}</div>
                        <GlassButton size="sm" variant="filled" tint={activeAccent} onClick={() => loadHome(activeMood, true)}>
                          Retry
                        </GlassButton>
                      </div>
                    </GlassCard>
                  )}

                  {renderShelves(homeShelves, 'home')}
                </>
              )}

              {/* EXPLORE */}
              {route.kind === 'explore' && (
                <>
                  <div className="cw-home-head cw-home-head-inline">
                    <h1 className="cw-h1">Explore</h1>
                    {settings.layoutSkin === 'apple' && (
                      <button
                        type="button"
                        className="cw-reset-layout-btn"
                        data-tip="Refresh Explore Feed"
                        onClick={loadExplore}
                      >
                        <RefreshCw size={12} />
                        <span>Refresh</span>
                      </button>
                    )}
                  </div>
                  {exploreLoading && exploreShelves.length === 0 && (
                    <div className="cw-muted" style={{ padding: '24px 4px' }}>Loading Explore...</div>
                  )}
                  {exploreError && exploreShelves.length === 0 && (
                    <GlassCard intensity={intensity} padding="20px">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <h2 className="cw-h2">Could not load Explore</h2>
                        <div className="cw-muted">{exploreError}</div>
                        <GlassButton size="sm" variant="filled" tint={activeAccent} onClick={loadExplore}>
                          Retry
                        </GlassButton>
                      </div>
                    </GlassCard>
                  )}
                  {renderShelves(exploreShelves, 'explore')}
                </>
              )}

              {/* ARTIST DETAIL */}
              {route.kind === 'artist' && (
                <ArtistView
                  artist={artistData}
                  loading={artistLoading}
                  error={artistError}
                  currentVideoId={player.state.currentTrack?.videoId ?? null}
                  isPlaying={player.state.isPlaying}
                  likedIds={likedIds}
                  accentHex={activeAccent}
                  intensity={intensity}
                  onBack={() => setRoute(prevRouteRef.current)}
                  onPlayTrack={(t, list) => player.playTrack(t, list)}
                  onToggleLike={toggleLike}
                  onAddToQueue={player.addToQueue}
                />
              )}

              {/* SEARCH */}
              {route.kind === 'search' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="cw-section-header" style={{ marginBottom: 4 }}>
                    <div>
                      <h1 className="cw-h1">
                        {searchQuery.trim() ? `Results for “${searchQuery.trim()}”` : 'Search'}
                      </h1>
                      <div className="cw-muted">Type in the top search bar and press Enter</div>
                    </div>
                    <div style={{ width: 260 }}>
                      <GlassSegmented
                        size="sm"
                        options={['All', 'Songs', 'Videos']}
                        value={searchFilterIdx}
                        intensity={intensity}
                        onChange={(idx) => {
                          setSearchFilterIdx(idx);
                          if (searchQuery.trim()) runSearch(searchQuery, idx);
                        }}
                      />
                    </div>
                  </div>

                  {searchLoading && (
                    <GlassCard intensity={intensity} padding="28px">
                      <div className="cw-muted" style={{ textAlign: 'center' }}>Searching...</div>
                    </GlassCard>
                  )}

                  {searchError && (
                    <GlassCard intensity={intensity} padding="20px">
                      <div style={{ color: '#ff5c5c' }}>{searchError}</div>
                    </GlassCard>
                  )}

                  {!searchLoading && searchResults.length === 0 && (
                    <div>
                      <div className="cw-muted" style={{ marginBottom: 10 }}>Popular searches</div>
                      <div className="cw-chips">
                        {QUICK_SEARCHES.map((q) => (
                          <GlassButton
                            key={q}
                            size="sm"
                            variant="glass"
                            intensity={intensity}
                            onClick={() => {
                              setSearchQuery(q);
                              runSearch(q, searchFilterIdx);
                            }}
                          >
                            {q}
                          </GlassButton>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="cw-content-card" style={{ padding: 14 }}>
                      {searchResults.map((track, idx) => renderTrackRow(track, idx, searchResults))}
                    </div>
                  )}
                </div>
              )}

              {/* LIKED */}
              {route.kind === 'liked' && (
                <PlaylistView
                  playlistKey="liked-songs"
                  title="Liked Songs"
                  isLikedView={true}
                  tracks={library.likedTracks}
                  likedIds={likedIds}
                  currentTrackId={player.state.currentTrack?.videoId ?? null}
                  repeatMode={player.state.repeatMode}
                  queueTrackIds={queueTrackIds}
                  accentHex={activeAccent}
                  intensity={intensity}
                  onPlayList={player.playTrack}
                  onSetRepeatMode={player.setRepeatMode}
                  refreshing={refreshingPlaylistKey === 'liked-songs'}
                  onRefresh={handleRefreshLiked}
                  downloadingBatch={downloadingBatch}
                  downloadedInListCount={
                    library.likedTracks.filter((t) => offlineIds.has(t.videoId)).length
                  }
                  onDownloadAll={() => handleDownloadPlaylist(library.likedTracks)}
                  renderTrackRow={renderTrackRow}
                />
              )}

              {/* DOWNLOADS / OFFLINE LIBRARY */}
              {route.kind === 'downloads' && (
                <PlaylistView
                  playlistKey="downloads"
                  title="Downloaded Music"
                  tracks={offlineEntries}
                  likedIds={likedIds}
                  currentTrackId={player.state.currentTrack?.videoId ?? null}
                  repeatMode={player.state.repeatMode}
                  queueTrackIds={queueTrackIds}
                  accentHex={activeAccent}
                  intensity={intensity}
                  onPlayList={player.playTrack}
                  onSetRepeatMode={player.setRepeatMode}
                  headerExtra={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="cw-offline-pill">
                        <HardDrive size={12} />
                        <span>{(offlineTotalBytes / 1048576).toFixed(1)} MB</span>
                      </span>
                      <GlassButton
                        size="sm"
                        variant={settings.offlineMode ? 'filled' : 'glass'}
                        tint={activeAccent}
                        intensity={intensity}
                        onClick={() => updateSettings({ offlineMode: !settings.offlineMode })}
                      >
                        {settings.offlineMode ? 'Offline Mode: ON' : 'Offline Mode: OFF'}
                      </GlassButton>
                      {offlineEntries.length > 0 && (
                        <GlassButton
                          size="sm"
                          variant="glass"
                          destructive
                          intensity={intensity}
                          icon={<Trash2 size={14} />}
                          onClick={handleClearDownloads}
                        >
                          Clear All
                        </GlassButton>
                      )}
                    </div>
                  }
                  renderTrackRow={renderTrackRow}
                />
              )}

              {/* STATS & LISTENING WRAPPED */}
              {route.kind === 'stats' && (
                <StatsView
                  stats={library.stats}
                  likedCount={library.likedTracks.length}
                  playlistCount={library.playlists.length}
                  downloadedCount={offlineEntries.length}
                  profileName={settings.profileName || auth.yt.accountName || ''}
                  profileAvatar={settings.profileAvatar}
                  accentHex={activeAccent}
                  intensity={intensity}
                  onPlayTrack={(track, queue) => player.playTrack(track, queue)}
                  onOpenArtist={openArtist}
                  onToast={showToast}
                />
              )}

              {/* RECENT */}
              {route.kind === 'recent' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="cw-section-header">
                    <div>
                      <h1 className="cw-h1">Recently Played</h1>
                      <div className="cw-muted">{library.recentlyPlayed.length} tracks in history</div>
                    </div>
                  </div>
                  <div className="cw-content-card" style={{ padding: 16 }}>
                    {library.recentlyPlayed.length === 0 ? (
                      <div className="cw-muted" style={{ padding: 24, textAlign: 'center' }}>
                        Play a song from Home or Search to see your listening history.
                      </div>
                    ) : (
                      library.recentlyPlayed.map((t, i) => renderTrackRow(t, i, library.recentlyPlayed))
                    )}
                  </div>
                </div>
              )}

              {/* PLAYLIST */}
              {route.kind === 'playlist' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {activePlaylist ? (
                    <PlaylistView
                      playlistKey={activePlaylist.id}
                      title={activePlaylist.name}
                      tracks={activePlaylist.tracks}
                      likedIds={likedIds}
                      currentTrackId={player.state.currentTrack?.videoId ?? null}
                      repeatMode={player.state.repeatMode}
                      queueTrackIds={queueTrackIds}
                      accentHex={activeAccent}
                      intensity={intensity}
                      onPlayList={player.playTrack}
                      onSetRepeatMode={player.setRepeatMode}
                      refreshing={refreshingPlaylistKey === activePlaylist.id}
                      onRefresh={() => handleRefreshPlaylist(activePlaylist)}
                      downloadingBatch={downloadingBatch}
                      downloadedInListCount={
                        activePlaylist.tracks.filter((t) => offlineIds.has(t.videoId)).length
                      }
                      onDownloadAll={() => handleDownloadPlaylist(activePlaylist.tracks)}
                      onDeletePlaylist={() => {
                        deletePlaylist(activePlaylist.id);
                        setRoute({ kind: 'home' });
                      }}
                      renderTrackRow={renderTrackRow}
                    />
                  ) : (
                    <GlassCard intensity={intensity} padding="24px">
                      <div className="cw-muted">Playlist not found.</div>
                    </GlassCard>
                  )}
                </div>
              )}

              {/* SETTINGS */}
              {route.kind === 'settings' && (
                <SettingsView
                  activeTab={settingsTab}
                  settings={settings}
                  auth={auth}
                  stats={library.stats}
                  likedCount={library.likedTracks.length}
                  playlistCount={library.playlists.length}
                  accentHex={activeAccent}
                  sleepRemainingSec={player.state.sleepRemainingSec}
                  onTabChange={setSettingsTab}
                  onUpdate={updateSettings}
                  onSetSleepTimer={player.setSleepTimer}
                  onLoginYt={async () => {
                    const status = await loginYouTubeMusic();
                    setAuth(status);
                    moodCacheRef.current = {};
                    loadHome(activeMood, true);
                    if (status.yt.connected) {
                      showToast('YouTube Music connected! Select playlists to import.');
                      setImportInitialTab(1);
                      setImportModalOpen(true);
                    }
                  }}
                  onLogoutYt={async () => {
                    const status = await logoutYouTubeMusic();
                    setAuth(status);
                    moodCacheRef.current = {};
                    loadHome(activeMood, true);
                  }}
                  onLoginSpotify={async () => {
                    const status = await loginSpotify();
                    setAuth(status);
                    if (status.spotify.connected) {
                      showToast('Spotify connected! Select playlists to import.');
                      setImportInitialTab(2);
                      setImportModalOpen(true);
                    }
                  }}
                  onLogoutSpotify={async () => {
                    const status = await logoutSpotify();
                    setAuth(status);
                  }}
                  onOpenImport={() => {
                    setImportInitialTab(auth.yt.connected ? 1 : auth.spotify.connected ? 2 : 0);
                    setImportModalOpen(true);
                  }}
                  onReplayTutorial={() => {
                    setOnboardingRepeat(true);
                    setOnboardingOpen(true);
                  }}
                  onExportBackup={() => {
                    const blob = new Blob([exportBackupJson()], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `claudewaves-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  onImportBackup={(raw) => {
                    importBackupJson(raw);
                    showToast('Backup restored!');
                  }}
                  onClearCache={() => {
                    clearHistoryCache();
                    moodCacheRef.current = {};
                    showToast('Cache cleared');
                  }}
                  floatingLyricsOpen={floatingLyricsOpen}
                  onToggleFloatingLyrics={handleToggleFloatingLyrics}
                  onOpenAmbientMode={handleOpenAmbientMode}
                  offlineCount={offlineEntries.length}
                  offlineBytes={offlineTotalBytes}
                  onClearDownloads={handleClearDownloads}
                  lastFmStatus={lastFmStatus}
                  onLastFmChanged={setLastFmStatus}
                  updateInfo={updateInfo}
                  onUpdateInfoChanged={setUpdateInfo}
                  onOpenStats={() => setRoute({ kind: 'stats' })}
                />
              )}
            </div>
          </main>
        </div>

        {rightPanelOpen && (
          <RightSidePanel
            tab={rightPanelTab}
            player={player.state}
            analyserRef={player.analyserRef}
            waveColorHex={waveColorHex}
            isDark={isDark}
            intensity={intensity}
            lyricsFontSize={settings.lyricsFontSize}
            lyricsBounce={settings.lyricsBounce}
            lyricsDisplayMode={settings.lyricsDisplayMode}
            lyricsOffsetMs={
              player.state.currentTrack
                ? (library.lyricsOffsets[player.state.currentTrack.videoId] ?? 0)
                : 0
            }
            onSelectTab={setRightPanelTab}
            onClose={handleCloseRightPanel}
            onExpandFull={handleOpenFullSheet}
            onOpenArtist={openArtist}
            onLyricsDisplayModeChange={handleLyricsModeChange}
            onLyricsOffsetChange={handleLyricsOffsetChange}
            onSeekTo={player.seekTo}
            onPlayQueueIndex={handlePlayQueueIndex}
            onRemoveQueueIndex={player.removeFromQueue}
          />
        )}
      </div>

      {/* Draggable & Resizable Cinema Blur Music Video Popup when outside Fullscreen */}
      {videoMode && !fullSheetOpen && player.state.currentTrack && (
        <SyncedVideoPlayer
          videoId={player.state.currentTrack.videoId}
          title={player.state.currentTrack.title}
          artist={player.state.currentTrack.artist}
          isPlaying={player.state.isPlaying}
          playbackRate={settings.playbackRate}
          quality={settings.videoQuality}
          mode="pip"
          box={floatingVideoBox}
          onBoxChange={setFloatingVideoBox}
          onQualityChange={(q) => updateSettings({ videoQuality: q })}
          onClose={() => setVideoMode(false)}
          onExpandLyricsFullscreen={(curBox) => {
            setFloatingVideoBox(curBox);
            const h = Math.round((curBox.width * 9) / 16);
            setSheetOrigin({
              mode: 'video',
              originX: Math.round(curBox.x + curBox.width / 2),
              originY: Math.round(curBox.y + h / 2),
              scale: Math.max(0.28, Math.min(0.68, curBox.width / Math.max(640, window.innerWidth))),
            });
            setRightPanelTab('lyrics');
            setFullSheetOpen(true);
          }}
        />
      )}

      {/* Floating or Skin-Specific Player Dock (Bottom for Default/Spotify/YTM) */}
      {settings.layoutSkin !== 'apple' && renderPlayerDock()}

      {/* Full-Screen Now Playing / Word-Synced Lyrics / Queue Overlay */}
      <NowPlayingSheet
        open={fullSheetOpen}
        tab={rightPanelTab}
        origin={sheetOrigin}
        player={player.state}
        analyserRef={player.analyserRef}
        waveColorHex={waveColorHex}
        isDark={isDark}
        accentHex={activeAccent}
        intensity={intensity}
        volume={settings.volume}
        playbackRate={settings.playbackRate}
        lyricsFontSize={settings.lyricsFontSize}
        lyricsBounce={settings.lyricsBounce}
        lyricsDisplayMode={settings.lyricsDisplayMode}
        lyricsOffsetMs={
          player.state.currentTrack
            ? (library.lyricsOffsets[player.state.currentTrack.videoId] ?? 0)
            : 0
        }
        videoMode={videoMode}
        videoQuality={settings.videoQuality}
        isLiked={Boolean(player.state.currentTrack && likedIds.has(player.state.currentTrack.videoId))}
        onClose={() => setFullSheetOpen(false)}
        onTabChange={setRightPanelTab}
        onVolumeChange={(v) => updateSettings({ volume: Math.round(v) })}
        onLyricsDisplayModeChange={(lyricsDisplayMode) => updateSettings({ lyricsDisplayMode })}
        onLyricsOffsetChange={(ms) => {
          if (player.state.currentTrack) {
            setTrackLyricsOffset(player.state.currentTrack.videoId, ms);
          }
        }}
        onToggleVideoMode={handleToggleVideoMode}
        onVideoQualityChange={(q) => updateSettings({ videoQuality: q })}
        onTogglePlayPause={player.togglePlayPause}
        onNext={player.next}
        onPrev={player.previous}
        onSeekTo={player.seekTo}
        onBestPart={handleBestPart}
        onToggleShuffle={player.toggleShuffle}
        onCycleRepeat={player.cycleRepeat}
        onToggleLike={() => player.state.currentTrack && toggleLike(player.state.currentTrack)}
        onOpenArtist={openArtist}
        onPlayQueueIndex={(idx) => player.playAtIndex(idx)}
        onRemoveQueueIndex={player.removeFromQueue}
      />

      {/* Profile Modal (Upload Photo & Edit Name) */}
      <ProfileModal
        open={profileModalOpen}
        name={settings.profileName}
        avatar={settings.profileAvatar}
        accentHex={activeAccent}
        intensity={intensity}
        onClose={() => setProfileModalOpen(false)}
        onSave={(name, avatar) => updateSettings({ profileName: name, profileAvatar: avatar })}
      />

      {/* Import Playlist Modal */}
      <ImportModal
        open={importModalOpen}
        initialTab={importInitialTab}
        auth={auth}
        accentHex={activeAccent}
        intensity={intensity}
        onClose={() => setImportModalOpen(false)}
        onImportedPlaylist={(title, tracks, openNow = true, meta) => {
          const newId = createPlaylist(title, tracks, meta);
          if (openNow) setRoute({ kind: 'playlist', id: newId });
        }}
        onSyncedLiked={(tracks) => mergeLikedTracks(tracks)}
        onOpenSettings={() => setRoute({ kind: 'settings' })}
      />

      {/* Create Playlist Modal */}
      <GlassSheet
        open={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
        intensity={intensity}
        aria-label="Create Playlist"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPlaylistName.trim()) {
              createPlaylist(newPlaylistName);
              setNewPlaylistName('');
              setPlaylistModalOpen(false);
            }
          }}
          style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <h2 className="cw-h2">Create Playlist</h2>
          <GlassInput
            value={newPlaylistName}
            tint={activeAccent}
            intensity={intensity}
            placeholder="Playlist name..."
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onClear={() => setNewPlaylistName('')}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <GlassButton
              type="button"
              variant="glass"
              intensity={intensity}
              onClick={() => setPlaylistModalOpen(false)}
            >
              Cancel
            </GlassButton>
            <GlassButton
              type="submit"
              variant="filled"
              tint={activeAccent}
              intensity={intensity}
              disabled={!newPlaylistName.trim()}
            >
              Create
            </GlassButton>
          </div>
        </form>
      </GlassSheet>

      {/* Floating Desktop Lyrics Synchronization Bridge */}
      {floatingLyricsOpen && (
        <FloatingLyricsBridge
          track={player.state.currentTrack}
          lyrics={player.state.lyrics}
          lyricsOffsetMs={
            player.state.currentTrack
              ? (library.lyricsOffsets[player.state.currentTrack.videoId] ?? 0)
              : 0
          }
          isPlaying={player.state.isPlaying}
          accentHex={activeAccent}
        />
      )}

      {/* Discord Rich Presence & Last.fm Scrobbling Bridge */}
      <SocialPresenceBridge
        track={player.state.currentTrack}
        isPlaying={player.state.isPlaying}
        durationMs={player.state.durationMs}
        discordEnabled={settings.discordRpcEnabled}
        discordClientId={settings.discordClientId}
        lastFmEnabled={settings.lastFmEnabled}
        lastFmConnected={lastFmStatus.connected}
        onLastFmStatusUpdate={setLastFmStatus}
      />

      {/* Fullscreen Ambient Visualizer / Monitor-2 Mode */}
      <AmbientVisualizerView
        open={ambientModeOpen}
        preset={settings.ambientPreset}
        onChangePreset={(ambientPreset) => updateSettings({ ambientPreset })}
        player={player.state}
        analyserRef={player.analyserRef}
        waveColorHex={waveColorHex}
        accentHex={activeAccent}
        isDark={isDark}
        isLiked={Boolean(player.state.currentTrack && likedIds.has(player.state.currentTrack.videoId))}
        lyricsOffsetMs={
          player.state.currentTrack
            ? (library.lyricsOffsets[player.state.currentTrack.videoId] ?? 0)
            : 0
        }
        onTogglePlayPause={player.togglePlayPause}
        onNext={player.next}
        onPrev={player.previous}
        onSeekTo={player.seekTo}
        onToggleLike={handleToggleLikeCurrent}
        onClose={handleCloseAmbientMode}
      />

      {/* Quick Toggleable Equalizer & DSP Popover */}
      <QuickEqPopover
        open={eqPopupOpen}
        settings={settings}
        accentHex={activeAccent}
        intensity={intensity}
        onUpdate={updateSettings}
        onClose={() => setEqPopupOpen(false)}
      />

      {/* Android 1:1 Splash Screen + 5-Step Onboarding Wizard */}
      <AndroidSplash open={splashVisible} onDone={() => setSplashVisible(false)} />
      <OnboardingWizard
        open={onboardingOpen && !splashVisible}
        isRepeat={onboardingRepeat}
        settings={settings}
        auth={auth}
        accentHex={activeAccent}
        onUpdateSettings={updateSettings}
        onLoginYt={async () => {
          const status = await loginYouTubeMusic();
          setAuth(status);
          moodCacheRef.current = {};
          loadHome('all', true);
          if (status.yt.connected) {
            showToast('YouTube Music connected! Tick playlists below to import.');
          }
        }}
        onLoginSpotify={async () => {
          const status = await loginSpotify();
          setAuth(status);
          if (status.spotify.connected) {
            showToast('Spotify connected! Tick playlists below to import.');
          }
        }}
        onImportedPlaylist={(title, tracks, meta) => {
          createPlaylist(title, tracks, meta);
          setPendingImportTab(null);
        }}
        onSyncedLiked={(tracks) => mergeLikedTracks(tracks)}
        onComplete={() => {
          updateSettings({ onboardingCompleted: true });
          setOnboardingOpen(false);
          setOnboardingRepeat(false);
          if (pendingImportTab !== null) {
            setImportInitialTab(pendingImportTab);
            setImportModalOpen(true);
            setPendingImportTab(null);
          }
        }}
      />
    </>
  );
};
