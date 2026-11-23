export const APP_VERSION = '1.4.6';
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
    version: '1.4.6',
    date: '2026-11-23',
    summary: 'Audio Smoothness & Zero-Stutter Fix: fixed chunked audio proxy disconnect aborts, added 1-chunk lookahead prefetch + retry/LRU cache, switched AudioContext to playback latency hint, and disabled Electron background audio throttling.',
    fixed: [
      'Fixed premature chunked audio stream aborts on req close by switching disconnect detection to res close (!res.writableFinished) and adding 1-chunk lookahead prefetch, 3x transient retry, and a 24-chunk LRU cache in electron/ytmusic.cjs.',
      'Switched AudioContext to { latencyHint: "playback" }, added playing buffer recovery and preservesPitch, and cleanly restored crossfade gain when seeking.',
      'Disabled Electron renderer backgrounding and timer throttling so audio playback stays silky smooth even under heavy GPU blur or when unfocused/in tray.',
    ],
  },
  {
    version: '1.4.5',
    date: '2026-11-23',
    summary: 'Background Auto-Sync Playlists & Windows Taskbar Media Controls: automatically refreshes Liked Songs and synced playlists on startup (+30m) and adds native Windows taskbar transport buttons.',
    added: [
      'Silent background Auto-Sync for Liked Songs and YouTube Music / Spotify playlists on launch (3s delay, rate-limit spaced, skips Offline Mode) plus periodic 30-minute refresh and Settings toggle / Sync button.',
      'Native Windows Taskbar Thumbar Media Buttons (Previous, Play/Pause, Next) shown on taskbar hover along with live track/artist window title.',
    ],
  },
  {
    version: '1.4.4',
    date: '2026-11-23',
    summary: 'Auto-Ambient Screensaver: automatically enters in-window Ambient Visualizer after 3 minutes of inactivity while music is playing.',
    added: [
      'In-app idle screensaver timer (default 3 minutes while playing with visible window) that switches seamlessly into Ambient Visualizer without taking over OS fullscreen.',
      'Configurable Ambient Screensaver idle timeout (Off / 1m / 3m / 5m / 10m) in Settings -> Audio & Lyrics -> Desktop Native & Visualizer Modes.',
    ],
  },
  {
    version: '1.4.3',
    date: '2026-11-22',
    summary: 'Beat-Reactive Ambient Engine: kick-transient Halo spikes with orbital momentum + slim tapered Dual-Mirror Studio needles & smooth Bezier oscilloscope.',
    fixed: [
      'Upgraded Ambient AnalyserNode resolution (512 FFT) with adaptive loudness floor subtraction and contrast expansion so Halo radial spikes react crisply to drum beats instead of plateauing.',
      'Increased Halo title clearance and added cover beat pulse so radial spikes stay completely clear of the track title.',
      'Replaced wide boxy bars in Studio Wave with 128 razor-slim tapered frequency needles and a smooth 44-point quadratic Bezier oscilloscope trace.',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-11-22',
    summary: 'UI Polish & Quick EQ Toggle: frameless Floating Lyrics overlay without Windows DWM bar overlap, tidy single-line Sidebar Stats widget, and toggleable Quick EQ + DSP popup.',
    added: [
      'Quick EQ & DSP Popover toggled directly from the sidebar EQ button (click again or press Esc/outside to close) with 10-band sliders, presets, AutoEQ profile selector, Volume Normalizer, and Spatial 3D switches.',
    ],
    fixed: [
      'Eliminated the Windows DWM white titlebar strip (claudewaves-desktop) on top of the Floating Lyrics overlay by setting thickFrame: false, resizable: false, null menu, and extra top hover clearance.',
      'Fixed two-line wrapping on the Sidebar STATS header and listen-time pill (6h 46m) with single-line nowrap pills and balanced column divider.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-11-22',
    summary: 'Ambient Visualizer 4-Preset Studio: live switcher between Apple Aurora Split, Vinyl Turntable Studio, Radial 360 Halo & Nebula, and Dual-Mirror Studio Wave.',
    added: [
      '4 live-switchable Ambient presets via top frosted pill or hotkey V: Aurora Split (fluid mesh + 5-line synced lyrics + silk ribbon), Vinyl Turntable (spinning 12-inch record + articulated tonearm + platter glow), Radial 360 Halo (symmetrical radial ring + nebula particles), and Dual-Mirror Studio Wave (centered dual-mirror bars + analog oscilloscope).',
      'Shared elevated dark-glass floating transport capsule cleanly separated from visualizer canvas layers.',
    ],
    fixed: [
      'Replaced uneven linear FFT mapping with logarithmic balanced symmetric band sampling so left and right sides react evenly across bass, mids, and highs.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-11-22',
    summary: 'Phase 3 Social, Stats & Updates Release: Discord Rich Presence, Last.fm Scrobbling, Stats Dashboard + Listening Wrapped PNG Export, and GitHub Auto-Updater.',
    added: [
      'Native Discord Rich Presence over Windows Local IPC (\\\\.\\pipe\\discord-ipc-N) displaying live song, artist, album art, playback timestamps, and clickable track links.',
      'Last.fm Scrobbling integration with local MD5 API request signing, Now Playing updates, automatic scrobbles at >= 50% / 4 min played, and Settings connect card.',
      'Dedicated Stats & Listening Wrapped view across all 7 skins featuring KPI cards, 7-day activity bars, Top Artists & Most Played Tracks leaderboards, and 4-theme 1080x1350 PNG card export.',
      'In-App GitHub Releases Auto-Updater targeting aayepp/ClaudeWaves-Desktop with startup check, progress tracking, and 1-click installer launch.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-22',
    summary: 'Phase 2 Offline & Audiophile DSP Update: Offline Downloads + Offline Mode, Volume Normalizer, Spatial 3D, AutoEQ Headphone Profiles, and SponsorBlock Auto-Skip.',
    added: [
      'Offline Downloads store with chunked range download (<= 512 KB), HTTP 206 byte-range local audio streaming, Downloads library view, Offline Mode switch, and per-track & Download All playlist buttons.',
      'Audiophile WebAudio DSP pipeline: Volume Normalizer (DynamicsCompressor + makeup gain + safety limiter), Spatial 3D cross-feed soundstage, and 11 AutoEQ headphone compensation profiles summed cleanly with the 10-band EQ.',
      'SponsorBlock Auto-Skip integration automatically skipping music_offtopic, intro, outro, and sponsor segments with live toast notices and Settings toggle.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-22',
    summary: 'Phase 1 Mega Update: Tidal HiFi, SoundCloud Wave & Nothing OS skins, System Tray & Global Media Hotkeys, Floating Desktop Lyrics Overlay, and Ambient Fullscreen Visualizer.',
    added: [
      'Three new full layout skins in Settings & Onboarding: Tidal HiFi Studio (MAX badges & razor seekbar), SoundCloud Wave (48-bar interactive waveform scrubber & wave feed cards), and Nothing OS Dot-Matrix (industrial dot-grid & numbered widget deck).',
      'Windows System Tray with quick playback menu, configurable Close-to-Tray behavior, single-instance focus, and Global Media Hotkeys (MediaPlayPause / Next / Prev / Stop).',
      'Always-on-top Floating Desktop Lyrics Overlay window with synced lines, font-size toggle, drag handle, and click-through lock mode (unlockable from System Tray).',
      'Ambient Fullscreen Visualizer / Monitor-2 Mode (F11 or dock Monitor button) featuring 64-bar real-time frequency visualizer canvas, live CoverArtWaves, clock, synced lyrics, and auto-hiding HUD.',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-11-22',
    summary: 'Compact splash sizing, unique per-step onboarding animations with live animated skin cards, and signature Home motion per theme & skin.',
    added: [
      'Live animated 4-card App Layout Skin picker inside Onboarding Step 1 (ClaudeWaves, Spotify, YouTube Music, Apple Music) plus live vibe badge and Settings hover/selected wireframe animations.',
      'Unique directional stage transitions and custom animations across all 5 Onboarding steps (floating orbit logo, cascading vibe picker, pulsing profile greeting, dual-signal connect rings, and volume-reactive 5-bar playground waves).',
      'Signature Home animations for every layout skin and ClaudeWaves preset (Spotify breathing wash & cascade, YouTube Music row glides & playing equalizer overlay, Apple Music Top Picks zoom + gloss sweep, Rhythmo & Comic Pop shelf springs).',
      'Refresh button in Apple Music Explore header for parity with Home.',
    ],
    changed: [
      'Scaled down launch splash canvas proportions (~35% more compact, capped at 0.92 unit scale) while keeping full-screen ambient backdrop.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-22',
    summary: 'Full App Layout Skins Switcher: live structural switching across ClaudeWaves, Spotify Desktop, YouTube Music Desktop, and Apple Music macOS.',
    added: [
      'App Layout Skin Switcher in Settings Appearance and Onboarding Step 1 (ClaudeWaves, Spotify, YouTube Music, Apple Music).',
      'Spotify Desktop skin: obsidian panel framing, circular Home & top search pill, Your Library 2-line rows, 2x4 Quick Resume grid, and edge-to-edge bottom dock with flat scrubber.',
      'YouTube Music Desktop skin: hairline rail with + New playlist pill, mood chips, 4x3 Quick picks song grid with Play all, and bottom dock with 3px top-edge scrubber.',
      'Apple Music macOS skin: full-width 56px top player bar with centered LCD Now Playing pill, inset sidebar search (Ctrl+K), and 4-column Top Picks for You showcase.',
      'Full Dark, Light, AMOLED, and 12 Accent Swatch support across every layout skin with automatic liquid-glass bypass on non-default skins.',
    ],
  },
  {
    version: '1.0.18',
    date: '2026-11-22',
    summary: 'Refresh sync button inside Liked Songs & Playlists, plus Rhythmo set as the default theme.',
    added: [
      'Refresh button inside Liked Songs and Playlists to pull newly liked or updated songs from YouTube Music & Spotify, with automatic source matching for previously imported playlists.',
    ],
    changed: [
      'Set Rhythmo pure-matte studio theme as the default theme for new installs without altering existing saved user preferences.',
    ],
  },
  {
    version: '1.0.17',
    date: '2026-11-22',
    summary: 'Pure matte studio chrome on the Rhythmo theme with all liquid-glass blur, refraction, and rims disabled.',
    fixed: [
      'Disabled all liquid-glass blur, SVG refraction, specular rims, lens mirrors, and backdrop haze on the Rhythmo theme across cards, buttons, inputs, sheets, and switches.',
    ],
  },
  {
    version: '1.0.16',
    date: '2026-11-22',
    summary: 'New Rhythmo studio theme preset with Dark, Light, AMOLED, and custom accent support.',
    added: [
      'New Rhythmo theme preset featuring matte slate panels, warm orange brand highlight, outlined capsule mood chips, 5-card 3D spotlight fan, 6-palette jewel-framed song cards, and circular dock artwork.',
      'Sidebar playlist cover thumbnails across all themes.',
    ],
    fixed: [
      'Preserve styled theme presets (Comic Pop & Rhythmo) when selecting accent swatches during onboarding or Settings.',
    ],
  },
  {
    version: '1.0.15',
    date: '2026-11-21',
    summary: 'Auto-centered video popup, sidebar Mini Stats & Quick Tools, 4-tab Settings + About & Changelog, and playlist Repeat All + Android 6-mode sort.',
    added: [
      'Sidebar Mini Stats + Quick Tools widget (Songs Played, Listen Time, Top Artist, EQ, Sleep Timer, Auto-Radio).',
      '4-tab Settings Studio (Accounts & Stats, Appearance, Audio & Lyrics, Backup & About) with aayepp About card, GPL v3 notice, GitHub links, and in-app Changelog.',
      'Playlist Repeat All button, in-playlist search filter, and 6 Android sort modes (Custom, Liked Songs, Date Added, Title A–Z, Artist A–Z, Play Time) with persistent sort memory.',
    ],
    fixed: [
      'Always auto-center Music Video popup in the live viewport when opened or toggled on.',
    ],
  },
  {
    version: '1.0.14',
    date: '2026-11-21',
    summary: 'Larger Lyrics cover art with real-time beat-reactive Silk Ribbon Waves, slim volume slider, and Comic Pop accent fixes.',
    added: [
      '3-Layer beat-reactive Silk Ribbon Waves canvas behind cover art in Side Panel Lyrics & Fullscreen Now Playing.',
      'Slim pointer-draggable & wheel-scrollable volume control across all themes.',
    ],
    changed: [
      'Enlarged Side Panel Lyrics cover artwork from 148px to 184px.',
    ],
    fixed: [
      'Prevent Comic Pop preset from resetting to Neutral/Accent when picking accent swatches.',
      'Keep Sync 0ms toolbar pill on a single crisp line.',
    ],
  },
  {
    version: '1.0.13',
    date: '2026-11-21',
    summary: 'Center morph transitions, 1440p/4K VP9/AV1 video quality tiers, and Windows Always-on-Top Mini Player fixes.',
    added: [
      'Center Morph Zoom transition when opening or exiting Fullscreen Lyrics from floating video popup.',
      '1440p & 4K (2160p) YouTube Music Video resolution selection with live decoded resolution readout.',
    ],
    fixed: [
      'Fix Always-on-Top Mini Player unmaximizing properly on Windows and snapping to bottom-right.',
    ],
  },
  {
    version: '1.0.12',
    date: '2026-11-21',
    summary: 'Cinema blur popup video with free drag/resize, dual fullscreen modes, and text-hugging lyric glow.',
    added: [
      'Draggable & resizable Cinema Blur video popup with True Fullscreen and Fullscreen + Lyrics modes.',
      '10-track spotlight Cover-Flow deck and auto-restore last open Lyrics/Queue panel state.',
    ],
    fixed: [
      'Remove horizontal scrollbars and tighten lyric glow to follow active text instead of full-width box.',
    ],
  },
  {
    version: '1.0.11',
    date: '2026-11-21',
    summary: '240Hz external playback clock, silky horizontal shelves, and Apple SF-style colored icons.',
    changed: [
      'Move high-frequency playback timer off root React state into an external clock store for zero-jitter scrolling.',
      'Redesign vertical scrollbars to sleek macOS 6px pills and color-code navigation/player icons.',
    ],
  },
  {
    version: '1.0.10',
    date: '2026-11-21',
    summary: '3D Cover-Flow hero, draggable Home sections, session resume, and lyric offset tuning.',
    added: [
      'Full-width 3D Stacked Cover-Flow hero section with mood chips.',
      'Drag-and-drop Home section reordering with persistent layout order and auto-resume last played song.',
    ],
  },
  {
    version: '1.0.9',
    date: '2026-11-21',
    summary: 'Sentence vs Word lyrics modes and Android-matched launch splash animation.',
    added: [
      'Sentence and Word Sweep lyrics display mode toggle plus per-track timing offset control.',
      'Android-matched animated splash screen and 512px high-resolution app icon.',
    ],
  },
];
