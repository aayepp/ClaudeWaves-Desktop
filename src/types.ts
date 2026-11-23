export interface Track {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  plays?: string;
  isTopSong?: boolean;
  durationMs: number;
  thumbnailUrl: string;
  addedAtMs?: number;
}

export interface HomeShelf {
  title: string;
  subtitle?: string;
  tracks: Track[];
}

export interface ArtistAlbum {
  browseId: string;
  title: string;
  subtitle: string;
  thumbnailUrl: string;
}

export interface ArtistPageData {
  name: string;
  browseId?: string | null;
  subscribers?: string;
  description?: string;
  bannerUrl?: string;
  topSongs: Track[];
  albums: ArtistAlbum[];
}

export interface AlbumPageData {
  browseId: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  tracks: Track[];
}

export type SearchFilter = 'all' | 'songs' | 'videos';

export interface LyricWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  timeMs: number;
  endMs?: number;
  text: string;
  romanized?: string;
  words?: LyricWord[];
}

export type LyricsResult =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'instrumental' }
  | { kind: 'plain'; text: string; romanizedLines?: Array<string | null> }
  | { kind: 'synced'; wordSynced?: boolean; source?: string; lines: LyricLine[] };

export interface BestPartInfo {
  timeMs: number;
  source: string;
}

export type RepeatMode = 'off' | 'all' | 'one';
export type PlaylistTrackSort =
  | 'custom'
  | 'latest_liked'
  | 'date_added'
  | 'name'
  | 'artist'
  | 'duration';

export type ThemePreset = 'neutral' | 'dynamic' | 'comic' | 'rhythmo';
export type LayoutSkin =
  | 'default'
  | 'spotify'
  | 'ytmusic'
  | 'apple'
  | 'tidal'
  | 'soundcloud'
  | 'nothing';
export type ThemeMode = 'dark' | 'light' | 'system';
export type GlassQualityMode = 'low' | 'auto' | 'high';
export type LyricsFontSize = 'compact' | 'normal' | 'large';
export type LyricsBounceStyle = 'subtle' | 'expressive' | 'bold';
export type LyricsDisplayMode = 'sentence' | 'word';
export type AmbientPreset = 'aurora' | 'vinyl' | 'halo' | 'wave';

export interface TrackPlayStat {
  track: Track;
  count: number;
  lastPlayedAtMs: number;
}

export interface ListeningStats {
  totalPlays: number;
  totalListenSec: number;
  artistCounts: Record<string, number>;
  dailyPlays?: Record<string, number>;
  dailyListenSec?: Record<string, number>;
  trackCounts?: Record<string, TrackPlayStat>;
}

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 1, 2, 2],
  Pop: [-1, 2, 4, 4, 2, 0, -1, 1, 2, 3],
  Rock: [4, 3, 2, 0, -1, 1, 3, 4, 4, 3],
  Vocal: [-2, -2, 0, 2, 4, 5, 4, 2, 0, -1],
  'R&B / Soul': [4, 5, 3, 1, -1, 0, 2, 3, 2, 2],
  Electronic: [5, 4, 2, 0, -2, 1, 2, 4, 5, 5],
  Jazz: [3, 2, 1, 2, -1, -1, 0, 2, 3, 4],
};

