import type { HomeShelf, ResolvedStream, SearchFilter, Track } from '../types';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const isTauri = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

const FILTER_PARAMS: Record<SearchFilter, string | null> = {
  all: null,
  songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
  videos: 'EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D',
};

type JsonRec = Record<string, unknown>;

function asRec(v: unknown): JsonRec | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRec) : null;
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function extractRunsText(node: unknown): string {
  const rec = asRec(node);
  if (!rec) return '';
  if (typeof rec.simpleText === 'string') return rec.simpleText;
  const runs = asArr(rec.runs);
  return runs
    .map((r) => {
      const text = asRec(r)?.text;
      return typeof text === 'string' ? text : '';
    })
    .join('')
    .trim();
}

function highResThumb(url: string | undefined, videoId: string): string {
  if (!url) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return url.replace(/=w\d+-h\d+[^&]*/, '=w544-h544-l90-rj');
}

function extractBestThumb(node: unknown, videoId: string): string {
  const thumbs = asArr(asRec(node)?.thumbnails);
  const last = asRec(thumbs[thumbs.length - 1]);
  const url = typeof last?.url === 'string' ? last.url : undefined;
  return highResThumb(url, videoId);
}

function parseDurationMs(raw: string): number {
  const clean = raw.trim();
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) return 0;
  const parts = clean.split(':').map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

function findFirstVideoId(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstVideoId(item);
      if (found) return found;
    }
    return null;
  }
  const rec = asRec(node);
  if (!rec) return null;
  const watch = asRec(rec.watchEndpoint);
  if (typeof watch?.videoId === 'string' && watch.videoId.length === 11) {
    return watch.videoId;
  }
  for (const val of Object.values(rec)) {
    const found = findFirstVideoId(val);
    if (found) return found;
  }
  return null;
}

function parseResponsiveItem(item: JsonRec): Track | null {
  const playlistItemData = asRec(item.playlistItemData);
  const videoId =
    (typeof playlistItemData?.videoId === 'string' ? playlistItemData.videoId : null) ??
    findFirstVideoId(item);
  if (!videoId) return null;

  const cols = asArr(item.flexColumns);
  const title = extractRunsText(
    asRec(asRec(cols[0])?.musicResponsiveListItemFlexColumnRenderer)?.text,
  );
  if (!title) return null;

  const metaRuns = asArr(
    asRec(asRec(asRec(cols[1])?.musicResponsiveListItemFlexColumnRenderer)?.text)?.runs,
  );
  const parts = metaRuns
    .map((r) => (typeof asRec(r)?.text === 'string' ? (asRec(r)!.text as string).trim() : ''))
    .filter((t) => t && t !== '•' && t !== '·' && t.toLowerCase() !== 'song' && t.toLowerCase() !== 'video');

  let durationMs = 0;
  const info: string[] = [];
  for (const p of parts) {
    const dur = parseDurationMs(p);
    if (dur > 0 && durationMs === 0) durationMs = dur;
    else if (!/plays|views/i.test(p)) info.push(p);
  }

  const thumbNode = asRec(asRec(item.thumbnail)?.musicThumbnailRenderer)?.thumbnail;
  return {
    videoId,
    title,
    artist: info[0] || 'YouTube Music',
    album: info[1],
    durationMs,
    thumbnailUrl: extractBestThumb(thumbNode, videoId),
  };
}

function parseTwoRowItem(item: JsonRec): Track | null {
  const videoId =
    (asRec(asRec(item.navigationEndpoint)?.watchEndpoint)?.videoId as string | undefined) ??
    findFirstVideoId(item.thumbnailOverlay);
  if (!videoId || videoId.length !== 11) return null;

  const title = extractRunsText(item.title);
  if (!title) return null;
  const subtitleRaw = extractRunsText(item.subtitle);
  const artist =
    subtitleRaw
      .split(/[•·]/)
      .map((s) => s.trim())
      .find((s) => s && !/^song|video$/i.test(s)) || 'YouTube Music';

  const thumbNode = asRec(asRec(item.thumbnailRenderer)?.musicThumbnailRenderer)?.thumbnail;
  return {
    videoId,
    title,
    artist,
    durationMs: 0,
    thumbnailUrl: extractBestThumb(thumbNode, videoId),
  };
}

function collectTracks(node: unknown, out: Track[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTracks(n, out));
    return;
  }
  const rec = asRec(node);
  if (!rec) return;
  if (rec.musicResponsiveListItemRenderer) {
    const t = parseResponsiveItem(asRec(rec.musicResponsiveListItemRenderer)!);
    if (t) out.push(t);
    return;
  }
  if (rec.musicTwoRowItemRenderer) {
    const t = parseTwoRowItem(asRec(rec.musicTwoRowItemRenderer)!);
    if (t) out.push(t);
    return;
  }
  Object.values(rec).forEach((v) => collectTracks(v, out));
}

function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    if (seen.has(t.videoId)) return false;
    seen.add(t.videoId);
    return true;
  });
}

