const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, screen, session, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handleApiRequest, resolveAudioStream, setWindowMiniHandler } = require('./ytmusic.cjs');
const { initAuthStore } = require('./authAndImport.cjs');
const {
  initOfflineStore,
  listOfflineTracks,
  downloadTrackOffline,
  deleteOfflineTrack,
  clearOfflineTracks,
  serveOfflineAudio,
} = require('./offlineStore.cjs');
const {
  updateDiscordPresence,
  clearDiscordPresence,
  getDiscordStatus,
  destroyDiscordRpc,
} = require('./discordRpc.cjs');
const {
  initLastFm,
  getLastFmStatus,
  connectLastFm,
  disconnectLastFm,
  updateNowPlaying,
  scrobbleTrack,
} = require('./lastfm.cjs');
const {
  checkForUpdates,
  getUpdateDownloadProgress,
  downloadUpdateAsset,
} = require('./updater.cjs');
const APP_PKG_VERSION = require('../package.json').version || '1.4.0';

// Native high-refresh-rate (120Hz/240Hz+) GPU compositor flags for Windows DirectComposition
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-smooth-scrolling');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

let mainWindow = null;
let localServer = null;
let savedFullBounds = null;
let savedWasMaximized = false;
let tray = null;
let lyricsOverlayWin = null;
let lyricsOverlayLocked = false;
let isQuitting = false;
let currentPort = 47821;
let desktopConfig = { closeToTray: true, globalMediaKeys: true };
let lastLyricsState = {
  title: '',
  artist: '',
  line: 'ClaudeWaves Floating Lyrics',
  nextLine: '',
  isPlaying: false,
  accentHex: '#259D8A',
};

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function sendNativeAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(`window.dispatchEvent(new CustomEvent('cw-native-action', { detail: ${JSON.stringify(action)} }));`)
    .catch(() => {});
}

function syncGlobalShortcuts() {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // Ignore cleanup errors
  }
  if (!desktopConfig.globalMediaKeys) return;
  const bindings = [
    ['MediaPlayPause', 'play-pause'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'prev'],
    ['MediaStop', 'stop'],
  ];
  for (const [accel, action] of bindings) {
    try {
      globalShortcut.register(accel, () => sendNativeAction(action));
    } catch {
      // OS or another media app owns this key
    }
  }
}

function resolveIconPath(distDir) {
  const distIcon = path.join(distDir, 'app_icon.png');
  if (fs.existsSync(distIcon)) return distIcon;
  const pubIcon = path.join(__dirname, '..', 'public', 'app_icon.png');
  return fs.existsSync(pubIcon) ? pubIcon : distIcon;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const overlayOpen = Boolean(lyricsOverlayWin && !lyricsOverlayWin.isDestroyed());
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide ClaudeWaves',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
        } else if (mainWindow.isVisible() && mainWindow.isFocused()) {
          mainWindow.hide();
        } else {
          showMainWindow();
        }
      },
    },
    { type: 'separator' },
    { label: 'Play / Pause', click: () => sendNativeAction('play-pause') },
    { label: 'Previous Track', click: () => sendNativeAction('prev') },
    { label: 'Next Track', click: () => sendNativeAction('next') },
    { type: 'separator' },
    {
      label: overlayOpen ? 'Hide Floating Lyrics' : 'Show Floating Lyrics',
      click: () => sendNativeAction('toggle-lyrics-overlay'),
    },
    {
      label: 'Unlock Floating Lyrics',
      enabled: overlayOpen && lyricsOverlayLocked,
      click: () => setLyricsOverlayLocked(false),
    },
    { type: 'separator' },
    {
      label: 'Quit ClaudeWaves',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function initTray(distDir) {
  if (tray) return;
  try {
    const iconPath = resolveIconPath(distDir);
    let icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 16, height: 16 });
    }
    tray = new Tray(icon);
    tray.setToolTip('ClaudeWaves Desktop');
    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
      } else if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        showMainWindow();
      }
    });
    rebuildTrayMenu();
  } catch {
    // Tray unavailable
  }
}

function getLyricsOverlayHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title></title>
<style>
  * { box-sizing: border-box; user-select: none; }
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    overflow: hidden; background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  body { display: flex; flex-direction: column; padding: 4px; }
  .wrap {
    flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;
    border-radius: 14px; padding: 26px 18px 14px;
    background: rgba(10, 12, 18, 0.76);
    border: 1px solid rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(16px);
    transition: background 180ms ease, border-color 180ms ease;
    position: relative;
  }
  body.locked .wrap {
    background: rgba(8, 10, 15, 0.42);
    border-color: rgba(255, 255, 255, 0.06);
  }
  .bar {
    position: absolute; top: 5px; left: 8px; right: 8px;
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    opacity: 0; transition: opacity 150ms ease;
  }
  .wrap:hover .bar { opacity: 1; }
  body.locked .bar { display: none; }
  .drag {
    -webkit-app-region: drag; flex: 1; height: 18px;
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.68);
    letter-spacing: 0.04em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  .btns { -webkit-app-region: no-drag; display: flex; gap: 4px; }
  .btn {
    border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.1);
    color: #fff; border-radius: 6px; padding: 2px 7px; font-size: 10px; font-weight: 700;
    cursor: pointer;
  }
  .btn:hover { background: rgba(255,255,255,0.22); }
  .line {
    font-size: var(--sz, 21px); font-weight: 800; color: #ffffff;
    text-align: center; line-height: 1.24; letter-spacing: -0.02em;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.92);
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .next {
    margin-top: 4px; font-size: calc(var(--sz, 21px) * 0.62); font-weight: 600;
    color: rgba(255, 255, 255, 0.64); text-align: center;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="bar">
      <div class="drag" id="meta">DRAG LYRICS OVERLAY</div>
      <div class="btns">
        <button class="btn" id="szBtn" title="Cycle font size">A+</button>
        <button class="btn" id="lockBtn" title="Lock click-through (unlock from System Tray)">Lock</button>
        <button class="btn" id="closeBtn" title="Close">✕</button>
      </div>
    </div>
    <div class="line" id="line">ClaudeWaves Floating Lyrics</div>
    <div class="next" id="next">Play a song to show live synced lyrics</div>
  </div>
  <script>
    const sizes = ['18px', '22px', '27px'];
    let szIdx = 1;
    document.getElementById('szBtn').onclick = () => {
      szIdx = (szIdx + 1) % sizes.length;
      document.documentElement.style.setProperty('--sz', sizes[szIdx]);
    };
    const send = (action) => fetch('/api/desktop/lyrics-overlay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    document.getElementById('lockBtn').onclick = () => send('lock');
    document.getElementById('closeBtn').onclick = () => send('close');
    window.__cwSetLocked = (locked) => {
      document.body.classList.toggle('locked', Boolean(locked));
    };
    window.__cwSetLyrics = (st) => {
      const meta = document.getElementById('meta');
      const line = document.getElementById('line');
      const next = document.getElementById('next');
      if (meta) meta.textContent = st.title ? (st.title + (st.artist ? ' — ' + st.artist : '')) : 'CLAUDEWAVES LYRICS';
      if (line) {
        line.textContent = st.line || st.title || 'No Lyrics';
        line.style.color = '#ffffff';
      }
      if (next) {
        next.textContent = st.nextLine || '';
        next.style.color = st.accentHex || 'rgba(255,255,255,0.68)';
      }
    };
  </script>
</body>
</html>`;
}

function pushLyricsToOverlay(state) {
  if (state && typeof state === 'object') {
    lastLyricsState = { ...lastLyricsState, ...state };
  }
  if (!lyricsOverlayWin || lyricsOverlayWin.isDestroyed()) return;
  lyricsOverlayWin.webContents
    .executeJavaScript(`window.__cwSetLyrics && window.__cwSetLyrics(${JSON.stringify(lastLyricsState)});`)
    .catch(() => {});
}

function setLyricsOverlayLocked(locked) {
  lyricsOverlayLocked = Boolean(locked);
  if (!lyricsOverlayWin || lyricsOverlayWin.isDestroyed()) {
    rebuildTrayMenu();
    return;
  }
  lyricsOverlayWin.setIgnoreMouseEvents(lyricsOverlayLocked, { forward: true });
  lyricsOverlayWin.webContents
    .executeJavaScript(`window.__cwSetLocked && window.__cwSetLocked(${lyricsOverlayLocked});`)
    .catch(() => {});
  rebuildTrayMenu();
}

function openLyricsOverlay() {
  if (lyricsOverlayWin && !lyricsOverlayWin.isDestroyed()) {
    lyricsOverlayWin.show();
    pushLyricsToOverlay(lastLyricsState);
    rebuildTrayMenu();
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const w = 740;
  const h = 148;
  lyricsOverlayWin = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(wa.x + (wa.width - w) / 2),
    y: Math.round(wa.y + wa.height - h - 36),
    title: '',
    frame: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  lyricsOverlayWin.setMenu(null);
  lyricsOverlayWin.setMenuBarVisibility(false);
  lyricsOverlayWin.setAlwaysOnTop(true, 'screen-saver');
  lyricsOverlayWin.webContents.on('did-finish-load', () => {
    pushLyricsToOverlay(lastLyricsState);
    setLyricsOverlayLocked(lyricsOverlayLocked);
  });
  lyricsOverlayWin.on('closed', () => {
    lyricsOverlayWin = null;
    lyricsOverlayLocked = false;
    rebuildTrayMenu();
    sendNativeAction('lyrics-overlay-closed');
  });
  lyricsOverlayWin.loadURL(`http://127.0.0.1:${currentPort}/api/desktop/lyrics-overlay-html`);
  rebuildTrayMenu();
}

function closeLyricsOverlay() {
  lyricsOverlayLocked = false;
  if (lyricsOverlayWin && !lyricsOverlayWin.isDestroyed()) {
    lyricsOverlayWin.close();
  }
  lyricsOverlayWin = null;
  rebuildTrayMenu();
}

function setMiniWindowMode(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (enabled) {
    savedWasMaximized = mainWindow.isMaximized();
    savedFullBounds = mainWindow.getNormalBounds();
    mainWindow.setResizable(true);
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    if (savedWasMaximized) mainWindow.unmaximize();
    mainWindow.setMinimumSize(340, 136);
    const wa = screen.getDisplayMatching(savedFullBounds).workArea;
    const miniW = 384;
    const miniH = 152;
    mainWindow.setBounds(
      {
        x: Math.round(wa.x + wa.width - miniW - 20),
        y: Math.round(wa.y + wa.height - miniH - 20),
        width: miniW,
        height: miniH,
      },
      false,
    );
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setResizable(false);
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(960, 640);
    if (savedFullBounds) {
      mainWindow.setBounds(savedFullBounds, false);
    } else {
      mainWindow.setSize(1320, 840, false);
    }
    if (savedWasMaximized) {
      mainWindow.maximize();
    }
    savedFullBounds = null;
    savedWasMaximized = false;
  }
}

function openYtLoginWindow() {
  return new Promise((resolve) => {
    const ses = session.fromPartition('persist:ytmusic');
    const win = new BrowserWindow({
      width: 520,
      height: 700,
      parent: mainWindow || undefined,
      modal: false,
      title: 'Sign in to YouTube Music',
      autoHideMenuBar: true,
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
      if (!win.isDestroyed()) win.close();
    };

    const checkCookies = async () => {
      try {
        const list = await ses.cookies.get({ domain: 'youtube.com' });
        const map = {};
        for (const c of list) map[c.name] = c.value;
        if (map.SAPISID || map['__Secure-3PAPISID'] || map.APISID) {
          finish(map);
        }
      } catch {
        // Ignore transient cookie errors
      }
    };

    win.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith('https://music.youtube.com')) checkCookies();
    });
    win.webContents.on('did-navigate-in-page', (_e, url) => {
      if (url.startsWith('https://music.youtube.com')) checkCookies();
    });
    win.on('closed', () => finish(null));

    win.loadURL(
      'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F',
    );
  });
}

