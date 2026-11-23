import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard } from '@zakisheriff/liquid-glass';
import {
  Compass,
  Download,
  Headphones,
  Heart,
  Home,
  Languages,
  ListMusic,
  Mic2,
  Monitor,
  Moon,
  Palette,
  Pause,
  Play,
  Search,
  Settings,
  Share2,
  SkipForward,
  Sliders,
  Sparkles,
} from 'lucide-react';
import type { AudioOutputDeviceInfo, PlayerState } from '../hooks/usePlayer';
import {
  EQ_PRESETS,
  type AppSettings,
  type LayoutSkin,
  type Track,
  type UserPlaylist,
} from '../types';
import type { SidebarRoute } from './Sidebar';

interface CommandItem {
  id: string;
  category: string;
  label: string;
  sub?: string;
  keywords: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  playerState: PlayerState;
  settings: AppSettings;
  intensity: number;
  audioOutputDevices: AudioOutputDeviceInfo[];
  smartPlaylists: UserPlaylist[];
  playlists: UserPlaylist[];
  recentTracks: Track[];
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onPlayTrack: (track: Track, list: Track[]) => void;
  onSelectRoute: (route: SidebarRoute) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onToggleAmbient: () => void;
  onToggleEq: () => void;
  onCycleSleep: () => void;
  onOpenQuoteModal: () => void;
  onExportBackup: () => void;
}

