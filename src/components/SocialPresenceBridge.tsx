import React, { useEffect, useRef } from 'react';
import {
  clearDiscordPresenceApi,
  sendLastFmNowPlaying,
  sendLastFmScrobble,
  updateDiscordPresenceApi,
  type LastFmStatus,
} from '../api/social';
import { usePlaybackPositionMs } from '../hooks/playbackClock';
import type { Track } from '../types';

interface SocialPresenceBridgeProps {
  track: Track | null;
  isPlaying: boolean;
  durationMs: number;
  discordEnabled: boolean;
  discordClientId: string;
  lastFmEnabled: boolean;
  lastFmConnected: boolean;
  onLastFmStatusUpdate?: (status: LastFmStatus) => void;
}

interface ScrobbleSession {
  videoId: string;
  startedAtSec: number;
  accumulatedMs: number;
  lastPosMs: number;
  nowPlayingSent: boolean;
  scrobbled: boolean;
}

export const SocialPresenceBridge: React.FC<SocialPresenceBridgeProps> = React.memo(({
  track,
  isPlaying,
  durationMs,
  discordEnabled,
  discordClientId,
  lastFmEnabled,
  lastFmConnected,
  onLastFmStatusUpdate,
}) => {
  const positionMs = usePlaybackPositionMs();

  // Track scrobble state per song load
  const scrobbleRef = useRef<ScrobbleSession | null>(null);
  const discordSyncRef = useRef<{
    key: string;
    atMs: number;
    posMs: number;
  }>({ key: '', atMs: 0, posMs: 0 });

  // Reset scrobble accumulator on track change
  useEffect(() => {
    if (!track) {
      scrobbleRef.current = null;
      return;
    }
    scrobbleRef.current = {
      videoId: track.videoId,
      startedAtSec: Math.floor(Date.now() / 1000),
      accumulatedMs: 0,
      lastPosMs: 0,
      nowPlayingSent: false,
      scrobbled: false,
    };
  }, [track?.videoId]);

  // Immediate Discord RPC clear when disabled or no track
  useEffect(() => {
    if (!discordEnabled || !track) {
      discordSyncRef.current = { key: 'cleared', atMs: Date.now(), posMs: 0 };
      clearDiscordPresenceApi();
    }
  }, [discordEnabled, track?.videoId]);

  // Discord RPC sync on play/pause/track/seek or 15s keep-alive
  useEffect(() => {
    if (!discordEnabled || !track) return;
    const now = Date.now();
    const stateKey = `${track.videoId}|${isPlaying ? 1 : 0}|${discordClientId.trim()}`;
    const prev = discordSyncRef.current;
    const isStateChanged = prev.key !== stateKey;
    const jumpedSeek = Math.abs(positionMs - prev.posMs) > 4500 && now - prev.atMs > 1200;
    const periodicRefresh = isPlaying && now - prev.atMs >= 15_000;

    if (!isStateChanged && !jumpedSeek && !periodicRefresh) return;

    discordSyncRef.current = { key: stateKey, atMs: now, posMs: positionMs };
    updateDiscordPresenceApi({
      enabled: true,
      clientId: discordClientId,
      track,
      isPlaying,
      positionMs,
      durationMs: durationMs > 0 ? durationMs : track.durationMs,
    });
  }, [
    discordEnabled,
    discordClientId,
    track,
    isPlaying,
    durationMs,
    positionMs,
  ]);

  // Last.fm Now Playing + Scrobble (>= 50% of duration or >= 4 minutes, track >= 30s)
  useEffect(() => {
    if (!lastFmEnabled || !lastFmConnected || !track || !isPlaying) return;
    const s = scrobbleRef.current;
    if (!s || s.videoId !== track.videoId) return;

    const effDurationMs = durationMs > 0 ? durationMs : track.durationMs;
    const durationSec = Math.round((effDurationMs || 0) / 1000);

    if (!s.nowPlayingSent) {
      s.nowPlayingSent = true;
      sendLastFmNowPlaying({
        artist: track.artist,
        track: track.title,
        album: track.album,
        durationSec,
      });
    }

    const delta = positionMs - s.lastPosMs;
    if (delta > 0 && delta <= 2500) {
      s.accumulatedMs += delta;
    }
    s.lastPosMs = positionMs;

    if (!s.scrobbled && effDurationMs >= 30_000) {
      const thresholdMs = Math.min(240_000, effDurationMs * 0.5);
      if (s.accumulatedMs >= thresholdMs) {
        s.scrobbled = true;
        sendLastFmScrobble({
          artist: track.artist,
          track: track.title,
          album: track.album,
          durationSec,
          timestampSec: s.startedAtSec,
        }).then((res) => {
          if (res.status && onLastFmStatusUpdate) {
            onLastFmStatusUpdate(res.status);
          }
        });
      }
    }
  }, [
    lastFmEnabled,
    lastFmConnected,
    track,
    isPlaying,
    durationMs,
    positionMs,
    onLastFmStatusUpdate,
  ]);

  return null;
});