export interface AppSettings {
  themePreset: ThemePreset;
  layoutSkin: LayoutSkin;
  themeMode: ThemeMode;
  amoled: boolean;
  artworkBackdrop: boolean;
  followCoverAccent: boolean;
  autoRadio: boolean;
  glassIntensity: number; // 1..10
  glassQuality: GlassQualityMode;
  accentHex: string; // 'neutral' or #RRGGBB
  volume: number; // 0..100
  profileName: string;
  profileAvatar: string | null;
  onboardingCompleted: boolean;
  eqPreset: string;
  eqGains: number[]; // 10 bands (-12..+12 dB)
  playbackRate: number;
  crossfadeSec: number; // 0 | 3 | 5 | 8
  lyricsFontSize: LyricsFontSize;
  lyricsBounce: LyricsBounceStyle;
  lyricsDisplayMode: LyricsDisplayMode;
  videoQuality: number; // 480 | 720 | 1080 | 1440 | 2160
  homeSectionOrder: string[];
  closeToTray: boolean;
  globalMediaKeys: boolean;
  offlineMode: boolean;
  volumeNormalizer: boolean;
  spatialAudio: boolean;
  autoEqProfile: string;
  sponsorBlockEnabled: boolean;
  discordRpcEnabled: boolean;
  discordClientId: string;
  lastFmEnabled: boolean;
  ambientPreset: AmbientPreset;
  ambientIdleMinutes: number; // 0 = Off, 1 | 3 | 5 | 10
  autoSyncPlaylists: boolean;
  lyricsAutoRomanize: boolean;
}

export interface OfflineTrackEntry extends Track {
  bytes: number;
  mimeType: string;
  bitrateKbps: number;
  downloadedAtMs: number;
}

export interface SavedPlaybackState {
  currentTrack: Track;
  queue: Track[];
  currentIndex: number;
  positionMs: number;
  durationMs: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  rightPanelOpen?: boolean;
  rightPanelTab?: 'lyrics' | 'queue';
  fullSheetOpen?: boolean;
}

export interface UserPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  source?: 'youtube' | 'spotify';
  sourceId?: string;
  lastSyncedAtMs?: number;
}

export interface LibraryData {
  settings: AppSettings;
  likedTracks: Track[];
  recentlyPlayed: Track[];
  playlists: UserPlaylist[];
  stats: ListeningStats;
  lyricsOffsets: Record<string, number>;
  lastPlayback?: SavedPlaybackState | null;
}

export interface ResolvedStream {
  url: string;
  proxyUrl?: string;
  mimeType: string;
  bitrateKbps: number;
  source: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themePreset: 'rhythmo',
  layoutSkin: 'default',
  themeMode: 'dark',
  amoled: false,
  artworkBackdrop: true,
  followCoverAccent: false,
  autoRadio: true,
  glassIntensity: 6,
  glassQuality: 'low',
  accentHex: 'neutral',
  volume: 80,
  profileName: '',
  profileAvatar: null,
  onboardingCompleted: false,
  eqPreset: 'Flat',
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  playbackRate: 1,
  crossfadeSec: 3,
  lyricsFontSize: 'normal',
  lyricsBounce: 'expressive',
  lyricsDisplayMode: 'sentence',
  videoQuality: 720,
  homeSectionOrder: [],
  closeToTray: true,
  globalMediaKeys: true,
  offlineMode: false,
  volumeNormalizer: false,
  spatialAudio: false,
  autoEqProfile: 'Off',
  sponsorBlockEnabled: true,
  discordRpcEnabled: true,
  discordClientId: '',
  lastFmEnabled: true,
  ambientPreset: 'aurora',
  ambientIdleMinutes: 3,
  autoSyncPlaylists: true,
  lyricsAutoRomanize: true,
};

// 12 Curated Accent Colors (Neutral Clean default + 11 refined hues, no harsh neon green default)
export const ACCENT_PRESETS = [
  { name: 'Neutral Clean', hex: 'neutral' },
  { name: 'Apple Blue', hex: '#0A84FF' },
  { name: 'Soft Violet', hex: '#8E6CFF' },
  { name: 'Rose Pink', hex: '#FF4F8B' },
  { name: 'Crimson', hex: '#E63946' },
  { name: 'Sunset Coral', hex: '#FF6B4A' },
  { name: 'Warm Amber', hex: '#F59E0B' },
  { name: 'Champagne Gold', hex: '#D4AF37' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Ocean Teal', hex: '#14B8A6' },
  { name: 'Sky Cyan', hex: '#38BDF8' },
  { name: 'Indigo', hex: '#6366F1' },
] as const;

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
