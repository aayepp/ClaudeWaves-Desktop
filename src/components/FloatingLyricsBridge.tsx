import React, { useEffect, useRef } from 'react';
import { controlFloatingLyrics } from '../api/extras';
import { usePlaybackPositionMs } from '../hooks/playbackClock';
import type { LyricLine, LyricsResult, Track } from '../types';

interface FloatingLyricsBridgeProps {
  track: Track | null;
  lyrics: LyricsResult;
  lyricsOffsetMs: number;
  autoRomanize?: boolean;
  isPlaying: boolean;
  accentHex: string;
}

export function resolveActiveLyricPair(
  track: Track | null,
  lyrics: LyricsResult,
  positionMs: number,
  lyricsOffsetMs: number,
  autoRomanize = true,
): { line: string; nextLine: string } {
  if (!track) {
    return { line: 'ClaudeWaves Floating Lyrics', nextLine: 'Play any song to sync live lyrics' };
  }
  if (lyrics.kind === 'loading') {
    return { line: track.title, nextLine: 'Loading synced lyrics...' };
  }
  if (lyrics.kind === 'instrumental') {
    return { line: 'Instrumental Track', nextLine: `${track.title} — ${track.artist}` };
  }
  if (lyrics.kind === 'plain') {
    const first = lyrics.text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return { line: first[0] || track.title, nextLine: first[1] || track.artist };
  }
  if (lyrics.kind !== 'synced' || lyrics.lines.length === 0) {
    return { line: track.title, nextLine: track.artist };
  }

  const lines: LyricLine[] = lyrics.lines;
  const effMs = positionMs + lyricsOffsetMs;
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= effMs) activeIdx = i;
    else break;
  }
  if (activeIdx < 0) {
    return {
      line: track.title,
      nextLine: (autoRomanize && lines[0]?.romanized) || lines[0]?.text || track.artist,
    };
  }
  const active = lines[activeIdx];
  return {
    line: active?.text || '• • •',
    nextLine: (autoRomanize && active?.romanized) || lines[activeIdx + 1]?.text || '',
  };
}

export const FloatingLyricsBridge: React.FC<FloatingLyricsBridgeProps> = React.memo(({
  track,
  lyrics,
  lyricsOffsetMs,
  autoRomanize = true,
  isPlaying,
  accentHex,
}) => {
  const positionMs = usePlaybackPositionMs();
  const lastKeyRef = useRef('');

  const { line, nextLine } = resolveActiveLyricPair(track, lyrics, positionMs, lyricsOffsetMs, autoRomanize);
  const title = track?.title ?? '';
  const artist = track?.artist ?? '';
  const key = `${track?.videoId ?? ''}|${line}|${nextLine}|${isPlaying}|${accentHex}`;

  useEffect(() => {
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    controlFloatingLyrics({
      action: 'update',
      state: { title, artist, line, nextLine, isPlaying, accentHex },
    });
  }, [key, title, artist, line, nextLine, isPlaying, accentHex]);

  return null;
});
