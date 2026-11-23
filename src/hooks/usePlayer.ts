import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBestPartApi,
  fetchSponsorBlockApi,
  type SponsorSegment,
} from '../api/extras';
import {
  detectLyricChorusMs,
  fetchSyncedLyrics,
  hasNonLatinScript,
  romanizeLyricsApi,
  translateLyricsApi,
} from '../api/lyrics';
import { getOfflineAudioUrl } from '../api/offline';
import { fetchUpNextRadio, resolveTrackStream } from '../api/youtube';
import { combineEqWithAutoEq } from '../data/autoeq';
import { getPlaybackPositionMs, setPlaybackPositionMs } from './playbackClock';
import {
  EQ_FREQUENCIES,
  type BestPartInfo,
  type LyricsResult,
  type LyricsTranslateLang,
  type RepeatMode,
  type SavedPlaybackState,
  type Track,
} from '../types';

export interface AudioOutputDeviceInfo {
  deviceId: string;
  label: string;
}

export interface PlayerDspOptions {
  volumeNormalizer: boolean;
  spatialAudio: boolean;
  autoEqProfile: string;
  sponsorBlockEnabled: boolean;
  offlineMode: boolean;
  offlineIds: Set<string>;
  audioOutputDeviceId: string;
  smartFadePlayPause: boolean;
  autoPauseOnDeviceDisconnect: boolean;
  pitchSemitones: number;
  reverbMix: number;
  lyricsTranslateLang: LyricsTranslateLang;
  onSponsorSkip?: (category: string) => void;
  onDeviceDisconnected?: () => void;
}

const DEFAULT_DSP_OPTIONS: PlayerDspOptions = {
  volumeNormalizer: false,
  spatialAudio: false,
  autoEqProfile: 'Off',
  sponsorBlockEnabled: true,
  offlineMode: false,
  offlineIds: new Set(),
  audioOutputDeviceId: '',
  smartFadePlayPause: true,
  autoPauseOnDeviceDisconnect: true,
  pitchSemitones: 0,
  reverbMix: 0,
  lyricsTranslateLang: 'off',
};