function openSpotifyLoginWindow() {
  return new Promise((resolve) => {
    const ses = session.fromPartition('persist:spotify');
    const win = new BrowserWindow({
      width: 520,
      height: 700,
      parent: mainWindow || undefined,
      modal: false,
      title: 'Sign in to Spotify',
      autoHideMenuBar: true,
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
      if (!win.isDestroyed()) win.close();
    };

    const checkSpotify = async () => {
      try {
        const list = await ses.cookies.get({ url: 'https://open.spotify.com' });
        const spdc = list.find((c) => c.name === 'sp_dc')?.value;
        if (!spdc) return;
        let accessToken = null;
        try {
          accessToken = await win.webContents.executeJavaScript(`
            (async () => {
              const r = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', { credentials: 'include' });
              if (!r.ok) return null;
              const d = await r.json();
              return d && !d.isAnonymous ? d.accessToken : null;
            })();
          `);
        } catch {
          // Will refresh server-side with sp_dc
        }
        finish({ spdc, accessToken });
      } catch {
        // Ignore transient errors
      }
    };

    win.webContents.on('did-finish-load', () => {
      const url = win.webContents.getURL();
      if (url.startsWith('https://open.spotify.com')) checkSpotify();
    });
    win.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith('https://open.spotify.com')) checkSpotify();
    });
    win.on('closed', () => finish(null));

    win.loadURL('https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F');
  });
}

