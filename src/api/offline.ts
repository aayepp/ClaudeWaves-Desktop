import type { OfflineTrackEntry, Track } from '../types';

export async function fetchOfflineList(): Promise<{
  tracks: OfflineTrackEntry[];
  totalBytes: number;
}> {
  try {
    const res = await fetch('/api/offline/list');
    if (!res.ok) return { tracks: [], totalBytes: 0 };
    const data = (await res.json()) as { tracks?: OfflineTrackEntry[]; totalBytes?: number };
    return {
      tracks: Array.isArray(data.tracks) ? data.tracks : [],
      totalBytes: Number(data.totalBytes) || 0,
    };
  } catch {
    return { tracks: [], totalBytes: 0 };
  }
}

export async function downloadTrackToDisk(track: Track): Promise<OfflineTrackEntry> {
  const res = await fetch('/api/offline/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track }),
  });
  const data = (await res.json()) as { entry?: OfflineTrackEntry; error?: string };
  if (!res.ok || !data.entry) {
    throw new Error(data.error || `Offline download HTTP ${res.status}`);
  }
  return data.entry;
}

export async function deleteOfflineTrackApi(videoId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/offline/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearOfflineTracksApi(): Promise<boolean> {
  try {
    const res = await fetch('/api/offline/clear', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export function getOfflineAudioUrl(videoId: string): string {
  return `/api/offline/audio?videoId=${encodeURIComponent(videoId)}`;
}
