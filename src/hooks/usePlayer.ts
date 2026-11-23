import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBestPartApi,
  fetchSponsorBlockApi,
  type SponsorSegment,
} from '../api/extras';
import { detectLyricChorusMs, fetchSyncedLyrics } from '../api/lyrics';
import { getOfflineAudioUrl } from '../api/offline';
import { fetchUpNextRadio, resolveTrackStream } from '../api/youtube';
import { combineEqWithAutoEq } from '../data/autoeq';
import { getPlaybackPositionMs, setPlaybackPositionMs } from './playbackClock';
import {
  EQ_FREQUENCIES,
  type BestPartInfo,
  type LyricsResult,
  type RepeatMode,
  type SavedPlaybackState,
  type Track,
} from '../types';

export interface PlayerDspOptions {
  volumeNormalizer: boolean;
  spatialAudio: boolean;
  autoEqProfile: string;
  sponsorBlockEnabled: boolean;
  offlineMode: boolean;
  offlineIds: Set<string>;
  onSponsorSkip?: (category: string) => void;
}

const DEFAULT_DSP_OPTIONS: PlayerDspOptions = {
  volumeNormalizer: false,
  spatialAudio: false,
  autoEqProfile: 'Off',
  sponsorBlockEnabled: true,
  offlineMode: false,
  offlineIds: new Set(),
};

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  durationMs: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  streamInfo: string | null;
  error: string | null;
  lyrics: LyricsResult;
  bestPart: BestPartInfo | null;
  sleepRemainingSec: number | null;
}