const FIXED_LOCAL_PORT = 47821;

function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function startLocalServer(distDir, userDataDir) {
  const libraryFile = path.join(userDataDir, 'library.json');

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        if ((req.url || '') === '/api/library' || (req.url || '').startsWith('/api/library?')) {
          if (req.method === 'GET') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            if (fs.existsSync(libraryFile)) {
              res.end(fs.readFileSync(libraryFile, 'utf8'));
            } else {
              res.end('{}');
            }
            return;
          }
          if (req.method === 'POST') {
            const raw = await readJsonBody(req);
            JSON.parse(raw); // validate JSON before overwriting disk
            fs.mkdirSync(userDataDir, { recursive: true });
            const tmp = `${libraryFile}.tmp`;
            fs.writeFileSync(tmp, raw, 'utf8');
            fs.renameSync(tmp, libraryFile);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end('{"ok":true}');
            return;
          }
        }

        if ((req.url || '') === '/api/desktop/lyrics-overlay-html' && req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(getLyricsOverlayHtml());
          return;
        }

        if ((req.url || '') === '/api/desktop/config' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          if (typeof body.closeToTray === 'boolean') desktopConfig.closeToTray = body.closeToTray;
          if (typeof body.globalMediaKeys === 'boolean') desktopConfig.globalMediaKeys = body.globalMediaKeys;
          syncGlobalShortcuts();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, ...desktopConfig }));
          return;
        }

        if ((req.url || '') === '/api/desktop/fullscreen' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setFullScreen(Boolean(body.enabled));
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              ok: true,
              fullscreen: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen()),
            }),
          );
          return;
        }

        if ((req.url || '') === '/api/desktop/lyrics-overlay' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const action = body.action || 'update';
          if (body.state) lastLyricsState = { ...lastLyricsState, ...body.state };
          if (action === 'open') {
            openLyricsOverlay();
          } else if (action === 'close') {
            closeLyricsOverlay();
          } else if (action === 'toggle') {
            if (lyricsOverlayWin && !lyricsOverlayWin.isDestroyed()) closeLyricsOverlay();
            else openLyricsOverlay();
          } else if (action === 'lock') {
            setLyricsOverlayLocked(true);
          } else if (action === 'unlock') {
            setLyricsOverlayLocked(false);
          } else {
            pushLyricsToOverlay(body.state);
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              ok: true,
              open: Boolean(lyricsOverlayWin && !lyricsOverlayWin.isDestroyed()),
              locked: lyricsOverlayLocked,
            }),
          );
          return;
        }

        if ((req.url || '') === '/api/offline/list' && req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(listOfflineTracks()));
          return;
        }

        if ((req.url || '') === '/api/offline/download' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          if (!body?.track?.videoId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Missing track metadata' }));
            return;
          }
          const entry = await downloadTrackOffline(body.track, resolveAudioStream);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, entry }));
          return;
        }

        if ((req.url || '') === '/api/offline/delete' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          deleteOfflineTrack(body.videoId);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if ((req.url || '') === '/api/offline/clear' && req.method === 'POST') {
          clearOfflineTracks();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if ((req.url || '').startsWith('/api/offline/audio')) {
          const parsedOffline = new URL(req.url || '/', 'http://127.0.0.1');
          serveOfflineAudio(req, res, parsedOffline.searchParams.get('videoId') || '');
          return;
        }

        // Social: Discord Rich Presence & Last.fm Scrobbling
        const sendJson = (status, data) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(data));
        };

        if ((req.url || '') === '/api/social/discord/status' && req.method === 'GET') {
          sendJson(200, getDiscordStatus());
          return;
        }
        if ((req.url || '') === '/api/social/discord/update' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const status = await updateDiscordPresence(body);
          sendJson(200, status);
          return;
        }
        if ((req.url || '') === '/api/social/discord/clear' && req.method === 'POST') {
          sendJson(200, clearDiscordPresence());
          return;
        }

        if ((req.url || '') === '/api/social/lastfm/status' && req.method === 'GET') {
          sendJson(200, getLastFmStatus());
          return;
        }
        if ((req.url || '') === '/api/social/lastfm/connect' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          try {
            const status = await connectLastFm(body);
            sendJson(200, status);
          } catch (err) {
            sendJson(400, { error: err?.message || 'Last.fm authentication failed', ...getLastFmStatus() });
          }
          return;
        }
        if ((req.url || '') === '/api/social/lastfm/disconnect' && req.method === 'POST') {
          sendJson(200, disconnectLastFm());
          return;
        }
        if ((req.url || '') === '/api/social/lastfm/now-playing' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          sendJson(200, await updateNowPlaying(body));
          return;
        }
        if ((req.url || '') === '/api/social/lastfm/scrobble' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          sendJson(200, await scrobbleTrack(body));
          return;
        }

        // GitHub Releases Auto-Updater (aayepp/ClaudeWaves-Desktop)
        if ((req.url || '') === '/api/updater/check' && req.method === 'GET') {
          sendJson(200, await checkForUpdates(APP_PKG_VERSION));
          return;
        }
        if ((req.url || '') === '/api/updater/progress' && req.method === 'GET') {
          sendJson(200, getUpdateDownloadProgress());
          return;
        }
        if ((req.url || '') === '/api/updater/download' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const result = await downloadUpdateAsset(
            body.downloadUrl,
            body.assetName,
            app.getPath('downloads'),
          );
          if (body.launch !== false && result.filePath) {
            const openErr = await shell.openPath(result.filePath);
            if (openErr) {
              shell.showItemInFolder(result.filePath);
            }
          }
          sendJson(200, result);
          return;
        }
        if ((req.url || '') === '/api/updater/open-release' && req.method === 'POST') {
          const raw = await readJsonBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const target = typeof body.url === 'string' && body.url.startsWith('https://github.com/aayepp/ClaudeWaves-Desktop')
            ? body.url
            : 'https://github.com/aayepp/ClaudeWaves-Desktop/releases/latest';
          await shell.openExternal(target);
          sendJson(200, { ok: true });
          return;
        }

        if ((req.url || '').startsWith('/api/')) {
          const handled = await handleApiRequest(req, res);
          if (handled) return;
        }

        const parsed = new URL(req.url || '/', 'http://127.0.0.1');
        const relPath = parsed.pathname === '/' ? 'index.html' : parsed.pathname.replace(/^\/+/, '');
        let filePath = path.join(distDir, relPath);
        if (!filePath.startsWith(distDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }
        const ext = path.extname(filePath).toLowerCase();
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err?.message || 'Internal error' }));
        } else if (!res.writableEnded) {
          res.end();
        }
      }
    });

    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          resolve({ server, port: addr.port });
        });
      }
    });

    server.listen(FIXED_LOCAL_PORT, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function createWindow() {
  const userDataDir = app.getPath('userData');
  initOfflineStore(userDataDir);
  initLastFm(userDataDir);
  setWindowMiniHandler(setMiniWindowMode);
  initAuthStore(userDataDir, {
    openYtLogin: openYtLoginWindow,
    openSpotifyLogin: openSpotifyLoginWindow,
    clearYtSession: () => session.fromPartition('persist:ytmusic').clearStorageData(),
    clearSpotifySession: () => session.fromPartition('persist:spotify').clearStorageData(),
  });

  const distDir = path.join(__dirname, '..', 'dist');
  const { server, port } = await startLocalServer(distDir, userDataDir);
  localServer = server;
  currentPort = port;
  initTray(distDir);
  syncGlobalShortcuts();

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'ClaudeWaves Desktop',
    backgroundColor: '#080C1C',
    autoHideMenuBar: true,
    icon: path.join(distDir, 'app_icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  mainWindow.on('close', (e) => {
    if (desktopConfig.closeToTray && !isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
  app.whenReady().then(createWindow);
}

app.on('before-quit', () => {
  isQuitting = true;
  destroyDiscordRpc();
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }
  if (lyricsOverlayWin && !lyricsOverlayWin.isDestroyed()) {
    lyricsOverlayWin.destroy();
    lyricsOverlayWin = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (!desktopConfig.closeToTray || isQuitting) {
    if (localServer) localServer.close();
    if (process.platform !== 'darwin') app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showMainWindow();
});
