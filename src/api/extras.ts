import type { AlbumPageData, ArtistPageData } from '../types';

export async function fetchArtistPage(name: string): Promise<ArtistPageData> {
  const res = await fetch(`/api/yt/artist?name=${encodeURIComponent(name)}`);
  const data = (await res.json()) as ArtistPageData & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error || `Artist HTTP ${res.status}`);
  return data;
}

export async function fetchAlbumPage(browseId: string): Promise<AlbumPageData> {
  const res = await fetch(`/api/yt/album?browseId=${encodeURIComponent(browseId)}`);
  const data = (await res.json()) as AlbumPageData & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error || `Album HTTP ${res.status}`);
  return data;
}

export async function fetchBestPartApi(
  videoId: string,
): Promise<{ bestPartMs: number | null; source: string | null }> {
  try {
    const res = await fetch(`/api/yt/best-part?videoId=${encodeURIComponent(videoId)}`);
    if (!res.ok) return { bestPartMs: null, source: null };
    return (await res.json()) as { bestPartMs: number | null; source: string | null };
  } catch {
    return { bestPartMs: null, source: null };
  }
}

export interface SponsorSegment {
  startSec: number;
  endSec: number;
  category: string;
}

export async function fetchSponsorBlockApi(videoId: string): Promise<SponsorSegment[]> {
  try {
    const res = await fetch(`/api/yt/sponsorblock?videoId=${encodeURIComponent(videoId)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { segments?: SponsorSegment[] };
    return Array.isArray(data.segments) ? data.segments : [];
  } catch {
    return [];
  }
}

export async function setMiniWindowMode(enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/window/mini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) return false;
    const d = (await res.json()) as { supported?: boolean };
    return Boolean(d.supported);
  } catch {
    return false;
  }
}

export async function updateDesktopConfig(cfg: {
  closeToTray?: boolean;
  globalMediaKeys?: boolean;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/desktop/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function setDesktopFullscreen(enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/desktop/fullscreen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncDesktopPlaybackState(payload: {
  isPlaying: boolean;
  hasTrack: boolean;
  title: string;
  artist: string;
}): Promise<void> {
  try {
    await fetch('/api/desktop/playback-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore outside Electron runtime
  }
}

export async function syncDesktopTitlebarTheme(payload: {
  isDark: boolean;
  bgHex?: string;
}): Promise<void> {
  try {
    await fetch('/api/desktop/titlebar-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore outside Electron runtime
  }
}

export async function showDesktopTrackToast(payload: {
  title: string;
  artist: string;
  thumbnailUrl?: string;
  accentHex?: string;
  isDark?: boolean;
  force?: boolean;
}): Promise<void> {
  try {
    await fetch('/api/desktop/toast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore outside Electron runtime
  }
}

export interface FloatingLyricsPayload {
  action: 'open' | 'close' | 'toggle' | 'lock' | 'unlock' | 'update';
  state?: {
    title: string;
    artist: string;
    line: string;
    nextLine: string;
    isPlaying: boolean;
    accentHex: string;
  };
}

export async function controlFloatingLyrics(
  payload: FloatingLyricsPayload,
): Promise<{ open: boolean; locked: boolean }> {
  try {
    const res = await fetch('/api/desktop/lyrics-overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { open: false, locked: false };
    const data = (await res.json()) as { open?: boolean; locked?: boolean };
    return { open: Boolean(data.open), locked: Boolean(data.locked) };
  } catch {
    return { open: false, locked: false };
  }
}

/** Extracts a vibrant accent hex color from an album cover URL via tiny 16x16 canvas. */
export function extractDominantHex(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 16, 16);
        const { data } = ctx.getImageData(0, 0, 16, 16);
        let bestScore = -1;
        let br = 128;
        let bg = 128;
        let bb = 128;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
          if (lum < 0.18 || lum > 0.88) continue;
          const score = sat * 2 + (1 - Math.abs(lum - 0.52));
          if (score > bestScore) {
            bestScore = score;
            br = r;
            bg = g;
            bb = b;
          }
        }
        if (bestScore < 0.35) return resolve(null);
        const hex = `#${[br, bg, bb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        resolve(hex);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/** Resizes a user-uploaded image File to a crisp 192x192 square JPEG DataURL. */
export function resizeProfileImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format'));
      img.onload = () => {
        const size = 192;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
