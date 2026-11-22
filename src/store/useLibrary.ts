import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type LibraryData,
  type SavedPlaybackState,
  type Track,
} from '../types';

const STORAGE_KEY = 'claudewaves.desktop.library.v1';
export const LAST_PLAYBACK_STORAGE_KEY = 'claudewaves.desktop.lastPlayback.v1';

const DEFAULT_STATS = {
  totalPlays: 0,
  totalListenSec: 0,
  artistCounts: {},
  dailyPlays: {},
  dailyListenSec: {},
  trackCounts: {},
};

const EMPTY_LIBRARY: LibraryData = {
  settings: DEFAULT_SETTINGS,
  likedTracks: [],
  recentlyPlayed: [],
  playlists: [],
  stats: DEFAULT_STATS,
  lyricsOffsets: {},
  lastPlayback: null,
};

function mergeLibrary(parsed: Partial<LibraryData>, fallback: LibraryData): LibraryData {
  const rawSettings = (parsed.settings ?? {}) as Partial<AppSettings>;
  const presetVal = rawSettings.themePreset as string | undefined;
  const migratedPreset =
    presetVal === 'comic' || presetVal === 'dynamic' || presetVal === 'neutral' || presetVal === 'rhythmo'
      ? presetVal
      : fallback.settings.themePreset;
  const skinVal = rawSettings.layoutSkin as string | undefined;
  const migratedSkin =
    skinVal === 'default' ||
    skinVal === 'spotify' ||
    skinVal === 'ytmusic' ||
    skinVal === 'apple' ||
    skinVal === 'tidal' ||
    skinVal === 'soundcloud' ||
    skinVal === 'nothing'
      ? skinVal
      : fallback.settings.layoutSkin;
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...fallback.settings,
      ...rawSettings,
      themePreset: migratedPreset,
      layoutSkin: migratedSkin,
      closeToTray:
        typeof rawSettings.closeToTray === 'boolean'
          ? rawSettings.closeToTray
          : fallback.settings.closeToTray,
      globalMediaKeys:
        typeof rawSettings.globalMediaKeys === 'boolean'
          ? rawSettings.globalMediaKeys
          : fallback.settings.globalMediaKeys,
      offlineMode:
        typeof rawSettings.offlineMode === 'boolean'
          ? rawSettings.offlineMode
          : fallback.settings.offlineMode,
      volumeNormalizer:
        typeof rawSettings.volumeNormalizer === 'boolean'
          ? rawSettings.volumeNormalizer
          : fallback.settings.volumeNormalizer,
      spatialAudio:
        typeof rawSettings.spatialAudio === 'boolean'
          ? rawSettings.spatialAudio
          : fallback.settings.spatialAudio,
      sponsorBlockEnabled:
        typeof rawSettings.sponsorBlockEnabled === 'boolean'
          ? rawSettings.sponsorBlockEnabled
          : fallback.settings.sponsorBlockEnabled,
      autoEqProfile:
        typeof rawSettings.autoEqProfile === 'string' && rawSettings.autoEqProfile.trim()
          ? rawSettings.autoEqProfile
          : fallback.settings.autoEqProfile,
      discordRpcEnabled:
        typeof rawSettings.discordRpcEnabled === 'boolean'
          ? rawSettings.discordRpcEnabled
          : fallback.settings.discordRpcEnabled,
      discordClientId:
        typeof rawSettings.discordClientId === 'string'
          ? rawSettings.discordClientId
          : fallback.settings.discordClientId,
      lastFmEnabled:
        typeof rawSettings.lastFmEnabled === 'boolean'
          ? rawSettings.lastFmEnabled
          : fallback.settings.lastFmEnabled,
      accentHex:
        rawSettings.accentHex === '#C9FB00'
          ? 'neutral'
          : (rawSettings.accentHex ?? fallback.settings.accentHex),
      eqGains:
        Array.isArray(rawSettings.eqGains) && rawSettings.eqGains.length === 10
          ? rawSettings.eqGains
          : fallback.settings.eqGains,
      homeSectionOrder: Array.isArray(rawSettings.homeSectionOrder)
        ? rawSettings.homeSectionOrder.filter((id): id is string => typeof id === 'string')
        : fallback.settings.homeSectionOrder,
    },
    likedTracks: Array.isArray(parsed.likedTracks) ? parsed.likedTracks : fallback.likedTracks,
    recentlyPlayed: Array.isArray(parsed.recentlyPlayed) ? parsed.recentlyPlayed : fallback.recentlyPlayed,
    playlists: Array.isArray(parsed.playlists) ? parsed.playlists : fallback.playlists,
    stats: {
      ...DEFAULT_STATS,
      ...(parsed.stats ?? fallback.stats),
      artistCounts: {
        ...(fallback.stats?.artistCounts ?? {}),
        ...(parsed.stats?.artistCounts ?? {}),
      },
      dailyPlays: {
        ...(fallback.stats?.dailyPlays ?? {}),
        ...(parsed.stats?.dailyPlays ?? {}),
      },
      dailyListenSec: {
        ...(fallback.stats?.dailyListenSec ?? {}),
        ...(parsed.stats?.dailyListenSec ?? {}),
      },
      trackCounts: {
        ...(fallback.stats?.trackCounts ?? {}),
        ...(parsed.stats?.trackCounts ?? {}),
      },
    },
    lyricsOffsets:
      parsed.lyricsOffsets && typeof parsed.lyricsOffsets === 'object'
        ? parsed.lyricsOffsets
        : fallback.lyricsOffsets,
    lastPlayback: parsed.lastPlayback ?? fallback.lastPlayback ?? null,
  };
}

