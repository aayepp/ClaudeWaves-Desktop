# ClaudeWaves Desktop

Native Windows YouTube Music desktop client built with **Electron + React + TypeScript + Vite** by **aayepp**.

## Features (v1.0.0)

- **7 Switchable App Layout Skins**: ClaudeWaves Liquid Glass, Spotify Desktop, YouTube Music, Apple Music macOS, Tidal HiFi Studio, SoundCloud Wave, and Nothing OS Dot-Matrix — each with Dark, Light, AMOLED, and 12 curated accent swatches.
- **Native Desktop Integration**: Windows System Tray, Close-to-Tray, Single-Instance Lock, Global Media Hotkeys, always-on-top Floating Lyrics Overlay with click-through Lock, and Ambient Fullscreen Visualizer (`F11`).
- **Audiophile WebAudio Pipeline**: 10-band EQ, 11 AutoEQ headphone profiles, Volume Normalizer, Spatial 3D cross-feed, crossfade, SponsorBlock auto-skip, and Offline Downloads with local HTTP 206 streaming + Offline Mode.
- **Social & Analytics**: Discord Rich Presence over Windows Local IPC, Last.fm Scrobbling with MD5 request signing, Stats Dashboard & Listening Wrapped with `1080x1350` PNG card export, and In-App GitHub Auto-Updater.

## Development

```bash
npm install
npm run electron:start
```

## Build Windows Installer

```bash
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npm run build:win
```
