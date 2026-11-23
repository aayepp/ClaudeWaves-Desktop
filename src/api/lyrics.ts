import type { LyricLine, LyricsResult } from '../types';

export async function fetchSyncedLyrics(
  title: string,
  artist: string,
  durationMs: number,
): Promise<LyricsResult> {
  try {
    const qs = new URLSearchParams({
      title,
      artist,
      duration: String(Math.max(0, Math.round(durationMs))),
    });
    const res = await fetch(`/api/lyrics?${qs}`);
    if (!res.ok) return { kind: 'empty' };
    return (await res.json()) as LyricsResult;
  } catch {
    return { kind: 'empty' };
  }
}

export function hasNonLatinScript(lines: string[]): boolean {
  for (const line of lines) {
    for (const ch of line) {
      if (/\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch)) {
        return true;
      }
    }
  }
  return false;
}

export async function romanizeLyricsApi(
  trackId: string,
  lines: string[],
): Promise<Array<string | null> | null> {
  try {
    const res = await fetch('/api/lyrics/romanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId, lines }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      subLines?: Array<string | null>;
    };
    if (data.status === 'ok' && Array.isArray(data.subLines)) {
      return data.subLines;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Layer-3 Best Part fallback ported from ClaudeWaves Android BestPart.kt:
 * finds the first chorus by detecting substantive lyric lines repeated across
 * distinct sections (>= 20s apart), skipping the intro.
 */
export function detectLyricChorusMs(lines: LyricLine[]): number | null {
  if (lines.length < 6) return null;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

  const grouped = new Map<string, number[]>();
  for (const line of lines) {
    const key = norm(line.text);
    const words = key.split(' ').filter(Boolean);
    if (words.length < 3 && key.length < 10) continue;
    const arr = grouped.get(key) ?? [];
    arr.push(line.timeMs);
    grouped.set(key, arr);
  }

  let bestKey: string | null = null;
  let bestSections = 0;
  let bestTotal = 0;

  for (const [key, times] of grouped.entries()) {
    if (times.length < 2) continue;
    let sections = 1;
    let last = times[0];
    for (let i = 1; i < times.length; i++) {
      if (times[i] - last >= 20_000) {
        sections++;
        last = times[i];
      }
    }
    if (sections > bestSections || (sections === bestSections && times.length > bestTotal)) {
      bestSections = sections;
      bestTotal = times.length;
      bestKey = key;
    }
  }

  if (!bestKey || bestSections < 2) return null;
  const firstMs = grouped.get(bestKey)?.[0] ?? null;
  return firstMs != null ? Math.max(0, firstMs - 800) : null;
}