const SKIN_LABELS: Array<[LayoutSkin, string]> = [
  ['default', 'ClaudeWaves Glass'],
  ['spotify', 'Spotify Desktop'],
  ['ytmusic', 'YouTube Music Web'],
  ['apple', 'Apple Music macOS'],
  ['tidal', 'TIDAL HiFi'],
  ['soundcloud', 'SoundCloud Wave'],
  ['nothing', 'Nothing OS Dot'],
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  playerState,
  settings,
  intensity,
  audioOutputDevices,
  smartPlaylists,
  playlists,
  recentTracks,
  onTogglePlayPause,
  onNext,
  onPrev,
  onPlayTrack,
  onSelectRoute,
  onUpdateSettings,
  onToggleAmbient,
  onToggleEq,
  onCycleSleep,
  onOpenQuoteModal,
  onExportBackup,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(id);
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [
      {
        id: 'play-pause',
        category: 'Playback',
        label: playerState.isPlaying ? 'Pause Playback' : 'Play / Resume Playback',
        sub: playerState.currentTrack ? `${playerState.currentTrack.title} — ${playerState.currentTrack.artist}` : undefined,
        keywords: 'play pause toggle resume',
        icon: playerState.isPlaying ? <Pause size={15} /> : <Play size={15} />,
        run: onTogglePlayPause,
      },
      {
        id: 'next-track',
        category: 'Playback',
        label: 'Next Track',
        keywords: 'next skip forward',
        icon: <SkipForward size={15} />,
        run: onNext,
      },
      {
        id: 'prev-track',
        category: 'Playback',
        label: 'Previous Track',
        keywords: 'previous back',
        icon: <SkipForward size={15} style={{ transform: 'rotate(180deg)' }} />,
        run: onPrev,
      },
      {
        id: 'open-eq',
        category: 'Audio FX',
        label: 'Toggle Quick Equalizer & Audio FX',
        sub: `Preset: ${settings.eqPreset}`,
        keywords: 'eq equalizer dsp pitch reverb ab loop',
        icon: <Sliders size={15} />,
        run: onToggleEq,
      },
      {
        id: 'slowed-reverb',
        category: 'Audio FX',
        label:
          settings.pitchSemitones === -2 && settings.reverbMix >= 0.4
            ? 'Turn Off Slowed + Reverb Mode'
            : 'Enable Slowed + Reverb Mode',
        sub: '0.85× speed · −2st pitch · 45% hall reverb',
        keywords: 'slowed reverb lofi chill pitch speed',
        icon: <Sparkles size={15} />,
        run: () => {
          const active = settings.pitchSemitones === -2 && settings.reverbMix >= 0.4;
          onUpdateSettings(
            active
              ? { playbackRate: 1, pitchSemitones: 0, reverbMix: 0 }
              : { playbackRate: 0.85, pitchSemitones: -2, reverbMix: 0.45 },
          );
        },
      },
      {
        id: 'cycle-sleep',
        category: 'Playback',
        label: 'Cycle Sleep Timer',
        sub: playerState.sleepRemainingSec !== null ? 'Currently active' : '15m / 30m / 45m / 60m',
        keywords: 'sleep timer off',
        icon: <Moon size={15} />,
        run: onCycleSleep,
      },
      {
        id: 'toggle-ambient',
        category: 'Visualizer',
        label: 'Toggle Ambient Visualizer Fullscreen',
        sub: `Preset: ${settings.ambientPreset}`,
        keywords: 'ambient visualizer screensaver aurora vinyl halo wave f11',
        icon: <Monitor size={15} />,
        run: onToggleAmbient,
      },
      {
        id: 'quote-card',
        category: 'Lyrics',
        label: 'Export Lyric Quote Card (PNG)',
        sub: 'Share 1–4 lyric lines with cover art',
        keywords: 'quote card png share export lyric image',
        icon: <Share2 size={15} />,
        run: onOpenQuoteModal,
      },
      {
        id: 'translate-off',
        category: 'Lyrics',
        label: 'Lyrics Translation: Off',
        keywords: 'translate lyrics off',
        icon: <Languages size={15} />,
        run: () => onUpdateSettings({ lyricsTranslateLang: 'off' }),
      },
      {
        id: 'translate-ms',
        category: 'Lyrics',
        label: 'Lyrics Translation: Bahasa Melayu (BM)',
        keywords: 'translate lyrics malay bahasa melayu bm',
        icon: <Languages size={15} />,
        run: () => onUpdateSettings({ lyricsTranslateLang: 'ms' }),
      },
      {
        id: 'translate-en',
        category: 'Lyrics',
        label: 'Lyrics Translation: English (EN)',
        keywords: 'translate lyrics english en',
        icon: <Languages size={15} />,
        run: () => onUpdateSettings({ lyricsTranslateLang: 'en' }),
      },
      {
        id: 'nav-home',
        category: 'Navigate',
        label: 'Go to Home',
        keywords: 'home feed',
        icon: <Home size={15} />,
        run: () => onSelectRoute({ kind: 'home' }),
      },
      {
        id: 'nav-explore',
        category: 'Navigate',
        label: 'Go to Explore Charts',
        keywords: 'explore charts discover',
        icon: <Compass size={15} />,
        run: () => onSelectRoute({ kind: 'explore' }),
      },
      {
        id: 'nav-liked',
        category: 'Navigate',
        label: 'Go to Liked Songs',
        keywords: 'liked favorites hearts',
        icon: <Heart size={15} />,
        run: () => onSelectRoute({ kind: 'liked' }),
      },
      {
        id: 'nav-stats',
        category: 'Navigate',
        label: 'Go to Stats & Wrapped',
        keywords: 'stats wrapped analytics plays',
        icon: <Mic2 size={15} />,
        run: () => onSelectRoute({ kind: 'stats' }),
      },
      {
        id: 'nav-settings',
        category: 'Navigate',
        label: 'Open Settings',
        keywords: 'settings preferences accounts theme',
        icon: <Settings size={15} />,
        run: () => onSelectRoute({ kind: 'settings' }),
      },
      {
        id: 'backup-export',
        category: 'Data',
        label: 'Export Library Backup (.json)',
        keywords: 'export backup json playlists settings save',
        icon: <Download size={15} />,
        run: onExportBackup,
      },
      {
        id: 'output-default',
        category: 'Audio Output',
        label: 'Output: System Default',
        keywords: 'audio output speaker headphone default',
        icon: <Headphones size={15} />,
        run: () => onUpdateSettings({ audioOutputDeviceId: '' }),
      },
    ];

    for (const dev of audioOutputDevices) {
      list.push({
        id: `out-${dev.deviceId}`,
        category: 'Audio Output',
        label: `Output: ${dev.label}`,
        sub: settings.audioOutputDeviceId === dev.deviceId ? 'Active output' : 'Switch audio device',
        keywords: `audio output speaker headphone dac bluetooth ${dev.label}`,
        icon: <Headphones size={15} />,
        run: () => onUpdateSettings({ audioOutputDeviceId: dev.deviceId }),
      });
    }

    for (const [skinId, label] of SKIN_LABELS) {
      list.push({
        id: `skin-${skinId}`,
        category: 'Layout Skin',
        label: `Skin: ${label}`,
        sub: settings.layoutSkin === skinId ? 'Active skin' : undefined,
        keywords: `layout skin theme ${skinId} ${label}`,
        icon: <Palette size={15} />,
        run: () => onUpdateSettings({ layoutSkin: skinId }),
      });
    }

    for (const [presetName, gains] of Object.entries(EQ_PRESETS)) {
      list.push({
        id: `eq-${presetName}`,
        category: 'Equalizer',
        label: `EQ Preset: ${presetName}`,
        keywords: `equalizer eq preset ${presetName}`,
        icon: <Sliders size={15} />,
        run: () => onUpdateSettings({ eqPreset: presetName, eqGains: [...gains] }),
      });
    }

    for (const sp of smartPlaylists) {
      list.push({
        id: `smart-${sp.id}`,
        category: 'Smart Mix',
        label: sp.name,
        sub: `${sp.tracks.length} tracks`,
        keywords: `smart playlist mix ${sp.name}`,
        icon: <Sparkles size={15} />,
        run: () => onSelectRoute({ kind: 'playlist', id: sp.id }),
      });
    }

    for (const pl of playlists) {
      list.push({
        id: `pl-${pl.id}`,
        category: 'Playlist',
        label: pl.name,
        sub: `${pl.tracks.length} tracks`,
        keywords: `playlist ${pl.name}`,
        icon: <ListMusic size={15} />,
        run: () => onSelectRoute({ kind: 'playlist', id: pl.id }),
      });
    }

    for (const tr of recentTracks.slice(0, 12)) {
      list.push({
        id: `tr-${tr.videoId}`,
        category: 'Recent Track',
        label: tr.title,
        sub: tr.artist,
        keywords: `play track song ${tr.title} ${tr.artist}`,
        icon: <Play size={15} />,
        run: () => onPlayTrack(tr, recentTracks),
      });
    }

    return list;
  }, [
    playerState.isPlaying,
    playerState.currentTrack,
    playerState.sleepRemainingSec,
    settings,
    audioOutputDevices,
    smartPlaylists,
    playlists,
    recentTracks,
    onTogglePlayPause,
    onNext,
    onPrev,
    onToggleEq,
    onUpdateSettings,
    onCycleSleep,
    onToggleAmbient,
    onOpenQuoteModal,
    onSelectRoute,
    onExportBackup,
    onPlayTrack,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 18);
    const terms = q.split(/\s+/).filter(Boolean);
    return items
      .filter((item) => {
        const hay = `${item.label} ${item.sub || ''} ${item.category} ${item.keywords}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 20);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const exec = (item?: CommandItem) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div
      className="cw-cmd-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cw-cmd-shell cw-comic-frame">
        <GlassCard intensity={intensity} padding="12px" radius="20px">
          <div className="cw-cmd-search-row">
            <Search size={16} color="var(--cw-accent)" />
            <input
              ref={inputRef}
              type="text"
              className="cw-cmd-input"
              value={query}
              placeholder="Taip arahan, lagu, skin, EQ, output atau fungsi..."
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(0, i - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  exec(filtered[activeIndex]);
                }
              }}
            />
            <span className="cw-cmd-kbd">ESC</span>
          </div>

          <div className="cw-cmd-results">
            {filtered.length === 0 ? (
              <div className="cw-muted" style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12.5 }}>
                Tiada arahan sepadan dengan &ldquo;{query}&rdquo;.
              </div>
            ) : (
              filtered.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  className="cw-cmd-row"
                  data-active={idx === activeIndex}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => exec(item)}
                >
                  <span className="cw-cmd-row-icon">{item.icon}</span>
                  <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                    <div className="cw-ellipsis" style={{ fontWeight: 650, fontSize: 13 }}>{item.label}</div>
                    {item.sub && (
                      <div className="cw-muted cw-ellipsis" style={{ fontSize: 11.5 }}>{item.sub}</div>
                    )}
                  </div>
                  <span className="cw-cmd-cat">{item.category}</span>
                </button>
              ))
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