function loadLocalSnapshot(): LibraryData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<LibraryData>) : {};
    if (!parsed.lastPlayback) {
      const mirrorRaw = localStorage.getItem(LAST_PLAYBACK_STORAGE_KEY);
      if (mirrorRaw) {
        parsed.lastPlayback = JSON.parse(mirrorRaw) as SavedPlaybackState;
      }
    }
    return mergeLibrary(parsed, EMPTY_LIBRARY);
  } catch {
    return EMPTY_LIBRARY;
  }
}

export function useLibrary() {
  const [library, setLibrary] = useState<LibraryData>(() => loadLocalSnapshot());
  const latestRef = useRef(library);
  latestRef.current = library;
  const diskLoadedRef = useRef(false);

  // Hydrate from persistent Electron userData/library.json so app updates NEVER wipe user settings
  useEffect(() => {
    let cancelled = false;
    fetch('/api/library')
      .then((r) => (r.ok ? r.json() : null))
      .then((disk: Partial<LibraryData> | null) => {
        if (cancelled) return;
        diskLoadedRef.current = true;
        if (disk && (disk.settings || disk.playlists || disk.likedTracks || disk.recentlyPlayed)) {
          const merged = mergeLibrary(disk, latestRef.current);
          setLibrary(merged);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          } catch {
            // Ignore quota errors
          }
        } else {
          // Seed disk from existing snapshot once
          const payload = JSON.stringify(latestRef.current);
          fetch('/api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          }).catch(() => {});
        }
      })
      .catch(() => {
        diskLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced persistence (350ms) so fast slider drags run at smooth 240Hz without JSON/disk stalls
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const serialized = JSON.stringify(library);
        localStorage.setItem(STORAGE_KEY, serialized);
        if (diskLoadedRef.current) {
          fetch('/api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serialized,
          }).catch(() => {});
        }
      } catch {
        // Ignore quota or transient write errors
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [library]);

  // Flush immediately before window closes
  useEffect(() => {
    const onUnload = () => {
      try {
        const serialized = JSON.stringify(latestRef.current);
        localStorage.setItem(STORAGE_KEY, serialized);
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/library', new Blob([serialized], { type: 'application/json' }));
        }
      } catch {
        // Ignore unload errors
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setLibrary((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  const toggleLike = useCallback((track: Track) => {
    setLibrary((prev) => {
      const exists = prev.likedTracks.some((t) => t.videoId === track.videoId);
      const stamped = { ...track, addedAtMs: track.addedAtMs ?? Date.now() };
      const likedTracks = exists
        ? prev.likedTracks.filter((t) => t.videoId !== track.videoId)
        : [stamped, ...prev.likedTracks];
      return { ...prev, likedTracks };
    });
  }, []);

  const recordRecent = useCallback((track: Track) => {
    setLibrary((prev) => {
      const filtered = prev.recentlyPlayed.filter((t) => t.videoId !== track.videoId);
      const primaryArtist = track.artist.split(/[,&•]/)[0]?.trim() || track.artist;
      const nextCounts = {
        ...prev.stats.artistCounts,
        [primaryArtist]: (prev.stats.artistCounts[primaryArtist] ?? 0) + 1,
      };
      const listenSec = Math.round((track.durationMs || 180_000) / 1000);
      const now = new Date();
      const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const nextDailyPlays: Record<string, number> = {
        ...(prev.stats.dailyPlays ?? {}),
        [dayKey]: ((prev.stats.dailyPlays ?? {})[dayKey] ?? 0) + 1,
      };
      const nextDailyListenSec: Record<string, number> = {
        ...(prev.stats.dailyListenSec ?? {}),
        [dayKey]: ((prev.stats.dailyListenSec ?? {})[dayKey] ?? 0) + listenSec,
      };
      const dayKeys = Object.keys(nextDailyPlays).sort();
      if (dayKeys.length > 90) {
        for (const oldKey of dayKeys.slice(0, dayKeys.length - 90)) {
          delete nextDailyPlays[oldKey];
          delete nextDailyListenSec[oldKey];
        }
      }

      const prevTracks = prev.stats.trackCounts ?? {};
      const nextTracks: Record<string, { track: Track; count: number; lastPlayedAtMs: number }> = {
        ...prevTracks,
        [track.videoId]: {
          track,
          count: (prevTracks[track.videoId]?.count ?? 0) + 1,
          lastPlayedAtMs: Date.now(),
        },
      };
      const trackEntries = Object.entries(nextTracks);
      if (trackEntries.length > 200) {
        trackEntries.sort((a, b) => b[1].count - a[1].count || b[1].lastPlayedAtMs - a[1].lastPlayedAtMs);
        for (const [dropId] of trackEntries.slice(200)) {
          delete nextTracks[dropId];
        }
      }

      return {
        ...prev,
        recentlyPlayed: [track, ...filtered].slice(0, 50),
        stats: {
          totalPlays: prev.stats.totalPlays + 1,
          totalListenSec: prev.stats.totalListenSec + listenSec,
          artistCounts: nextCounts,
          dailyPlays: nextDailyPlays,
          dailyListenSec: nextDailyListenSec,
          trackCounts: nextTracks,
        },
      };
    });
  }, []);

  const exportBackupJson = useCallback((): string => {
    return JSON.stringify(library, null, 2);
  }, [library]);

  const importBackupJson = useCallback((rawJson: string) => {
    const parsed = JSON.parse(rawJson) as Partial<LibraryData>;
    setLibrary((prev) => mergeLibrary(parsed, prev));
  }, []);

  const setTrackLyricsOffset = useCallback((videoId: string, offsetMs: number) => {
    if (!videoId) return;
    const clamped = Math.max(-10000, Math.min(10000, Math.round(offsetMs)));
    setLibrary((prev) => {
      const next = { ...prev.lyricsOffsets };
      if (clamped === 0) delete next[videoId];
      else next[videoId] = clamped;
      return { ...prev, lyricsOffsets: next };
    });
  }, []);

  const clearHistoryCache = useCallback(() => {
    setLibrary((prev) => ({
      ...prev,
      recentlyPlayed: [],
    }));
  }, []);

  const createPlaylist = useCallback(
    (
      name: string,
      initialTracks: Track[] = [],
      meta?: { source?: 'youtube' | 'spotify'; sourceId?: string },
    ): string => {
      const clean = name.trim() || 'Imported Playlist';
      const id = crypto.randomUUID();
      const now = Date.now();
      const stamped = initialTracks.map((t, idx) => ({
        ...t,
        addedAtMs: t.addedAtMs ?? now - idx,
      }));
      setLibrary((prev) => ({
        ...prev,
        playlists: [
          {
            id,
            name: clean,
            tracks: stamped,
            ...(meta?.source ? { source: meta.source } : {}),
            ...(meta?.sourceId ? { sourceId: meta.sourceId, lastSyncedAtMs: now } : {}),
          },
          ...prev.playlists,
        ],
      }));
      return id;
    },
    [],
  );

  const mergeLikedTracks = useCallback((incoming: Track[]): { added: number; total: number } => {
    const prevList = latestRef.current.likedTracks;
    const existingIds = new Set(prevList.map((t) => t.videoId));
    const now = Date.now();
    const fresh = incoming
      .filter((t) => !existingIds.has(t.videoId))
      .map((t, idx) => ({ ...t, addedAtMs: t.addedAtMs ?? now - idx }));
    if (fresh.length > 0) {
      setLibrary((prev) => {
        const curIds = new Set(prev.likedTracks.map((t) => t.videoId));
        const toAdd = fresh.filter((t) => !curIds.has(t.videoId));
        if (toAdd.length === 0) return prev;
        return { ...prev, likedTracks: [...toAdd, ...prev.likedTracks] };
      });
    }
    return { added: fresh.length, total: prevList.length + fresh.length };
  }, []);

  const syncPlaylistTracks = useCallback(
    (
      playlistId: string,
      incoming: Track[],
      meta?: { source?: 'youtube' | 'spotify'; sourceId?: string },
    ): { added: number; total: number } => {
      const existingPl = latestRef.current.playlists.find((p) => p.id === playlistId);
      const existingMap = new Map((existingPl?.tracks ?? []).map((t) => [t.videoId, t]));
      const now = Date.now();
      let added = 0;
      const merged: Track[] = incoming.map((t, idx) => {
        const prevTrack = existingMap.get(t.videoId);
        if (!prevTrack) added++;
        return {
          ...t,
          addedAtMs: prevTrack?.addedAtMs ?? t.addedAtMs ?? now - idx,
        };
      });

      setLibrary((prev) => ({
        ...prev,
        playlists: prev.playlists.map((p) =>
          p.id !== playlistId
            ? p
            : {
                ...p,
                tracks: merged,
                source: meta?.source ?? p.source,
                sourceId: meta?.sourceId ?? p.sourceId,
                lastSyncedAtMs: now,
              },
        ),
      }));
      return { added, total: merged.length };
    },
    [],
  );

  const deletePlaylist = useCallback((id: string) => {
    setLibrary((prev) => ({
      ...prev,
      playlists: prev.playlists.filter((p) => p.id !== id),
    }));
  }, []);

  const addTrackToPlaylist = useCallback((playlistId: string, track: Track) => {
    setLibrary((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) => {
        if (p.id !== playlistId || p.tracks.some((t) => t.videoId === track.videoId)) return p;
        return {
          ...p,
          tracks: [...p.tracks, { ...track, addedAtMs: track.addedAtMs ?? Date.now() }],
        };
      }),
    }));
  }, []);

  const saveLastPlayback = useCallback((next: SavedPlaybackState | null, flush = false) => {
    try {
      if (next) {
        localStorage.setItem(LAST_PLAYBACK_STORAGE_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(LAST_PLAYBACK_STORAGE_KEY);
      }
    } catch {
      // Ignore quota errors
    }
    const updated = { ...latestRef.current, lastPlayback: next };
    latestRef.current = updated;
    if (flush) {
      try {
        const serialized = JSON.stringify(updated);
        localStorage.setItem(STORAGE_KEY, serialized);
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/library', new Blob([serialized], { type: 'application/json' }));
        }
      } catch {
        // Ignore flush errors
      }
      return;
    }
    setLibrary((prev) => ({ ...prev, lastPlayback: next }));
  }, []);

  return {
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
  };
}
