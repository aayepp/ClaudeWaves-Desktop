import type { Track } from '../types';

export interface DiscordRpcStatus {
  enabled: boolean;
  connected: boolean;
  ready: boolean;
  clientId: string;
  defaultClientId: string;
  lastError?: string | null;
}

export interface LastFmStatus {
  connected: boolean;
  username: string;
  scrobbledCount: number;
  lastScrobble?: string | null;
  lastError?: string | null;
}

export interface UpdateCheckResult {
  ok: boolean;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseName: string;
  notes: string;
  publishedAt: string;
  htmlUrl: string;
  downloadUrl: string;
  assetName: string;
  assetSize: number;
  message?: string;
  error?: string;
}

export interface UpdateDownloadProgress {
  downloading: boolean;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  filePath: string;
  error?: string | null;
}

export async function fetchDiscordStatus(): Promise<DiscordRpcStatus | null> {
  try {
    const res = await fetch('/api/social/discord/status');
    if (!res.ok) return null;
    return (await res.json()) as DiscordRpcStatus;
  } catch {
    return null;
  }
}

export async function updateDiscordPresenceApi(payload: {
  enabled: boolean;
  clientId: string;
  track: Track | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
}): Promise<void> {
  try {
    await fetch('/api/social/discord/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore outside Electron runtime
  }
}

export async function clearDiscordPresenceApi(): Promise<void> {
  try {
    await fetch('/api/social/discord/clear', { method: 'POST' });
  } catch {
    // Ignore
  }
}

export async function fetchLastFmStatus(): Promise<LastFmStatus> {
  try {
    const res = await fetch('/api/social/lastfm/status');
    if (!res.ok) {
      return { connected: false, username: '', scrobbledCount: 0 };
    }
    return (await res.json()) as LastFmStatus;
  } catch {
    return { connected: false, username: '', scrobbledCount: 0 };
  }
}

export async function connectLastFmApi(payload: {
  apiKey: string;
  apiSecret: string;
  username: string;
  password: string;
  sessionKey?: string;
}): Promise<LastFmStatus> {
  const res = await fetch('/api/social/lastfm/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as LastFmStatus & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Last.fm connection failed');
  }
  return data;
}

export async function disconnectLastFmApi(): Promise<LastFmStatus> {
  const res = await fetch('/api/social/lastfm/disconnect', { method: 'POST' });
  if (!res.ok) {
    return { connected: false, username: '', scrobbledCount: 0 };
  }
  return (await res.json()) as LastFmStatus;
}

export async function sendLastFmNowPlaying(payload: {
  artist: string;
  track: string;
  album?: string;
  durationSec?: number;
}): Promise<void> {
  try {
    await fetch('/api/social/lastfm/now-playing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore network errors
  }
}

export async function sendLastFmScrobble(payload: {
  artist: string;
  track: string;
  album?: string;
  durationSec?: number;
  timestampSec?: number;
}): Promise<{ ok: boolean; status?: LastFmStatus }> {
  try {
    const res = await fetch('/api/social/lastfm/scrobble', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as { ok: boolean; status?: LastFmStatus };
  } catch {
    return { ok: false };
  }
}

export async function checkAppUpdates(): Promise<UpdateCheckResult | null> {
  try {
    const res = await fetch('/api/updater/check');
    if (!res.ok) return null;
    return (await res.json()) as UpdateCheckResult;
  } catch {
    return null;
  }
}

export async function fetchUpdateDownloadProgress(): Promise<UpdateDownloadProgress | null> {
  try {
    const res = await fetch('/api/updater/progress');
    if (!res.ok) return null;
    return (await res.json()) as UpdateDownloadProgress;
  } catch {
    return null;
  }
}

export async function downloadAndInstallUpdate(
  downloadUrl: string,
  assetName: string,
  launch = true,
): Promise<{ ok: boolean; filePath?: string }> {
  const res = await fetch('/api/updater/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloadUrl, assetName, launch }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; filePath?: string; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Failed to download update');
  }
  return { ok: true, filePath: data.filePath };
}

export async function openReleaseUrl(url?: string): Promise<void> {
  try {
    await fetch('/api/updater/open-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    if (url) window.open(url, '_blank', 'noopener');
  }
}