function createReverbImpulse(ctx: AudioContext, durationSec = 2.4, decay = 2.6): AudioBuffer {
  const sampleRate = Math.max(8000, ctx.sampleRate || 48000);
  const length = Math.round(sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

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
  abLoop: { aMs: number | null; bMs: number | null };
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
  const reverbDryGainRef = useRef<GainNode | null>(null);
  const reverbWetGainRef = useRef<GainNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const fadeGainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pauseFadeTimerRef = useRef<number | null>(null);
  const knownOutputIdsRef = useRef<Set<string> | null>(null);
  const translatedTrackKeyRef = useRef<string>('');
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

  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioOutputDeviceInfo[]>([]);
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
    abLoop: { aMs: null, bMs: null },
  });

  const stateRef = useRef(state);
  stateRef.current = state;
  const abLoopRef = useRef(state.abLoop);
  abLoopRef.current = state.abLoop;
  const eqGainsRef = useRef(eqGains);
  eqGainsRef.current = eqGains;

  const applyOutputDevice = useCallback((deviceId: string) => {
    const id = deviceId || '';
    const ctx = audioCtxRef.current as (AudioContext & { setSinkId?: (sink: string) => Promise<void> }) | null;
    if (ctx?.setSinkId) {
      ctx.setSinkId(id).catch(() => {});
    }
    const el = audioRef.current as (HTMLAudioElement & { setSinkId?: (sink: string) => Promise<void> }) | null;
    if (el?.setSinkId) {
      el.setSinkId(id).catch(() => {});
    }
  }, []);

  const refreshOutputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(
        (d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications',
      );
      const formatted: AudioOutputDeviceInfo[] = outputs.map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label.trim() || `Audio Output ${idx + 1}`,
      }));
      setAudioOutputDevices(formatted);
      const nextIds = new Set(formatted.map((d) => d.deviceId));
      const prevIds = knownOutputIdsRef.current;
      knownOutputIdsRef.current = nextIds;

      if (prevIds) {
        const selectedId = dspRef.current.audioOutputDeviceId;
        const selectedLost = Boolean(selectedId && !nextIds.has(selectedId));
        let removedPhysical = false;
        for (const oldId of prevIds) {
          if (!nextIds.has(oldId)) {
            removedPhysical = true;
            break;
          }
        }
        if ((selectedLost || removedPhysical) && dspRef.current.autoPauseOnDeviceDisconnect && stateRef.current.isPlaying) {
          if (pauseFadeTimerRef.current !== null) {
            window.clearTimeout(pauseFadeTimerRef.current);
            pauseFadeTimerRef.current = null;
          }
          audioRef.current?.pause();
          const fNode = fadeGainNodeRef.current;
          const ctx = audioCtxRef.current;
          if (fNode && ctx) {
            fNode.gain.cancelScheduledValues(ctx.currentTime);
            fNode.gain.setValueAtTime(1, ctx.currentTime);
          }
          dspRef.current.onDeviceDisconnected?.();
        }
      }
    } catch {
      // Ignore device enumeration failure
    }
  }, []);

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

      const reverbDryGain = ctx.createGain();
      const reverbWetGain = ctx.createGain();
      const mix = Math.max(0, Math.min(1, dspRef.current.reverbMix || 0));
      reverbDryGain.gain.value = 1 - mix * 0.22;
      reverbWetGain.gain.value = mix * 0.62;
      const convolver = ctx.createConvolver();
      convolver.buffer = createReverbImpulse(ctx);
      const reverbOut = ctx.createGain();
      reverbOut.gain.value = 1;

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
      const fadeGainNode = ctx.createGain();
      fadeGainNode.gain.value = 1;
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

      normSum.connect(reverbDryGain);
      reverbDryGain.connect(reverbOut);
      normSum.connect(convolver);
      convolver.connect(reverbWetGain);
      reverbWetGain.connect(reverbOut);

      reverbOut.connect(normalizer);
      normalizer.connect(normMakeup);
      normMakeup.connect(safetyLimiter);
      safetyLimiter.connect(gainNode);
      gainNode.connect(fadeGainNode);
      fadeGainNode.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      eqFiltersRef.current = filters;
      spatialWetGainRef.current = wetGain;
      reverbDryGainRef.current = reverbDryGain;
      reverbWetGainRef.current = reverbWetGain;
      normalizerRef.current = normalizer;
      normMakeupGainRef.current = normMakeup;
      gainNodeRef.current = gainNode;
      fadeGainNodeRef.current = fadeGainNode;
      analyserRef.current = analyser;
      applyOutputDevice(dspRef.current.audioOutputDeviceId);
    } catch {
      // Fallback gracefully to direct HTMLAudio output
    }
  }, [applyOutputDevice]);

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

    refreshOutputDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshOutputDevices);

    return () => {
      if (pauseFadeTimerRef.current !== null) {
        window.clearTimeout(pauseFadeTimerRef.current);
        pauseFadeTimerRef.current = null;
      }
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshOutputDevices);
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
  }, [refreshOutputDevices]);

  // Smooth 30fps external clock tick while playing (zero root React re-renders) + A-B loop + Crossfade fade-out + SponsorBlock skip
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

      const loop = abLoopRef.current;
      if (loop.aMs !== null && loop.bMs !== null && loop.bMs > loop.aMs + 400 && ms >= loop.bMs) {
        el.currentTime = loop.aMs / 1000;
        setPlaybackPositionMs(loop.aMs);
        return;
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

  // Apply playback rate + pitch shift (semitones)
  const pitchSemitones = dspOptions?.pitchSemitones ?? 0;
  useEffect(() => {
    const el = audioRef.current as (HTMLAudioElement & { webkitPreservesPitch?: boolean }) | null;
    if (el) {
      const pitchFactor = Math.pow(2, (pitchSemitones || 0) / 12);
      const effectiveRate = Math.max(0.5, Math.min(2, (playbackRate || 1) * pitchFactor));
      const preserve = (pitchSemitones || 0) === 0;
      el.preservesPitch = preserve;
      el.webkitPreservesPitch = preserve;
      el.playbackRate = effectiveRate;
    }
  }, [playbackRate, pitchSemitones]);

  // Apply Audio Output device cleanly
  const selectedOutputId = dspOptions?.audioOutputDeviceId ?? '';
  useEffect(() => {
    applyOutputDevice(selectedOutputId);
  }, [selectedOutputId, applyOutputDevice]);

  // Apply Reverb dry/wet mix live
  const reverbMixVal = dspOptions?.reverbMix ?? 0;
  useEffect(() => {
    const dry = reverbDryGainRef.current;
    const wet = reverbWetGainRef.current;
    const ctx = audioCtxRef.current;
    if (dry && wet && ctx) {
      const mix = Math.max(0, Math.min(1, reverbMixVal || 0));
      dry.gain.setTargetAtTime(1 - mix * 0.22, ctx.currentTime, 0.04);
      wet.gain.setTargetAtTime(mix * 0.62, ctx.currentTime, 0.04);
    }
  }, [reverbMixVal]);

  // Dual-language Lyric Translation enrichment (BM / EN)
  const translateLang = dspOptions?.lyricsTranslateLang ?? 'off';
  const curVideoIdForTrans = state.currentTrack?.videoId ?? '';
  const curLyricsKindForTrans = state.lyrics.kind;
  useEffect(() => {
    if (translateLang === 'off' || !curVideoIdForTrans) return;
    const curLyrics = stateRef.current.lyrics;
    if (curLyrics.kind !== 'synced' && curLyrics.kind !== 'plain') return;

    const rawLines =
      curLyrics.kind === 'synced'
        ? curLyrics.lines.map((l) => l.text)
        : curLyrics.text.split(/\r?\n/);
    if (rawLines.length === 0) return;

    const key = `${curVideoIdForTrans}|${translateLang}|${curLyrics.kind}|${rawLines.length}`;
    if (translatedTrackKeyRef.current === key) return;
    translatedTrackKeyRef.current = key;
    const capturedToken = requestTokenRef.current;
    let cancelled = false;

    translateLyricsApi(curVideoIdForTrans, rawLines, translateLang).then((subLines) => {
      if (cancelled || !subLines || requestTokenRef.current !== capturedToken) return;
      setState((prev) => {
        if (prev.currentTrack?.videoId !== curVideoIdForTrans) return prev;
        if (prev.lyrics.kind === 'synced') {
          const enriched = prev.lyrics.lines.map((ln, idx) => ({
            ...ln,
            ...(subLines[idx] ? { translated: subLines[idx]! } : {}),
          }));
          return { ...prev, lyrics: { ...prev.lyrics, lines: enriched } };
        }
        if (prev.lyrics.kind === 'plain') {
          return { ...prev, lyrics: { ...prev.lyrics, translatedLines: subLines } };
        }
        return prev;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [curVideoIdForTrans, curLyricsKindForTrans, translateLang]);

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

      if (lyrics.kind === 'synced' && hasNonLatinScript(lyrics.lines.map((l) => l.text))) {
        romanizeLyricsApi(
          track.videoId,
          lyrics.lines.map((l) => l.text),
        ).then((subLines) => {
          if (!subLines || requestTokenRef.current !== token) return;
          setState((prev) => {
            if (prev.lyrics.kind !== 'synced') return prev;
            const enriched = prev.lyrics.lines.map((ln, idx) => ({
              ...ln,
              ...(subLines[idx] ? { romanized: subLines[idx]! } : {}),
            }));
            return { ...prev, lyrics: { ...prev.lyrics, lines: enriched } };
          });
        });
      } else if (lyrics.kind === 'plain') {
        const plainLines = lyrics.text.split(/\r?\n/);
        if (hasNonLatinScript(plainLines)) {
          romanizeLyricsApi(track.videoId, plainLines).then((subLines) => {
            if (!subLines || requestTokenRef.current !== token) return;
            setState((prev) => {
              if (prev.lyrics.kind !== 'plain') return prev;
              return { ...prev, lyrics: { ...prev.lyrics, romanizedLines: subLines } };
            });
          });
        }
      }
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
      if (pauseFadeTimerRef.current !== null) {
        window.clearTimeout(pauseFadeTimerRef.current);
        pauseFadeTimerRef.current = null;
      }
      if (fadeGainNodeRef.current && audioCtxRef.current) {
        fadeGainNodeRef.current.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
        fadeGainNodeRef.current.gain.setValueAtTime(1, audioCtxRef.current.currentTime);
      }
      translatedTrackKeyRef.current = '';
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
        abLoop: { aMs: null, bMs: null },
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
        const pitch = dspRef.current.pitchSemitones || 0;
        const pitchFactor = Math.pow(2, pitch / 12);
        const audioCompat = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean };
        audio.preservesPitch = pitch === 0;
        audioCompat.webkitPreservesPitch = pitch === 0;
        audio.playbackRate = Math.max(0.5, Math.min(2, (playbackRate || 1) * pitchFactor));
        applyOutputDevice(dspRef.current.audioOutputDeviceId);

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
    [applyOutputDevice, ensureAudioGraph, loadTrackMeta, onTrackStart, playbackRate],
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
    if (pauseFadeTimerRef.current !== null) {
      window.clearTimeout(pauseFadeTimerRef.current);
      pauseFadeTimerRef.current = null;
    }
    if (needsResolveRef.current) {
      const seekMs = pendingSeekMsRef.current ?? getPlaybackPositionMs();
      startAtIndex(Math.max(0, cur.currentIndex), cur.queue, seekMs);
      return;
    }
    ensureAudioGraph();
    const fNode = fadeGainNodeRef.current;
    const ctx = audioCtxRef.current;
    const smartFade = dspRef.current.smartFadePlayPause;

    if (audio.paused) {
      if (smartFade && fNode && ctx) {
        const now = ctx.currentTime;
        fNode.gain.cancelScheduledValues(now);
        fNode.gain.setValueAtTime(0.001, now);
        fNode.gain.linearRampToValueAtTime(1, now + 0.15);
      } else if (fNode && ctx) {
        fNode.gain.setValueAtTime(1, ctx.currentTime);
      }
      audio.play().catch(() => {});
    } else if (smartFade && fNode && ctx) {
      const now = ctx.currentTime;
      fNode.gain.cancelScheduledValues(now);
      fNode.gain.setValueAtTime(Math.max(0.001, fNode.gain.value || 1), now);
      fNode.gain.linearRampToValueAtTime(0.001, now + 0.14);
      pauseFadeTimerRef.current = window.setTimeout(() => {
        pauseFadeTimerRef.current = null;
        audio.pause();
        if (fadeGainNodeRef.current && audioCtxRef.current) {
          fadeGainNodeRef.current.gain.setValueAtTime(1, audioCtxRef.current.currentTime);
        }
      }, 145);
    } else {
      audio.pause();
    }
  }, [ensureAudioGraph, startAtIndex]);

  const setLoopPointA = useCallback(() => {
    const pos = Math.max(0, getPlaybackPositionMs());
    setState((prev) => {
      const curB = prev.abLoop.bMs;
      return {
        ...prev,
        abLoop: {
          aMs: pos,
          bMs: curB !== null && curB > pos + 400 ? curB : null,
        },
      };
    });
  }, []);

  const setLoopPointB = useCallback(() => {
    const pos = Math.max(0, getPlaybackPositionMs());
    setState((prev) => {
      const curA = prev.abLoop.aMs ?? 0;
      const aMs = Math.min(curA, pos);
      const bMs = Math.max(curA, pos);
      if (bMs <= aMs + 400) return prev;
      return {
        ...prev,
        abLoop: { aMs, bMs },
      };
    });
  }, []);

  const clearAbLoop = useCallback(() => {
    setState((prev) =>
      prev.abLoop.aMs === null && prev.abLoop.bMs === null
        ? prev
        : { ...prev, abLoop: { aMs: null, bMs: null } },
    );
  }, []);

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
    audioOutputDevices,
    refreshOutputDevices,
    playTrack,
    playAtIndex: startAtIndex,
    restoreSession,
    togglePlayPause,
    seekTo,
    jumpToBestPart,
    setSleepTimer,
    setLoopPointA,
    setLoopPointB,
    clearAbLoop,
    next,
    previous,
    addToQueue,
    removeFromQueue,
    toggleShuffle,
    cycleRepeat,
    setRepeatMode,
  };
}
