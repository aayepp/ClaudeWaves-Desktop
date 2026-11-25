export const APP_VERSION = '1.0.1';
export const CLAUDEWAVES_REPO_URL = 'https://github.com/aayepp/ClaudeWaves-Desktop';
export const CLAUDEWAVES_RELEASES_URL = 'https://github.com/aayepp/ClaudeWaves-Desktop/releases/latest';

export interface ChangelogRelease {
  version: string;
  date: string;
  summary: string;
  added?: string[];
  changed?: string[];
  fixed?: string[];
}

export const DESKTOP_CHANGELOG: ChangelogRelease[] = [
  {
    version: '1.0.1',
    date: '2026-11-25',
    summary: 'Full Spotify Playlist & Liked Songs Importer (TOTP + Pathfinder) + Exportify CSV Import.',
    added: [
      'Live Spotify Web Player TOTP + Client-Token authentication and header capture during 1-click sign-in.',
      'Pathfinder GraphQL libraryV3, fetchPlaylist, and fetchLibraryTracks engine supporting public/private Spotify playlists (up to 500 matched tracks) and 1-click Sync Spotify Liked Songs.',
      'CSV / Exportify drag-and-drop & file picker importer supporting Exportify, Soundiiz, and TuneMyMusic exports.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-25',
    summary: 'ClaudeWaves Desktop v1.0.0 — Initial Public Desktop Release.',
    added: [
      '7 switchable layout skins (ClaudeWaves Liquid Glass, Spotify Desktop, YouTube Music, Apple Music macOS, Tidal HiFi Studio, SoundCloud Wave, Nothing OS Dot-Matrix) with Dark, Light, AMOLED, Comic Pop, and slim blended titlebar.',
      '4-preset Ambient Visualizer Studio (Aurora Split, Spinning Vinyl, Neon Halo, Dual-Mirror Studio Wave) with 3-minute idle screensaver auto-trigger and Always-on-Top Mini Player with CoverArtWaves silk ribbons.',
      'Official Music Video auto-match with 1-click Switch MV selector and draggable Cinema Blur video popup.',
      'Word-by-Word Karaoke & Sentence synced lyrics with symmetrical centered full-screen view, auto-romanize, BM/EN dual-language translation, sync offset tuning, and PNG Quote Card exporter.',
      'Audiophile WebAudio DSP pipeline: 10-band EQ, 11 AutoEQ profiles, real-time Pitch, Hall Reverb, Slowed + Reverb, 1-click A-B Section Loop, and Audio Output Device Switcher with auto-pause on unplug.',
      'Offline Downloads, auto-syncing playlists on launch, Global Command Palette (Ctrl+Shift+P), Windows Media Controls, Discord Rich Presence, Last.fm Scrobbling, and In-App GitHub Updater.',
    ],
  },
];
