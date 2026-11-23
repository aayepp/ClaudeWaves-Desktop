import type { ListeningStats, Track, UserPlaylist } from '../types';

export const SMART_PLAYLIST_IDS = {
  mostPlayed: 'smart:most-played',
  forgottenGems: 'smart:forgotten-gems',
  heavyRotation: 'smart:heavy-rotation',
} as const;

export function isSmartPlaylistId(id: string): boolean {
  return id.startsWith('smart:');
}

export function buildSmartPlaylists(
  stats: ListeningStats,
  likedTracks: Track[],
  recentlyPlayed: Track[],
): UserPlaylist[] {
  const entries = Object.values(stats.trackCounts ?? {});
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const mostPlayed: Track[] =
    entries.length > 0
      ? [...entries]
          .sort((a, b) => b.count - a.count || b.lastPlayedAtMs - a.lastPlayedAtMs)
          .slice(0, 40)
          .map((e) => e.track)
      : recentlyPlayed.slice(0, 30);

  const forgottenMap = new Map<string, { track: Track; ts: number }>();
  for (const e of entries) {
    if (now - e.lastPlayedAtMs >= fourteenDaysMs) {
      forgottenMap.set(e.track.videoId, { track: e.track, ts: e.lastPlayedAtMs });
    }
  }
  for (const t of likedTracks) {
    const stat = stats.trackCounts?.[t.videoId];
    const lastTs = stat?.lastPlayedAtMs ?? t.addedAtMs ?? 0;
    if (now - lastTs >= sevenDaysMs && !forgottenMap.has(t.videoId)) {
      forgottenMap.set(t.videoId, { track: t, ts: lastTs });
    }
  }
  let forgottenGems = Array.from(forgottenMap.values())
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 35)
    .map((x) => x.track);
  if (forgottenGems.length === 0 && entries.length > 0) {
    forgottenGems = [...entries]
      .sort((a, b) => a.lastPlayedAtMs - b.lastPlayedAtMs)
      .slice(0, 25)
      .map((e) => e.track);
  }

  const heavyMap = new Map<string, Track>();
  const recentEntries = entries
    .filter((e) => now - e.lastPlayedAtMs <= sevenDaysMs)
    .sort((a, b) => b.count - a.count || b.lastPlayedAtMs - a.lastPlayedAtMs);
  for (const e of recentEntries) {
    heavyMap.set(e.track.videoId, e.track);
    if (heavyMap.size >= 30) break;
  }
  for (const t of recentlyPlayed) {
    if (heavyMap.size >= 30) break;
    if (!heavyMap.has(t.videoId)) heavyMap.set(t.videoId, t);
  }
  for (const t of likedTracks) {
    if (heavyMap.size >= 30) break;
    if (!heavyMap.has(t.videoId)) heavyMap.set(t.videoId, t);
  }
  const heavyRotation = Array.from(heavyMap.values()).slice(0, 30);

  return [
    { id: SMART_PLAYLIST_IDS.mostPlayed, name: 'Most Played', tracks: mostPlayed },
    { id: SMART_PLAYLIST_IDS.heavyRotation, name: 'Heavy Rotation', tracks: heavyRotation },
    { id: SMART_PLAYLIST_IDS.forgottenGems, name: 'Forgotten Gems', tracks: forgottenGems },
  ];
}