export function usePlayer(
  volume: number,
  eqGains: number[],
  playbackRate: number,
  crossfadeSec: number,
  autoRadio: boolean,
  onTrackStart: (track: Track) => void,
  dspOptions?: PlayerDspOptions,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const spatialWetGainRef = useRef<GainNode | null>(null);
  const normalizerRef = useRef<DynamicsCompressorNode | null>(null);
  const normMakeupGainRef = useRef<GainNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const requestTokenRef = useRef(0);
  const needsResolveRef = useRef(false);
  const pendingSeekMsRef = useRef<number | null>(null);
  const initialSeekLockRef = useRef(false);
  const crossfadeRef = useRef(crossfadeSec);
  crossfadeRef.current = crossfadeSec;
  const dspRef = useRef<PlayerDspOptions>(dspOptions ?? DEFAULT_DSP_OPTIONS);
  dspRef.current = dspOptions ?? DEFAULT_DSP_OPTIONS;
  const sponsorSegmentsRef = useRef<SponsorSegment[]>([]);
  const skippedSponsorKeysRef = useRef<Set<string>>(new Set());

  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    isBuffering: false,
    durationMs: 0,
    shuffle: false,
    repeatMode: 'off',
    streamInfo: null,
    error: null,
    lyrics: { kind: 'idle' },
    bestPart: null,
    sleepRemainingSec: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;
  const eqGainsRef = useRef(eqGains);
  eqGainsRef.current = eqGains;

  // Lazy-connect Web Audio 10-band EQ + AutoEQ + Spatial 3D + Normalizer + Safety Limiter + AnalyserNode
  const ensureAudioGraph = useCallback(() => {
    const el = audioRef.current;
    if (!el || audioCtxRef.current) {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return;
    }
    try {
      let ctx: AudioContext;
      try {
        ctx = new AudioContext({ latencyHint: 'playback' });
      } catch {
        ctx = new AudioContext();
      }
      const source = ctx.createMediaElementSource(el);
      const combinedGains = combineEqWithAutoEq(
        eqGainsRef.current,
        dspRef.current.autoEqProfile,
      );
      const filters = EQ_FREQUENCIES.map((freq, idx) => {
        const f = ctx.createBiquadFilter();
        f.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        f.frequency.value = freq;
        f.Q.value = 1.1;
        f.gain.value = combinedGains[idx] ?? 0;
        return f;
      });

      const dryGain = ctx.createGain();
      dryGain.gain.value = 1;

      const splitter = ctx.createChannelSplitter(2);
      const delayL = ctx.createDelay(0.1);
      delayL.delayTime.value = 0.014;
      const delayR = ctx.createDelay(0.1);
      delayR.delayTime.value = 0.019;
      const merger = ctx.createChannelMerger(2);
      const wetFilter = ctx.createBiquadFilter();
      wetFilter.type = 'highpass';
      wetFilter.frequency.value = 260;
      const wetGain = ctx.createGain();
      wetGain.gain.value = dspRef.current.spatialAudio ? 0.34 : 0;

      const normSum = ctx.createGain();
      normSum.gain.value = 1;

      const normalizer = ctx.createDynamicsCompressor();
      if (dspRef.current.volumeNormalizer) {
        normalizer.threshold.value = -18;
        normalizer.knee.value = 18;
        normalizer.ratio.value = 4;
        normalizer.attack.value = 0.008;
        normalizer.release.value = 0.18;
      } else {
        normalizer.threshold.value = 0;
        normalizer.knee.value = 0;
        normalizer.ratio.value = 1;
        normalizer.attack.value = 0.01;
        normalizer.release.value = 0.1;
      }
      const normMakeup = ctx.createGain();
      normMakeup.gain.value = dspRef.current.volumeNormalizer ? 1.32 : 1;

      const safetyLimiter = ctx.createDynamicsCompressor();
      safetyLimiter.threshold.value = -1;
      safetyLimiter.knee.value = 0;
      safetyLimiter.ratio.value = 20;
      safetyLimiter.attack.value = 0.002;
      safetyLimiter.release.value = 0.05;

      const gainNode = ctx.createGain();
      gainNode.gain.value = 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;

      let node: AudioNode = source;
      for (const f of filters) {
        node.connect(f);
        node = f;
      }

      node.connect(dryGain);
      dryGain.connect(normSum);

      node.connect(splitter);
      splitter.connect(delayL, 0);
      splitter.connect(delayR, 1);
      delayL.connect(merger, 0, 1);
      delayR.connect(merger, 0, 0);
      merger.connect(wetFilter);
      wetFilter.connect(wetGain);
      wetGain.connect(normSum);

      normSum.connect(normalizer);
      normalizer.connect(normMakeup);
      normMakeup.connect(safetyLimiter);
      safetyLimiter.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      eqFiltersRef.current = filters;
      spatialWetGainRef.current = wetGain;
      normalizerRef.current = normalizer;
      normMakeupGainRef.current = normMakeup;
      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;
    } catch {
      // Fallback gracefully to direct HTMLAudio output
    }
  }, []);

  // Single HTMLAudioElement setup
  useEffect(() => {
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.preservesPitch = true;
    audioRef.current = el;

    const onTime = () => {
      if (initialSeekLockRef.current) return;
      setPlaybackPositionMs(Math.floor((el.currentTime || 0) * 1000));
      if (Number.isFinite(el.duration) && el.duration > 0) {
        const nextDur = Math.floor(el.duration * 1000);
        setState((prev) => (Math.abs(prev.durationMs - nextDur) >= 500 ? { ...prev, durationMs: nextDur } : prev));
      }
    };
    const onPlay = () => setState((prev) => ({ ...prev, isPlaying: true, isBuffering: false }));
    const onPlaying = () => {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      setState((prev) => (prev.isBuffering ? { ...prev, isBuffering: false } : prev));
    };
    const onPause = () => setState((prev) => ({ ...prev, isPlaying: false }));
    const onWaiting = () => setState((prev) => ({ ...prev, isBuffering: true }));
    const onCanPlay = () => setState((prev) => ({ ...prev, isBuffering: false }));
    const onEnded = () => {
      const cur = stateRef.current;
      if (cur.repeatMode === 'one') {
        el.currentTime = 0;
        el.play().catch(() => {});
        return;
      }
      if (cur.queue.length === 0) return;
      let nextIdx = -1;
      if (cur.shuffle && cur.queue.length > 1) {
        const candidates = cur.queue.map((_, i) => i).filter((i) => i !== cur.currentIndex);
        nextIdx = candidates[Math.floor(Math.random() * candidates.length)] ?? -1;
      } else if (cur.currentIndex + 1 < cur.queue.length) {
        nextIdx = cur.currentIndex + 1;
      } else if (cur.repeatMode === 'all') {
        nextIdx = 0;
      }
      if (nextIdx >= 0) {
        startAtIndexRef.current(nextIdx, cur.queue);
      }
    };
    const onError = () => {
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        isBuffering: false,
        error: 'Audio playback error — try another track or refresh stream.',
      }));
    };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    return () => {
      el.pause();
      el.src = '';
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Smooth 30fps external clock tick while playing (zero root React re-renders) + Crossfade fade-out + SponsorBlock skip
  useEffect(() => {
    if (!state.isPlaying) return;
    const id = window.setInterval(() => {
      const el = audioRef.current;
      if (!el || el.paused || initialSeekLockRef.current) return;
      const curSec = el.currentTime || 0;
      const ms = Math.floor(curSec * 1000);
      if (Math.abs(getPlaybackPositionMs() - ms) >= 24) {
        setPlaybackPositionMs(ms);
      }

      if (dspRef.current.sponsorBlockEnabled && sponsorSegmentsRef.current.length > 0) {
        for (const seg of sponsorSegmentsRef.current) {
          const key = `${seg.startSec.toFixed(2)}-${seg.endSec.toFixed(2)}`;
          if (skippedSponsorKeysRef.current.has(key)) continue;
          if (curSec >= seg.startSec && curSec < seg.endSec - 0.6) {
            skippedSponsorKeysRef.current.add(key);
            if (Number.isFinite(el.duration) && seg.endSec >= el.duration - 1.2) {
              el.currentTime = Math.max(0, el.duration - 0.15);
            } else {
              el.currentTime = seg.endSec;
              setPlaybackPositionMs(Math.floor(seg.endSec * 1000));
            }
            dspRef.current.onSponsorSkip?.(seg.category);
            break;
          }
        }
      }

      const cf = crossfadeRef.current;
      const gNode = gainNodeRef.current;
      const ctx = audioCtxRef.current;
      if (cf > 0 && gNode && ctx && Number.isFinite(el.duration) && el.duration > cf + 2) {
        const remaining = el.duration - el.currentTime;
        if (remaining > 0 && remaining <= cf) {
          const level = Math.max(0.05, remaining / cf);
          gNode.gain.setTargetAtTime(level, ctx.currentTime, 0.08);
        } else if (gNode.gain.value < 0.99) {
          gNode.gain.setTargetAtTime(1, ctx.currentTime, 0.06);
        }
      }
    }, 33);
    return () => window.clearInterval(id);
  }, [state.isPlaying]);

  // Apply volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
    }
  }, [volume]);

  // Apply playback rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = Math.max(0.5, Math.min(2, playbackRate || 1));
    }
  }, [playbackRate]);

  // Apply 10-band EQ + AutoEQ compensation live
  const autoEqProfile = dspOptions?.autoEqProfile ?? 'Off';
  useEffect(() => {
    const combined = combineEqWithAutoEq(eqGains, autoEqProfile);
    const t = audioCtxRef.current?.currentTime ?? 0;
    eqFiltersRef.current.forEach((filter, idx) => {
      filter.gain.setTargetAtTime(combined[idx] ?? 0, t, 0.025);
    });
  }, [eqGains, autoEqProfile]);

  // Apply Spatial 3D & Volume Normalizer live
  const spatialEnabled = dspOptions?.spatialAudio ?? false;
  useEffect(() => {
    const wet = spatialWetGainRef.current;
    const ctx = audioCtxRef.current;
    if (wet && ctx) {
      wet.gain.setTargetAtTime(spatialEnabled ? 0.34 : 0, ctx.currentTime, 0.04);
    }
  }, [spatialEnabled]);

  const normalizerEnabled = dspOptions?.volumeNormalizer ?? false;
  useEffect(() => {
    const norm = normalizerRef.current;
    const makeup = normMakeupGainRef.current;
    const ctx = audioCtxRef.current;
    if (norm && makeup && ctx) {
      const t = ctx.currentTime;
      norm.threshold.setTargetAtTime(normalizerEnabled ? -18 : 0, t, 0.03);
      norm.knee.setTargetAtTime(normalizerEnabled ? 18 : 0, t, 0.03);
      norm.ratio.setTargetAtTime(normalizerEnabled ? 4 : 1, t, 0.03);
      makeup.gain.setTargetAtTime(normalizerEnabled ? 1.32 : 1, t, 0.04);
    }
  }, [normalizerEnabled]);

  // Sleep Timer countdown
  useEffect(() => {
    if (state.sleepRemainingSec === null) return;
    if (state.sleepRemainingSec <= 0) {
      audioRef.current?.pause();
      setState((prev) => ({ ...prev, sleepRemainingSec: null }));
      return;
    }
    const t = window.setTimeout(() => {
      setState((prev) =>
        prev.sleepRemainingSec === null
          ? prev
          : { ...prev, sleepRemainingSec: Math.max(0, prev.sleepRemainingSec - 1) },
      );
    }, 1000);
    return () => window.clearTimeout(t);
  }, [state.sleepRemainingSec]);

  const setSleepTimer = useCallback((minutes: number | null) => {
    setState((prev) => ({
      ...prev,
      sleepRemainingSec: minutes && minutes > 0 ? Math.round(minutes * 60) : null,
    }));
  }, []);

  const loadTrackMeta = useCallback((track: Track, token: number) => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album ?? 'ClaudeWaves Desktop',
        artwork: [{ src: track.thumbnailUrl, sizes: '544x544', type: 'image/jpeg' }],
      });
    }

    if (dspRef.current.offlineMode) {
      setState((prev) => ({ ...prev, lyrics: { kind: 'empty' } }));
      return;
    }

    fetchSyncedLyrics(track.title, track.artist, track.durationMs).then((lyrics) => {
      if (requestTokenRef.current !== token) return;
      setState((prev) => {
        let bestPart = prev.bestPart;
        if (!bestPart && lyrics.kind === 'synced') {
          const chorusMs = detectLyricChorusMs(lyrics.lines);
          if (chorusMs != null) {
            bestPart = { timeMs: chorusMs, source: 'Chorus' };
          }
        }
        return { ...prev, lyrics, bestPart };
      });
    });

    fetchBestPartApi(track.videoId).then(({ bestPartMs, source }) => {
      if (requestTokenRef.current !== token) return;
      if (bestPartMs != null) {
        setState((prev) => ({
          ...prev,
          bestPart: { timeMs: bestPartMs, source: source || 'Best Part' },
        }));
      }
    });

    if (dspRef.current.sponsorBlockEnabled) {
      fetchSponsorBlockApi(track.videoId).then((segments) => {
        if (requestTokenRef.current !== token) return;
        sponsorSegmentsRef.current = segments;
      });
    }
  }, []);

  const startAtIndex = useCallback(
    async (index: number, queueOverride?: Track[], initialSeekMs = 0) => {
      const queue = queueOverride ?? stateRef.current.queue;
      const track = queue[index];
      if (!track) return;

      const token = ++requestTokenRef.current;
      const resumeSeekMs = Math.max(0, Math.round(initialSeekMs || 0));
      needsResolveRef.current = false;
      pendingSeekMsRef.current = null;
      initialSeekLockRef.current = resumeSeekMs > 0;
      sponsorSegmentsRef.current = [];
      skippedSponsorKeysRef.current.clear();
      setPlaybackPositionMs(resumeSeekMs);
      onTrackStart(track);

      setState((prev) => ({
        ...prev,
        queue,
        currentIndex: index,
        currentTrack: track,
        durationMs: track.durationMs,
        isBuffering: true,
        error: null,
        streamInfo: null,
        lyrics: { kind: 'loading' },
        bestPart: null,
      }));

      loadTrackMeta(track, token);

      try {
        const isOfflineSaved = dspRef.current.offlineIds.has(track.videoId);
        if (!isOfflineSaved && dspRef.current.offlineMode) {
          throw new Error('Offline Mode aktif — lagu ini belum dimuat turun.');
        }

        const resolved = isOfflineSaved ? null : await resolveTrackStream(track.videoId);
        if (requestTokenRef.current !== token) {
          initialSeekLockRef.current = false;
          return;
        }
        const audio = audioRef.current;
        if (!audio) {
          initialSeekLockRef.current = false;
          return;
        }

        ensureAudioGraph();
        const playableUrl = isOfflineSaved
          ? getOfflineAudioUrl(track.videoId)
          : (resolved!.proxyUrl ?? resolved!.url);
        audio.src = playableUrl;
        audio.playbackRate = Math.max(0.5, Math.min(2, playbackRate || 1));

        const applyInitialSeek = () => {
          if (requestTokenRef.current !== token) return;
          if (resumeSeekMs > 0) {
            try {
              const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
              audio.currentTime = Math.min(resumeSeekMs / 1000, Math.max(0, dur - 0.5));
            } catch {
              // Ignore seek errors before metadata is ready
            }
          }
          initialSeekLockRef.current = false;
        };

        if (resumeSeekMs > 0) {
          audio.addEventListener('loadedmetadata', applyInitialSeek, { once: true });
        }
        audio.load();
        if (resumeSeekMs > 0 && audio.readyState >= 1) {
          applyInitialSeek();
        }

        setState((prev) => ({
          ...prev,
          streamInfo: isOfflineSaved
            ? 'Offline Local • Saved Audio'
            : `${resolved!.source} • ${resolved!.mimeType.split('/')[1] ?? 'audio'} • ${resolved!.bitrateKbps} kbps`,
        }));
        await audio.play();
        if (resumeSeekMs > 0 && initialSeekLockRef.current) {
          applyInitialSeek();
        }
        // Smooth Crossfade fade-in when enabled
        const gNode = gainNodeRef.current;
        const ctx = audioCtxRef.current;
        const cf = crossfadeRef.current;
        if (gNode && ctx && cf > 0) {
          const now = ctx.currentTime;
          gNode.gain.cancelScheduledValues(now);
          gNode.gain.setValueAtTime(0.05, now);
          gNode.gain.linearRampToValueAtTime(1, now + Math.min(cf, 3));
        } else if (gNode && ctx) {
          gNode.gain.setValueAtTime(1, ctx.currentTime);
        }
      } catch (err) {
        initialSeekLockRef.current = false;
        if (requestTokenRef.current !== token) return;
        const msg = err instanceof Error ? err.message : 'Failed to resolve stream';
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          isBuffering: false,
          error: msg,
        }));
      }
    },
    [ensureAudioGraph, loadTrackMeta, onTrackStart, playbackRate],
  );

  const restoreSession = useCallback(
    (saved: SavedPlaybackState) => {
      if (!saved?.currentTrack || stateRef.current.currentTrack) return;
      let queue = Array.isArray(saved.queue) && saved.queue.length > 0 ? saved.queue : [saved.currentTrack];
      let idx = typeof saved.currentIndex === 'number' ? saved.currentIndex : 0;
      if (idx < 0 || idx >= queue.length || queue[idx]?.videoId !== saved.currentTrack.videoId) {
        const found = queue.findIndex((t) => t.videoId === saved.currentTrack.videoId);
        if (found >= 0) idx = found;
        else {
          queue = [saved.currentTrack, ...queue];
          idx = 0;
        }
      }
      const track = queue[idx];
      const seekMs = Math.max(0, Math.round(saved.positionMs || 0));
      const token = ++requestTokenRef.current;
      needsResolveRef.current = true;
      pendingSeekMsRef.current = seekMs;
      initialSeekLockRef.current = false;
      setPlaybackPositionMs(seekMs);

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        queue,
        currentIndex: idx,
        isPlaying: false,
        isBuffering: false,
        durationMs: saved.durationMs || track.durationMs || prev.durationMs,
        shuffle: Boolean(saved.shuffle),
        repeatMode: saved.repeatMode ?? 'off',
        streamInfo: null,
        error: null,
        lyrics: { kind: 'loading' },
        bestPart: null,
      }));

      loadTrackMeta(track, token);
    },
    [loadTrackMeta],
  );

  const startAtIndexRef = useRef(startAtIndex);
  startAtIndexRef.current = startAtIndex;

  const playTrack = useCallback(
    (
      track: Track,
      contextList: Track[] = [],
      opts?: { repeatMode?: RepeatMode; skipRadio?: boolean; shuffle?: boolean },
    ) => {
      const hasTrack = contextList.some((t) => t.videoId === track.videoId);
      const queue = hasTrack
        ? contextList
        : [track, ...contextList.filter((t) => t.videoId !== track.videoId)];
      const idx = Math.max(
        0,
        queue.findIndex((t) => t.videoId === track.videoId),
      );
      startAtIndex(idx, queue);

      if (opts?.repeatMode !== undefined || opts?.shuffle !== undefined) {
        setState((prev) => ({
          ...prev,
          ...(opts.repeatMode !== undefined ? { repeatMode: opts.repeatMode } : {}),
          ...(opts.shuffle !== undefined ? { shuffle: opts.shuffle } : {}),
        }));
      }

      if (
        autoRadio &&
        !opts?.skipRadio &&
        opts?.repeatMode !== 'all' &&
        stateRef.current.repeatMode !== 'all' &&
        queue.length <= 2
      ) {
        fetchUpNextRadio(track.videoId)
          .then((radio) => {
            if (!radio.length) return;
            setState((prev) => {
              const ids = new Set(prev.queue.map((t) => t.videoId));
              const fresh = radio.filter((t) => !ids.has(t.videoId));
              return { ...prev, queue: [...prev.queue, ...fresh] };
            });
          })
          .catch(() => {});
      }
    },
    [autoRadio, startAtIndex],
  );

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    const cur = stateRef.current;
    if (!audio || !cur.currentTrack) return;
    if (needsResolveRef.current) {
      const seekMs = pendingSeekMsRef.current ?? getPlaybackPositionMs();
      startAtIndex(Math.max(0, cur.currentIndex), cur.queue, seekMs);
      return;
    }
    ensureAudioGraph();
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [ensureAudioGraph, startAtIndex]);

  const seekTo = useCallback((ms: number) => {
    const clamped = Math.max(0, ms);
    setPlaybackPositionMs(clamped);
    if (crossfadeRef.current > 0 && gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(1, audioCtxRef.current.currentTime, 0.05);
    }
    if (needsResolveRef.current) {
      pendingSeekMsRef.current = clamped;
      return;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = clamped / 1000;
    }
  }, []);

  const jumpToBestPart = useCallback((): BestPartInfo | null => {
    const cur = stateRef.current;
    if (!cur.currentTrack) return null;
    if (cur.bestPart) {
      seekTo(cur.bestPart.timeMs);
      return cur.bestPart;
    }
    const fallbackMs = Math.round((cur.durationMs || cur.currentTrack.durationMs || 180_000) * 0.3);
    seekTo(fallbackMs);
    return { timeMs: fallbackMs, source: 'Hook' };
  }, [seekTo]);

  const next = useCallback(() => {
    const cur = stateRef.current;
    if (cur.queue.length === 0) return;
    let nextIdx = -1;
    if (cur.shuffle && cur.queue.length > 1) {
      const pool = cur.queue.map((_, i) => i).filter((i) => i !== cur.currentIndex);
      nextIdx = pool[Math.floor(Math.random() * pool.length)] ?? 0;
    } else if (cur.currentIndex + 1 < cur.queue.length) {
      nextIdx = cur.currentIndex + 1;
    } else if (cur.repeatMode === 'all') {
      nextIdx = 0;
    }
    if (nextIdx >= 0) startAtIndex(nextIdx);
  }, [startAtIndex]);

  const previous = useCallback(() => {
    const cur = stateRef.current;
    if (cur.queue.length === 0) return;
    if (getPlaybackPositionMs() > 4000) {
      seekTo(0);
      return;
    }
    startAtIndex(Math.max(0, cur.currentIndex - 1));
  }, [seekTo, startAtIndex]);

  const addToQueue = useCallback(
    (track: Track) => {
      const empty = stateRef.current.queue.length === 0;
      setState((prev) => ({ ...prev, queue: [...prev.queue, track] }));
      if (empty) startAtIndex(0, [track]);
    },
    [startAtIndex],
  );

  const removeFromQueue = useCallback((index: number) => {
    setState((prev) => {
      if (index === prev.currentIndex || index < 0 || index >= prev.queue.length) return prev;
      const queue = prev.queue.filter((_, i) => i !== index);
      const currentIndex = index < prev.currentIndex ? prev.currentIndex - 1 : prev.currentIndex;
      return { ...prev, queue, currentIndex };
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setState((prev) => ({ ...prev, shuffle: !prev.shuffle }));
  }, []);

  const cycleRepeat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      repeatMode: prev.repeatMode === 'off' ? 'all' : prev.repeatMode === 'all' ? 'one' : 'off',
    }));
  }, []);

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    setState((prev) => (prev.repeatMode === mode ? prev : { ...prev, repeatMode: mode }));
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => {
      if (!stateRef.current.isPlaying) togglePlayPause();
    });
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') seekTo(details.seekTime * 1000);
    });
  }, [next, previous, seekTo, togglePlayPause]);

  return {
    state,
    analyserRef,
    playTrack,
    playAtIndex: startAtIndex,
    restoreSession,
    togglePlayPause,
    seekTo,
    jumpToBestPart,
    setSleepTimer,
    next,
    previous,
    addToQueue,
    removeFromQueue,
    toggleShuffle,
    cycleRepeat,
    setRepeatMode,
  };
}
