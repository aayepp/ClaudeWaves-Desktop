import type { PlaylistTrackSort, Track } from '../types';

export const PLAYLIST_SORT_OPTIONS: Array<{ id: PlaylistTrackSort; label: string }> = [
  { id: 'custom', label: 'Custom Order' },
  { id: 'latest_liked', label: 'Liked Songs' },
  { id: 'date_added', label: 'Date Added' },
  { id: 'name', label: 'Title (A–Z)' },
  { id: 'artist', label: 'Artist (A–Z)' },
  { id: 'duration', label: 'Play Time' },
];

const SORT_STORAGE_KEY = 'claudewaves.desktop.playlistSort.v1';
const GLOBAL_SORT_KEY = '__global__';

interface StoredSortPref {
  sort: PlaylistTrackSort;
  ascending: boolean;
}

const VALID_SORTS = new Set<PlaylistTrackSort>([
  'custom',
  'latest_liked',
  'date_added',
  'name',
  'artist',
  'duration',
]);

function readSortMap(): Record<string, StoredSortPref> {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredSortPref>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadPlaylistSort(key: string, isLikedView: boolean): StoredSortPref {
  const fallback: StoredSortPref = isLikedView
    ? { sort: 'latest_liked', ascending: false }
    : { sort: 'custom', ascending: true };
  const map = readSortMap();
  const hit = map[key] ?? (!isLikedView ? map[GLOBAL_SORT_KEY] : undefined);
  if (!hit || !VALID_SORTS.has(hit.sort)) return fallback;
  return {
    sort: hit.sort,
    ascending: Boolean(hit.ascending),
  };
}

export function savePlaylistSort(
  key: string,
  sort: PlaylistTrackSort,
  ascending: boolean,
  isLikedView: boolean,
): void {
  try {
    const map = readSortMap();
    const pref: StoredSortPref = { sort, ascending };
    map[key] = pref;
    if (!isLikedView) {
      map[GLOBAL_SORT_KEY] = pref;
    }
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function sortByTimestamp(tracks: Track[], ascending: boolean, newestFirst: boolean): Track[] {
  const hasTimestamp = tracks.some((t) => typeof t.addedAtMs === 'number');
  const dateAsc = newestFirst ? !ascending : ascending;
  if (!hasTimestamp) {
    return dateAsc ? [...tracks] : [...tracks].reverse();
  }
  const legacy = tracks.filter((t) => typeof t.addedAtMs !== 'number');
  const orderedLegacy = dateAsc ? legacy : [...legacy].reverse();
  const timestamped = tracks
    .map((track, idx) => ({ track, idx }))
    .filter((entry) => typeof entry.track.addedAtMs === 'number')
    .sort((a, b) => {
      const diff = (a.track.addedAtMs ?? 0) - (b.track.addedAtMs ?? 0);
      return (ascending ? diff : -diff) || a.idx - b.idx;
    })
    .map((entry) => entry.track);

  return ascending ? [...orderedLegacy, ...timestamped] : [...timestamped, ...orderedLegacy];
}

export function sortAndFilterTracks(
  tracks: Track[],
  opts: {
    sort: PlaylistTrackSort;
    ascending: boolean;
    query: string;
    likedIds: Set<string>;
    isLikedView: boolean;
  },
): Track[] {
  const { sort, ascending, query, likedIds, isLikedView } = opts;
  let result: Track[];

  switch (sort) {
    case 'custom': {
      result = ascending ? [...tracks] : [...tracks].reverse();
      break;
    }
    case 'latest_liked': {
      if (isLikedView) {
        result = sortByTimestamp(tracks, ascending, true);
      } else {
        const liked: Array<{ track: Track; idx: number }> = [];
        const others: Track[] = [];
        tracks.forEach((track, idx) => {
          if (likedIds.has(track.videoId)) liked.push({ track, idx });
          else others.push(track);
        });
        liked.sort((a, b) => {
          const at = a.track.addedAtMs ?? 0;
          const bt = b.track.addedAtMs ?? 0;
          return bt - at || a.idx - b.idx;
        });
        const likedTracks = liked.map((item) => item.track);
        result = ascending ? [...others, ...likedTracks] : [...likedTracks, ...others];
      }
      break;
    }
    case 'date_added': {
      result = sortByTimestamp(tracks, ascending, isLikedView);
      break;
    }
    case 'name': {
      const dir = ascending ? 1 : -1;
      result = [...tracks].sort((a, b) => collator.compare(a.title, b.title) * dir);
      break;
    }
    case 'artist': {
      const dir = ascending ? 1 : -1;
      result = [...tracks].sort(
        (a, b) => (collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title)) * dir,
      );
      break;
    }
    case 'duration': {
      const dir = ascending ? 1 : -1;
      result = [...tracks].sort((a, b) => {
        const aMissing = !a.durationMs || a.durationMs <= 0;
        const bMissing = !b.durationMs || b.durationMs <= 0;
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        return (a.durationMs - b.durationMs) * dir;
      });
      break;
    }
  }

  const clean = query.trim().toLowerCase();
  if (!clean) return result;
  return result.filter(
    (t) => t.title.toLowerCase().includes(clean) || t.artist.toLowerCase().includes(clean),
  );
}