function collectShelves(node: unknown, out: HomeShelf[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectShelves(n, out));
    return;
  }
  const rec = asRec(node);
  if (!rec) return;

  const carousel = asRec(rec.musicCarouselShelfRenderer);
  if (carousel) {
    const header = asRec(asRec(carousel.header)?.musicCarouselShelfBasicHeaderRenderer);
    const title = extractRunsText(header?.title) || 'Recommended';
    const subtitle = extractRunsText(header?.strapline) || undefined;
    const tracks: Track[] = [];
    collectTracks(carousel.contents, tracks);
    const clean = dedupeTracks(tracks);
    if (clean.length > 0) out.push({ title, subtitle, tracks: clean });
    return;
  }

  const shelf = asRec(rec.musicShelfRenderer);
  if (shelf) {
    const title = extractRunsText(shelf.title) || 'Quick picks';
    const tracks: Track[] = [];
    collectTracks(shelf.contents, tracks);
    const clean = dedupeTracks(tracks);
    if (clean.length > 0) out.push({ title, tracks: clean });
    return;
  }

  Object.values(rec).forEach((v) => collectShelves(v, out));
}

function collectPanelTracks(node: unknown, out: Track[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectPanelTracks(n, out));
    return;
  }
  const rec = asRec(node);
  if (!rec) return;

  const panel = asRec(rec.playlistPanelVideoRenderer);
  if (panel && typeof panel.videoId === 'string') {
    const title = extractRunsText(panel.title);
    const artist = extractRunsText(panel.shortBylineText) || extractRunsText(panel.longBylineText) || 'Unknown';
    const durationMs = parseDurationMs(extractRunsText(panel.lengthText));
    if (title) {
      out.push({
        videoId: panel.videoId,
        title,
        artist,
        durationMs,
        thumbnailUrl: extractBestThumb(panel.thumbnail, panel.videoId),
      });
    }
    return;
  }
  Object.values(rec).forEach((v) => collectPanelTracks(v, out));
}

export async function fetchHomeFeed(mood = 'all'): Promise<HomeShelf[]> {
  const root = isTauri()
    ? await tauriInvoke<unknown>('yt_browse_home')
    : await fetch(`/api/yt/home?mood=${encodeURIComponent(mood)}`).then(async (r) => {
        if (!r.ok) throw new Error(`Feed HTTP ${r.status}`);
        return r.json();
      });

  const shelves: HomeShelf[] = [];
  const rec = asRec(root);
  if (rec?.home) collectShelves(rec.home, shelves);
  if (rec?.charts) collectShelves(rec.charts, shelves);

  // Curated search shelves returned alongside Home/Mood
  const curated = asArr(rec?.curated);
  for (const entry of curated) {
    const c = asRec(entry);
    if (!c) continue;
    const title = typeof c.title === 'string' ? c.title : 'Recommended';
    const subtitle = typeof c.subtitle === 'string' ? c.subtitle : undefined;
    const tracks: Track[] = [];
    collectTracks(c.raw, tracks);
    const clean = dedupeTracks(tracks).slice(0, 16);
    if (clean.length > 0) {
      shelves.push({ title, subtitle, tracks: clean });
    }
  }

  // Fallback if root is raw InnerTube response (Tauri)
  if (shelves.length === 0) {
    collectShelves(root, shelves);
  }

  const seen = new Set<string>();
  return shelves.filter((s) => {
    if (seen.has(s.title)) return false;
    seen.add(s.title);
    return s.tracks.length > 0;
  });
}

export async function fetchExploreFeed(): Promise<HomeShelf[]> {
  const root = isTauri()
    ? await tauriInvoke<unknown>('yt_browse_explore')
    : await fetch('/api/yt/explore').then(async (r) => {
        if (!r.ok) throw new Error(`Explore HTTP ${r.status}`);
        return r.json();
      });

  const shelves: HomeShelf[] = [];
  collectShelves(root, shelves);
  const seen = new Set<string>();
  return shelves.filter((s) => {
    if (seen.has(s.title)) return false;
    seen.add(s.title);
    return s.tracks.length > 0;
  });
}

export async function searchYouTubeMusic(query: string, filter: SearchFilter): Promise<Track[]> {
  if (!query.trim()) return [];
  const params = FILTER_PARAMS[filter];
  const root = isTauri()
    ? await tauriInvoke<unknown>('yt_search', { query: query.trim(), params })
    : await fetch(
        `/api/yt/search?q=${encodeURIComponent(query.trim())}${params ? `&params=${encodeURIComponent(params)}` : ''}`,
      ).then(async (r) => {
        if (!r.ok) throw new Error(`Search HTTP ${r.status}`);
        return r.json();
      });

  const tracks: Track[] = [];
  collectTracks(root, tracks);
  return dedupeTracks(tracks);
}

export async function fetchUpNextRadio(videoId: string): Promise<Track[]> {
  const root = isTauri()
    ? await tauriInvoke<unknown>('yt_up_next', { videoId })
    : await fetch(`/api/yt/next?videoId=${encodeURIComponent(videoId)}`).then(async (r) => {
        if (!r.ok) throw new Error(`UpNext HTTP ${r.status}`);
        return r.json();
      });

  const tracks: Track[] = [];
  collectPanelTracks(root, tracks);
  return dedupeTracks(tracks).filter((t) => t.videoId !== videoId);
}

export async function resolveTrackStream(videoId: string): Promise<ResolvedStream> {
  if (isTauri()) {
    return tauriInvoke<ResolvedStream>('yt_resolve_stream', { videoId });
  }
  const res = await fetch(`/api/yt/stream?videoId=${encodeURIComponent(videoId)}`);
  const data = (await res.json()) as ResolvedStream & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `Stream HTTP ${res.status}`);
  }
  return data;
}
