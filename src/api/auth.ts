import type { Track } from '../types';

export interface AuthStatus {
  yt: {
    connected: boolean;
    accountName?: string;
    handle?: string;
    photoUrl?: string;
  };
  spotify: {
    connected: boolean;
    displayName?: string;
    photoUrl?: string;
  };
  nativeLoginAvailable: boolean;
}

export interface RemotePlaylistItem {
  id: string;
  title: string;
  subtitle: string;
  thumbnailUrl: string;
  url?: string;
}

export interface ImportedPlaylistResult {
  title: string;
  source: 'youtube' | 'spotify';
  totalSourceTracks?: number;
  tracks: Track[];
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export function fetchAuthStatus(): Promise<AuthStatus> {
  return apiJson<AuthStatus>('/api/auth/status');
}

export function loginYouTubeMusic(cookieHeader?: string): Promise<AuthStatus> {
  return apiJson<AuthStatus>('/api/auth/yt/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cookieHeader ? { cookieHeader } : {}),
  });
}

export function logoutYouTubeMusic(): Promise<AuthStatus> {
  return apiJson<AuthStatus>('/api/auth/yt/logout', { method: 'POST' });
}

export function loginSpotify(spdc?: string): Promise<AuthStatus> {
  return apiJson<AuthStatus>('/api/auth/spotify/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spdc ? { spdc } : {}),
  });
}

export function logoutSpotify(): Promise<AuthStatus> {
  return apiJson<AuthStatus>('/api/auth/spotify/logout', { method: 'POST' });
}

export async function fetchMyYtPlaylists(): Promise<RemotePlaylistItem[]> {
  const res = await apiJson<{ playlists: RemotePlaylistItem[] }>('/api/yt/my-playlists');
  return res.playlists;
}

export async function fetchMySpotifyPlaylists(): Promise<RemotePlaylistItem[]> {
  const res = await apiJson<{ playlists: RemotePlaylistItem[] }>('/api/spotify/my-playlists');
  return res.playlists;
}

export function importPlaylistByUrl(url: string): Promise<ImportedPlaylistResult> {
  return apiJson<ImportedPlaylistResult>('/api/import/playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}
