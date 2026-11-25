// Authentication (YouTube Music + Spotify) & Playlist Importer for ClaudeWaves Desktop
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const YT_ORIGIN = 'https://music.youtube.com';
const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Spotify Web Player constants (aligned with LastWave Android SpotifyAuthRepository / SpotifyPlaylistImporter)
const SPOTIFY_ORIGIN = 'https://open.spotify.com';
const SPOTIFY_APP_VERSION = '1.2.62.476.g2ad6e7f3';
const SPOTIFY_CLIENT_ID = 'd8a5ed958d274c2e8ee717e6a4b0971d';
const SPOTIFY_CLIENT_TOKEN_URL = 'https://clienttoken.spotify.com/v1/clienttoken';
const SPOTIFY_SECRETS_DICT_URL =
  'https://raw.githubusercontent.com/xyloflake/spot-secrets-go/refs/heads/main/secrets/secretDict.json';
const SPOTIFY_SERVER_TIME_URL = 'https://open.spotify.com/api/server-time';
const SPOTIFY_SESSION_TOKEN_URL = 'https://open.spotify.com/api/token';
const SPOTIFY_PATHFINDER_ENDPOINT = 'https://api-partner.spotify.com/pathfinder/v1/query';
const SPOTIFY_WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SPOTIFY_CLIENT_TOKEN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const DEFAULT_PATHFINDER_HASHES = {
  fetchPlaylist: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
  libraryV3: '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
};
const WEB_PLAYER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EXPIRY_GRACE_MS = 60_000;
const MIN_PERSONAL_TOKEN_LENGTH = 100;

let webPlayerScriptCache = { script: null, readAtMs: 0 };
let webPlayerScriptPromise = null;
let guestSpotifyClientToken = { token: null, expiresAtMs: 0, deviceId: null };

let authStorePath = path.join(os.homedir(), '.claudewaves-desktop', 'auth.json');
let authState = {
  yt: null, // { cookies: Record<string,string>, accountName, handle, photoUrl }
  spotify: null, // { spdc, accessToken, expiresAtMs, clientToken, clientTokenExpiresAtMs, deviceId, displayName, photoUrl }
};

let electronLoginHandlers = {
  openYtLogin: null,
  openSpotifyLogin: null,
  clearYtSession: null,
  clearSpotifySession: null,
};

function initAuthStore(dirPath, handlers = {}) {
  if (dirPath) authStorePath = path.join(dirPath, 'auth.json');
  electronLoginHandlers = { ...electronLoginHandlers, ...handlers };
  loadAuthState();
}

function loadAuthState() {
  try {
    if (fs.existsSync(authStorePath)) {
      const parsed = JSON.parse(fs.readFileSync(authStorePath, 'utf8'));
      authState = { yt: parsed.yt || null, spotify: parsed.spotify || null };
    }
  } catch {
    authState = { yt: null, spotify: null };
  }
}

function saveAuthState() {
  try {
    fs.mkdirSync(path.dirname(authStorePath), { recursive: true });
    fs.writeFileSync(authStorePath, JSON.stringify(authState, null, 2), 'utf8');
  } catch {
    // Ignore disk write errors
  }
}

function getYtAuthHeaders() {
  const yt = authState.yt;
  if (!yt || !yt.cookies || Object.keys(yt.cookies).length === 0) return null;
  const sapisid =
    yt.cookies.SAPISID || yt.cookies['__Secure-3PAPISID'] || yt.cookies.APISID;
  if (!sapisid) return null;

  const ts = Math.floor(Date.now() / 1000);
  const hash = crypto
    .createHash('sha1')
    .update(`${ts} ${sapisid} ${YT_ORIGIN}`)
    .digest('hex');

  const cookieHeader = Object.entries(yt.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  return {
    Cookie: cookieHeader,
    Authorization: `SAPISIDHASH ${ts}_${hash}`,
    'X-Goog-AuthUser': '0',
  };
}

function parseCookieString(raw) {
  const map = {};
  for (const part of String(raw || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k && v) map[k] = v;
  }
  return map;
}

function extractRunsText(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) {
    return node.runs.map((r) => (typeof r?.text === 'string' ? r.text : '')).join('').trim();
  }
  return '';
}

function highResThumb(url, videoId) {
  if (!url) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return url.replace(/=w\d+-h\d+[^&]*/, '=w544-h544-l90-rj');
}

function parseDurationMs(raw) {
  const clean = String(raw || '').trim();
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) return 0;
  const parts = clean.split(':').map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

function findFirstVideoId(node) {
  if (Array.isArray(node)) {
    for (const el of node) {
      const id = findFirstVideoId(el);
      if (id) return id;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (typeof node.watchEndpoint?.videoId === 'string' && node.watchEndpoint.videoId.length === 11) {
    return node.watchEndpoint.videoId;
  }
  for (const v of Object.values(node)) {
    const id = findFirstVideoId(v);
    if (id) return id;
  }
  return null;
}

function parseResponsiveTrack(item) {
  const videoId = item?.playlistItemData?.videoId || findFirstVideoId(item);
  if (!videoId || videoId.length !== 11) return null;
  const cols = Array.isArray(item.flexColumns) ? item.flexColumns : [];
  const title = extractRunsText(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
  if (!title) return null;
  const metaRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const parts = metaRuns
    .map((r) => String(r?.text || '').trim())
    .filter((t) => t && t !== '•' && t !== '·' && !/^song|video$/i.test(t));

  let durationMs = 0;
  const info = [];
  for (const p of parts) {
    const d = parseDurationMs(p);
    if (d > 0 && durationMs === 0) durationMs = d;
    else if (!/plays|views/i.test(p)) info.push(p);
  }
  const fixedCols = Array.isArray(item.fixedColumns) ? item.fixedColumns : [];
  if (durationMs === 0 && fixedCols[0]) {
    durationMs = parseDurationMs(
      extractRunsText(fixedCols[0]?.musicResponsiveListItemFixedColumnRenderer?.text),
    );
  }
  const thumbs = item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbUrl = thumbs[thumbs.length - 1]?.url;

  return {
    videoId,
    title,
    artist: info[0] || 'YouTube Music',
    album: info[1],
    durationMs,
    thumbnailUrl: highResThumb(thumbUrl, videoId),
  };
}

function collectTracksFromNode(node, out) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTracksFromNode(n, out));
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node.musicResponsiveListItemRenderer) {
    const t = parseResponsiveTrack(node.musicResponsiveListItemRenderer);
    if (t) out.push(t);
    return;
  }
  Object.values(node).forEach((v) => collectTracksFromNode(v, out));
}

function findContinuationToken(node) {
  if (Array.isArray(node)) {
    for (const el of node) {
      const tok = findContinuationToken(el);
      if (tok) return tok;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (typeof node.nextContinuationData?.continuation === 'string') {
    return node.nextContinuationData.continuation;
  }
  if (typeof node.continuationEndpoint?.continuationCommand?.token === 'string') {
    return node.continuationEndpoint.continuationCommand.token;
  }
  for (const v of Object.values(node)) {
    const tok = findContinuationToken(v);
    if (tok) return tok;
  }
  return null;
}

async function fetchYtAccountIdentity(postInnerTube) {
  try {
    const root = await postInnerTube('account/account_menu', {});
    const header =
      root?.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer?.header
        ?.activeAccountHeaderRenderer;
    const accountName = extractRunsText(header?.accountName) || 'YouTube Music User';
    const handle = extractRunsText(header?.channelHandle) || undefined;
    const thumbs = header?.accountPhoto?.thumbnails || [];
    const photoUrl = thumbs[thumbs.length - 1]?.url || undefined;
    return { accountName, handle, photoUrl };
  } catch {
    return { accountName: 'YouTube Music User' };
  }
}

async function fetchYtUserPlaylists(postInnerTube) {
  if (!getYtAuthHeaders()) return [];
  const root = await postInnerTube('browse', { browseId: 'FEmusic_liked_playlists' });
  const results = [];
  const seen = new Set();

  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const card = node.musicTwoRowItemRenderer;
    if (card) {
      const browseId = card?.navigationEndpoint?.browseEndpoint?.browseId;
      const title = extractRunsText(card?.title);
      if (browseId && title && !seen.has(browseId) && /^(VL|LM|PL|RD)/.test(browseId)) {
        seen.add(browseId);
        const thumbs = card?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        results.push({
          id: browseId,
          title,
          subtitle: extractRunsText(card?.subtitle) || 'YouTube Music',
          thumbnailUrl: thumbs[thumbs.length - 1]?.url || '',
        });
      }
      return;
    }
    Object.values(node).forEach(walk);
  }
  walk(root);
  return results;
}

async function importYouTubePlaylist(urlOrId, postInnerTube) {
  let raw = String(urlOrId || '').trim();
  if (raw.includes('list=')) {
    raw = raw.split('list=')[1].split('&')[0].split('#')[0];
  } else if (raw.includes('playlist/')) {
    raw = raw.split('playlist/')[1].split('?')[0].split('/')[0];
  }
  if (!raw) throw new Error('Invalid YouTube Music playlist URL or ID');

  const browseId =
    raw === 'LM' || raw === 'VLLM'
      ? 'VLLM'
      : /^(VL|RDCLAK|FE|MPRE|UC)/.test(raw)
        ? raw
        : `VL${raw}`;

  const root = await postInnerTube('browse', { browseId });
  let title =
    extractRunsText(root?.header?.musicDetailHeaderRenderer?.title) ||
    extractRunsText(root?.header?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicDetailHeaderRenderer?.title) ||
    extractRunsText(
      root?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
        ?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer?.title,
    ) ||
    (browseId === 'VLLM' ? 'YouTube Liked Songs' : 'YouTube Playlist');

  const tracks = [];
  collectTracksFromNode(root, tracks);

  let continuation = findContinuationToken(root);
  let pages = 0;
  while (continuation && pages < 5 && tracks.length < 300) {
    pages++;
    try {
      const nextPage = await postInnerTube('browse', { continuation });
      collectTracksFromNode(nextPage, tracks);
      continuation = findContinuationToken(nextPage);
    } catch {
      break;
    }
  }

  const seen = new Set();
  const deduped = tracks.filter((t) => {
    if (seen.has(t.videoId)) return false;
    seen.add(t.videoId);
    return true;
  });

  if (deduped.length === 0) {
    throw new Error('Could not find playable tracks in this YouTube playlist (is it private? Connect YouTube Music first).');
  }
  return { title, source: 'youtube', tracks: deduped };
}

// --- Spotify Web Player TOTP + Client-Token + Pathfinder GraphQL Engine ---

function unescapeJsStringLiteral(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const nxt = raw[i + 1];
      if (nxt === 'n') out += '\n';
      else if (nxt === 'r') out += '\r';
      else if (nxt === 't') out += '\t';
      else out += nxt;
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

function extractOperationHash(script, operation) {
  if (!script || !operation) return null;
  const re = /["'](\w+)["']\s*,\s*["']query["']\s*,\s*["']([0-9a-f]{64})["']/g;
  let m;
  while ((m = re.exec(script)) !== null) {
    if (m[1] === operation) return m[2];
  }
  return null;
}

function extractWebPlayerSecrets(script) {
  if (!script) return [];
  const re = /secret:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,\s*version:\s*(\d+)/g;
  const found = [];
  let m;
  while ((m = re.exec(script)) !== null) {
    const raw = m[1] !== undefined && m[1] !== '' ? m[1] : m[2] || '';
    const version = Number(m[3]);
    if (!raw || !Number.isFinite(version)) continue;
    found.push({ value: unescapeJsStringLiteral(raw), version });
  }
  found.sort((a, b) => b.version - a.version);
  return found;
}

async function getSpotifyWebPlayerScript(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    webPlayerScriptCache.script &&
    webPlayerScriptCache.readAtMs > 0 &&
    now - webPlayerScriptCache.readAtMs < WEB_PLAYER_CACHE_TTL_MS
  ) {
    return webPlayerScriptCache.script;
  }
  if (!forceRefresh && webPlayerScriptPromise) return webPlayerScriptPromise;

  const loader = (async () => {
    try {
      const pageRes = await fetch(`${SPOTIFY_ORIGIN}/`, {
        headers: { 'User-Agent': SPOTIFY_WEB_UA, Referer: `${SPOTIFY_ORIGIN}/` },
      });
      if (!pageRes.ok) return null;
      const html = await pageRes.text();
      const bundleRe = /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/[A-Za-z0-9._~-]+\.(?:js|mjs)/g;
      const bundles = Array.from(new Set(html.match(bundleRe) || [])).slice(0, 4);
      for (const bundleUrl of bundles) {
        try {
          const bRes = await fetch(bundleUrl, {
            headers: { 'User-Agent': SPOTIFY_WEB_UA, Referer: `${SPOTIFY_ORIGIN}/` },
          });
          if (!bRes.ok) continue;
          const body = await bRes.text();
          if (
            extractOperationHash(body, 'fetchPlaylist') ||
            extractOperationHash(body, 'libraryV3') ||
            extractWebPlayerSecrets(body).length > 0
          ) {
            webPlayerScriptCache = { script: body, readAtMs: Date.now() };
            return body;
          }
        } catch {
          // Try next bundle
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      webPlayerScriptPromise = null;
    }
  })();

  webPlayerScriptPromise = loader;
  return loader;
}

async function readPublishedSpotifySecret() {
  try {
    const res = await fetch(SPOTIFY_SECRETS_DICT_URL, {
      headers: { 'User-Agent': SPOTIFY_WEB_UA },
    });
    if (!res.ok) return null;
    const map = await res.json();
    const versions = Object.keys(map || {})
      .map((k) => Number(k))
      .filter(Number.isFinite)
      .sort((a, b) => b - a);
    if (versions.length === 0) return null;
    const latestVersion = versions[0];
    const cipherBytes = map[String(latestVersion)];
    if (!Array.isArray(cipherBytes) || cipherBytes.length === 0) return null;
    return {
      value: String.fromCharCode(...cipherBytes),
      version: latestVersion,
    };
  } catch {
    return null;
  }
}

async function readLatestSpotifySecret() {
  const script = await getSpotifyWebPlayerScript(false);
  const fromPlayer = extractWebPlayerSecrets(script);
  if (fromPlayer.length > 0) return fromPlayer[0];
  return readPublishedSpotifySecret();
}

function decodeSpotifySecretKey(secretValue) {
  let digits = '';
  for (let i = 0; i < secretValue.length; i++) {
    digits += String(secretValue.charCodeAt(i) ^ ((i % 33) + 9));
  }
  return Buffer.from(digits, 'ascii');
}

function generateSpotifyOtp(secretKeyBytes, timestampSeconds) {
  const counter = BigInt(Math.floor(Number(timestampSeconds) / 30));
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(counter, 0);

  const hmacResult = crypto.createHmac('sha1', secretKeyBytes).update(counterBuf).digest();
  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const binary =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

function isUsablePersonalToken(data) {
  return Boolean(
    data &&
      data.isAnonymous !== true &&
      typeof data.accessToken === 'string' &&
      data.accessToken.length >= MIN_PERSONAL_TOKEN_LENGTH,
  );
}

async function requestSpotifyPersonalToken(spdc, totp, reason) {
  const tokenUrl =
    `${SPOTIFY_SESSION_TOKEN_URL}?reason=${reason}&productType=web-player` +
    `&totp=${totp.otpClient}&totpServer=${totp.otpServer}&totpVer=${totp.version}`;

  const res = await fetch(tokenUrl, {
    headers: {
      'User-Agent': SPOTIFY_WEB_UA,
      Accept: 'application/json',
      Cookie: `sp_dc=${spdc}`,
      'App-platform': 'WebPlayer',
      'Spotify-App-Version': SPOTIFY_APP_VERSION,
      Origin: SPOTIFY_ORIGIN,
      Referer: `${SPOTIFY_ORIGIN}/`,
    },
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function refreshSpotifyAccessToken(spdc) {
  const secret = await readLatestSpotifySecret();
  if (!secret) throw new Error('Could not obtain Spotify TOTP secret');

  const secretKeyBytes = decodeSpotifySecretKey(secret.value);
  let serverTimeSeconds = Math.floor(Date.now() / 1000);
  try {
    const timeRes = await fetch(SPOTIFY_SERVER_TIME_URL, {
      headers: {
        'User-Agent': SPOTIFY_WEB_UA,
        Cookie: `sp_dc=${spdc}`,
        'App-platform': 'WebPlayer',
        'Spotify-App-Version': SPOTIFY_APP_VERSION,
        Origin: SPOTIFY_ORIGIN,
        Referer: `${SPOTIFY_ORIGIN}/`,
        Accept: 'application/json',
      },
    });
    if (timeRes.ok) {
      const td = await timeRes.json();
      if (typeof td?.serverTime === 'number') serverTimeSeconds = td.serverTime;
    }
  } catch {
    // Fallback to local clock
  }

  const clientTimeSeconds = Math.floor(Date.now() / 1000);
  const totp = {
    otpClient: generateSpotifyOtp(secretKeyBytes, clientTimeSeconds),
    otpServer: generateSpotifyOtp(secretKeyBytes, serverTimeSeconds),
    version: secret.version,
  };

  const transport = await requestSpotifyPersonalToken(spdc, totp, 'transport');
  const chosen = isUsablePersonalToken(transport)
    ? transport
    : await requestSpotifyPersonalToken(spdc, totp, 'init');

  if (!isUsablePersonalToken(chosen)) {
    throw new Error('Spotify session expired or invalid sp_dc cookie');
  }

  return {
    accessToken: chosen.accessToken,
    expiresAtMs: Number(chosen.accessTokenExpirationTimestampMs || Date.now() + 3600_000),
  };
}

function getOrCreateSpotifyDeviceId() {
  if (authState.spotify) {
    if (!authState.spotify.deviceId) {
      authState.spotify.deviceId = crypto.randomUUID().replace(/-/g, '');
      saveAuthState();
    }
    return authState.spotify.deviceId;
  }
  if (!guestSpotifyClientToken.deviceId) {
    guestSpotifyClientToken.deviceId = crypto.randomUUID().replace(/-/g, '');
  }
  return guestSpotifyClientToken.deviceId;
}

async function getSpotifyClientToken() {
  const now = Date.now();
  if (authState.spotify?.clientToken && authState.spotify.clientTokenExpiresAtMs - now > EXPIRY_GRACE_MS) {
    return authState.spotify.clientToken;
  }
  if (!authState.spotify && guestSpotifyClientToken.token && guestSpotifyClientToken.expiresAtMs - now > EXPIRY_GRACE_MS) {
    return guestSpotifyClientToken.token;
  }

  const deviceId = getOrCreateSpotifyDeviceId();
  try {
    const res = await fetch(SPOTIFY_CLIENT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'User-Agent': SPOTIFY_CLIENT_TOKEN_UA,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_data: {
          client_version: SPOTIFY_APP_VERSION,
          client_id: SPOTIFY_CLIENT_ID,
          js_sdk_data: {
            device_brand: 'Apple',
            device_model: 'unknown',
            os: 'macos',
            os_version: '10.15.7',
            device_id: deviceId,
            device_type: 'computer',
          },
        },
      }),
    });
    if (!res.ok) return authState.spotify?.clientToken || guestSpotifyClientToken.token || null;
    const data = await res.json();
    const token = data?.granted_token?.token;
    if (token) {
      const expiresAfterSec = Number(data?.granted_token?.expires_after_seconds || 7200);
      const expiresAtMs = Date.now() + expiresAfterSec * 1000;
      if (authState.spotify) {
        authState.spotify.clientToken = token;
        authState.spotify.clientTokenExpiresAtMs = expiresAtMs;
        saveAuthState();
      } else {
        guestSpotifyClientToken.token = token;
        guestSpotifyClientToken.expiresAtMs = expiresAtMs;
      }
      return token;
    }
  } catch {
    // Return any stale fallback
  }
  return authState.spotify?.clientToken || guestSpotifyClientToken.token || null;
}

async function getValidSpotifyToken() {
  const sp = authState.spotify;
  if (!sp) return null;
  if (sp.accessToken && sp.expiresAtMs && sp.expiresAtMs - Date.now() > EXPIRY_GRACE_MS) {
    return sp.accessToken;
  }
  if (!sp.spdc) return null;
  try {
    const fresh = await refreshSpotifyAccessToken(sp.spdc);
    authState.spotify = { ...sp, ...fresh };
    saveAuthState();
    return fresh.accessToken;
  } catch {
    return null;
  }
}

async function getPathfinderHash(operation, forceRefresh = false) {
  const script = await getSpotifyWebPlayerScript(forceRefresh);
  return extractOperationHash(script, operation) || DEFAULT_PATHFINDER_HASHES[operation] || null;
}

async function pathfinderGet(operation, variablesObj, token, clientToken) {
  let hash = await getPathfinderHash(operation, false);
  if (!hash) return null;

  let refreshedHash = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const variables = JSON.stringify(variablesObj);
    const extensions = JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } });
    const url =
      `${SPOTIFY_PATHFINDER_ENDPOINT}?operationName=${encodeURIComponent(operation)}` +
      `&variables=${encodeURIComponent(variables)}&extensions=${encodeURIComponent(extensions)}`;

    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': SPOTIFY_WEB_UA,
      Accept: 'application/json',
      'App-platform': 'WebPlayer',
      'Spotify-App-Version': SPOTIFY_APP_VERSION,
      Origin: SPOTIFY_ORIGIN,
      Referer: `${SPOTIFY_ORIGIN}/`,
    };
    if (clientToken) headers['Client-Token'] = clientToken;

    let retry = false;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const json = await res.json();
        const rawErr = JSON.stringify(json?.errors || '');
        if (!refreshedHash && rawErr.includes('PersistedQueryNotFound')) {
          refreshedHash = true;
          const nextHash = await getPathfinderHash(operation, true);
          if (nextHash && nextHash !== hash) {
            hash = nextHash;
            continue;
          }
        }
        return json;
      }
      retry = res.status === 429 || res.status >= 500;
    } catch {
      retry = true;
    }
    if (!retry) return null;
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  return null;
}

async function fetchSpotifyProfile(token) {
  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': SPOTIFY_WEB_UA },
    });
    if (res.ok) {
      const me = await res.json();
      return {
        displayName: me.display_name || me.id || 'Spotify User',
        photoUrl: me.images?.[0]?.url || undefined,
      };
    }
  } catch {
    // Fallback below
  }
  return { displayName: 'Spotify User' };
}

function parseLibraryV3Playlists(root) {
  const lib = root?.data?.me?.libraryV3;
  const items = lib?.items || [];
  const totalCount = Number(lib?.totalCount ?? items.length);
  const out = [];
  for (const entry of items) {
    const itemWrapper = entry?.item;
    const plData = itemWrapper?.data;
    const typename = itemWrapper?.__typename || plData?.__typename;
    if (typename !== 'PlaylistResponseWrapper') continue;
    const uri = plData?.uri;
    if (typeof uri !== 'string' || !uri.startsWith('spotify:playlist:')) continue;
    const id = uri.slice('spotify:playlist:'.length);
    if (!id) continue;

    const img = plData?.images?.items?.[0]?.sources?.[0]?.url || '';
    const countRaw =
      plData?.content?.totalCount ??
      plData?.tracks?.totalCount ??
      plData?.tracks?.total ??
      plData?.totalCount;
    const trackCount = typeof countRaw === 'number' ? countRaw : null;
    const ownerName = plData?.ownerV2?.data?.name || 'Spotify';

    out.push({
      id,
      title: plData?.name || 'Spotify Playlist',
      trackCount,
      ownerName,
      thumbnailUrl: img,
      url: `https://open.spotify.com/playlist/${id}`,
    });
  }
  return { items: out, totalCount };
}

function formatSpotifySubtitle(trackCount, ownerName) {
  const countLabel = typeof trackCount === 'number' ? `${trackCount} tracks` : 'Playlist';
  return `${countLabel} • ${ownerName || 'Spotify'}`;
}

async function fetchSpotifyUserPlaylists() {
  const token = await getValidSpotifyToken();
  if (!token) return [];
  const clientToken = await getSpotifyClientToken();

  // Primary: Pathfinder libraryV3 (mirrors SpotifyPlaylistImporter.fetchUserPlaylists)
  try {
    const collected = [];
    const seen = new Set();
    let offset = 0;
    let totalCount = Infinity;

    for (let page = 0; page < 4 && offset < totalCount; page++) {
      const root = await pathfinderGet(
        'libraryV3',
        {
          filters: ['Playlists'],
          order: null,
          textFilter: null,
          features: [],
          limit: 50,
          offset,
          flatten: false,
          expandedFolders: [],
          folderUri: null,
          includeFoldersWhenFlattening: true,
        },
        token,
        clientToken,
      );
      if (!root) break;
      const parsed = parseLibraryV3Playlists(root);
      totalCount = parsed.totalCount;
      const rawLen = root?.data?.me?.libraryV3?.items?.length || 0;
      for (const pl of parsed.items) {
        if (!seen.has(pl.id)) {
          seen.add(pl.id);
          collected.push(pl);
        }
      }
      if (rawLen === 0) break;
      offset += rawLen;
    }

    if (collected.length > 0) {
      // Fill missing track counts with bounded concurrency (matches Android libraryV3 fix)
      const missing = collected.filter((p) => p.trackCount === null);
      const concurrency = 5;
      for (let i = 0; i < missing.length; i += concurrency) {
        await Promise.all(
          missing.slice(i, i + concurrency).map(async (pl) => {
            try {
              const info = await pathfinderGet(
                'fetchPlaylist',
                {
                  uri: `spotify:playlist:${pl.id}`,
                  offset: 0,
                  limit: 1,
                  enableWatchFeedEntrypoint: false,
                },
                token,
                clientToken,
              );
              const total = info?.data?.playlistV2?.content?.totalCount;
              if (typeof total === 'number') pl.trackCount = total;
            } catch {
              // Keep optional count empty
            }
          }),
        );
      }

      return collected.map((pl) => ({
        id: pl.id,
        title: pl.title,
        subtitle: formatSpotifySubtitle(pl.trackCount, pl.ownerName),
        thumbnailUrl: pl.thumbnailUrl,
        url: pl.url,
      }));
    }
  } catch {
    // Fall through to Web API fallback
  }

  // Secondary: Spotify REST Web API fallback
  try {
    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': SPOTIFY_WEB_UA },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((pl) => ({
      id: pl.id,
      title: pl.name || 'Spotify Playlist',
      subtitle: `${pl.tracks?.total ?? 0} tracks • ${pl.owner?.display_name || 'Spotify'}`,
      thumbnailUrl: pl.images?.[0]?.url || '',
      url: `https://open.spotify.com/playlist/${pl.id}`,
    }));
  } catch {
    return [];
  }
}

function unescapeHtml(str) {
  return String(str || '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanSpotifyText(str) {
  return String(str || '').replace(/\u00a0/g, ' ').trim();
}

function extractSpotifyPlaylistId(input) {
  const clean = String(input || '').trim();
  const m = clean.match(/playlist[/:]([A-Za-z0-9]{10,32})/);
  return m ? m[1] : null;
}

async function fetchPlaylistViaPathfinder(id, token, clientToken) {
  const rows = [];
  let title = 'Spotify Playlist';
  let offset = 0;
  let totalCount = Infinity;

  for (let page = 0; page < 10 && offset < totalCount; page++) {
    const root = await pathfinderGet(
      'fetchPlaylist',
      {
        uri: `spotify:playlist:${id}`,
        offset,
        limit: 100,
        enableWatchFeedEntrypoint: false,
      },
      token,
      clientToken,
    );
    const playlist = root?.data?.playlistV2;
    if (!playlist) break;

    if (page === 0 && playlist.name) {
      title = cleanSpotifyText(playlist.name) || title;
    }
    const content = playlist.content;
    totalCount = Number(content?.totalCount ?? 0);
    const items = content?.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      const trackData = item?.itemV2?.data || item?.track;
      const name = cleanSpotifyText(trackData?.name);
      if (!name) continue;
      const artistItems = trackData?.artists?.items || [];
      const artist = artistItems
        .map((art) => cleanSpotifyText(art?.profile?.name || art?.name))
        .filter(Boolean)
        .join(', ');
      const album = cleanSpotifyText(trackData?.albumOfTrack?.name || trackData?.album?.name) || undefined;
      rows.push({ title: name, artist, album });
    }

    offset += items.length;
  }

  return rows.length > 0 ? { title, rows } : null;
}

async function fetchSpotifyTrackRows(urlOrId) {
  let input = String(urlOrId || '').trim();
  if (input.includes('spotify.link')) {
    try {
      const resp = await fetch(input, { method: 'HEAD', redirect: 'follow' });
      input = resp.url || input;
    } catch {
      try {
        const resp = await fetch(input, { redirect: 'follow' });
        input = resp.url || input;
      } catch {
        // Keep original
      }
    }
  }
  const id = extractSpotifyPlaylistId(input);
  if (!id) throw new Error('Invalid Spotify playlist link');

  const token = await getValidSpotifyToken();
  const clientToken = token ? await getSpotifyClientToken() : null;

  // 1. Authenticated Pathfinder GraphQL (supports public, private & up to 1000 tracks)
  if (token) {
    try {
      const pf = await fetchPlaylistViaPathfinder(id, token, clientToken);
      if (pf && pf.rows.length > 0) return pf;
    } catch {
      // Fall through
    }

    // 2. Authenticated Spotify REST Web API fallback
    try {
      const metaRes = await fetch(
        `https://api.spotify.com/v1/playlists/${id}?fields=name,tracks(items(track(name,artists(name),album(name))),next)`,
        { headers: { Authorization: `Bearer ${token}`, 'User-Agent': SPOTIFY_WEB_UA } },
      );
      if (metaRes.ok) {
        const pl = await metaRes.json();
        const rows = [];
        const addItems = (items) => {
          for (const it of items || []) {
            const tr = it?.track;
            if (!tr?.name) continue;
            const artist = (tr.artists || []).map((a) => cleanSpotifyText(a.name)).filter(Boolean).join(', ');
            rows.push({
              title: cleanSpotifyText(tr.name),
              artist,
              album: cleanSpotifyText(tr.album?.name) || undefined,
            });
          }
        };
        addItems(pl.tracks?.items);
        let nextUrl = pl.tracks?.next;
        let pages = 0;
        while (nextUrl && pages < 9 && rows.length < 1000) {
          pages++;
          const nr = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': SPOTIFY_WEB_UA },
          });
          if (!nr.ok) break;
          const nd = await nr.json();
          addItems(nd.items);
          nextUrl = nd.next;
        }
        if (rows.length > 0) {
          return { title: cleanSpotifyText(pl.name) || 'Spotify Playlist', rows };
        }
      }
    } catch {
      // Fall through to embed scraper
    }
  }

  // 3. Public embed page fallback (__NEXT_DATA__)
  const embedRes = await fetch(`${SPOTIFY_ORIGIN}/embed/playlist/${id}`, {
    headers: { 'User-Agent': SPOTIFY_WEB_UA, Accept: 'text/html' },
  });
  if (!embedRes.ok) {
    throw new Error(`Could not read Spotify playlist (HTTP ${embedRes.status}). If private, connect Spotify first.`);
  }
  const html = await embedRes.text();
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!nextDataMatch) throw new Error('Could not parse Spotify playlist page');
  const root = JSON.parse(unescapeHtml(nextDataMatch[1]));

  let title = 'Spotify Playlist';
  const rows = [];
  const seen = new Set();

  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.uri === 'string' && typeof node.title === 'string') {
      if (node.uri.startsWith('spotify:playlist:') && title === 'Spotify Playlist') {
        title = cleanSpotifyText(node.title) || title;
      } else if (node.uri.startsWith('spotify:track:') && !seen.has(node.uri)) {
        seen.add(node.uri);
        rows.push({
          title: cleanSpotifyText(node.title),
          artist: cleanSpotifyText(node.subtitle),
        });
      }
    }
    Object.values(node).forEach(walk);
  }
  walk(root);

  if (rows.length === 0) {
    throw new Error('No tracks found in this Spotify playlist.');
  }
  return { title, rows };
}

async function fetchSpotifyLikedSongs() {
  const token = await getValidSpotifyToken();
  if (!token) {
    throw new Error('Connect Spotify in Settings first to sync Spotify Liked Songs.');
  }
  const clientToken = await getSpotifyClientToken();
  const rows = [];
  let offset = 0;
  let totalCount = Infinity;

  for (let page = 0; page < 20 && offset < totalCount; page++) {
    const root = await pathfinderGet(
      'fetchLibraryTracks',
      { offset, limit: 50 },
      token,
      clientToken,
    );
    const tracksObj = root?.data?.me?.library?.tracks;
    if (!tracksObj) break;

    totalCount = Number(tracksObj.totalCount ?? 0);
    const items = tracksObj.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      const trackObj = item?.track?.data || item?.track;
      const name = cleanSpotifyText(trackObj?.name);
      if (!name) continue;
      const artistItems = trackObj?.artists?.items || [];
      const artist = artistItems
        .map((art) => cleanSpotifyText(art?.profile?.name || art?.name))
        .filter(Boolean)
        .join(', ');
      const album = cleanSpotifyText(trackObj?.albumOfTrack?.name || trackObj?.album?.name) || undefined;
      rows.push({ title: name, artist, album });
    }
    offset += items.length;
  }

  if (rows.length === 0) {
    throw new Error('No Spotify Liked Songs found (try reconnecting Spotify if session expired).');
  }
  return { title: 'Spotify Liked Songs', rows };
}

function normalizeMatchText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff\u3040-\u30ff\u4e00-\u9faf\uac00-\ud7af]+/g, ' ')
    .trim();
}

function pickBestInnerTubeCandidate(row, candidates) {
  if (!candidates || candidates.length === 0) return null;
  const targetTitle = normalizeMatchText(row.title);
  const firstArtist = normalizeMatchText(String(row.artist || '').split(',')[0]);
  let best = candidates[0];
  let bestScore = -1;

  for (const cand of candidates.slice(0, 4)) {
    let score = 0;
    const cTitle = normalizeMatchText(cand.title);
    const cArtist = normalizeMatchText(cand.artist);
    if (cTitle === targetTitle) score += 4;
    else if (cTitle.includes(targetTitle) || targetTitle.includes(cTitle)) score += 2;
    if (firstArtist && (cArtist.includes(firstArtist) || firstArtist.includes(cArtist))) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

async function matchRowsToYouTube(rows, postInnerTube, maxTracks = 500) {
  const uniqueRows = [];
  const seenKeys = new Set();
  for (const row of rows || []) {
    const cleanTitle = cleanSpotifyText(row?.title);
    const cleanArtist = cleanSpotifyText(row?.artist);
    if (!cleanTitle) continue;
    const key = `${normalizeMatchText(cleanTitle)}|${normalizeMatchText(cleanArtist)}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueRows.push({
      title: cleanTitle,
      artist: cleanArtist,
      album: row?.album ? cleanSpotifyText(row.album) : undefined,
    });
  }

  const limited = uniqueRows.slice(0, maxTracks);
  const matched = [];
  const concurrency = 6;

  for (let i = 0; i < limited.length; i += concurrency) {
    const batch = limited.slice(i, i + concurrency);
    const settled = await Promise.all(
      batch.map(async (row) => {
        try {
          const q = `${row.title} ${row.artist}`.trim();
          const res = await postInnerTube('search', {
            query: q,
            params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
          });
          const found = [];
          collectTracksFromNode(res, found);
          const pick = pickBestInnerTubeCandidate(row, found);
          if (!pick) return null;
          return row.album && !pick.album ? { ...pick, album: row.album } : pick;
        } catch {
          return null;
        }
      }),
    );
    for (const tr of settled) {
      if (tr) matched.push(tr);
    }
  }

  const seenIds = new Set();
  const deduped = matched.filter((t) => {
    if (seenIds.has(t.videoId)) return false;
    seenIds.add(t.videoId);
    return true;
  });

  if (deduped.length === 0) {
    throw new Error('Could not match tracks on YouTube Music.');
  }
  return {
    tracks: deduped,
    matchedCount: deduped.length,
    totalSourceTracks: uniqueRows.length,
  };
}

async function importSpotifyPlaylist(urlOrId, postInnerTube) {
  const { title, rows } = await fetchSpotifyTrackRows(urlOrId);
  const matched = await matchRowsToYouTube(rows, postInnerTube, 500);
  return {
    title,
    source: 'spotify',
    ...matched,
  };
}

async function importSpotifyLikedSongs(postInnerTube) {
  const { title, rows } = await fetchSpotifyLikedSongs();
  const matched = await matchRowsToYouTube(rows, postInnerTube, 500);
  return {
    title,
    source: 'spotify',
    ...matched,
  };
}

// --- Exportify / Spotify CSV Parser & Importer ---

function detectCsvDelimiter(text) {
  const firstLine = (String(text || '').split(/\r?\n/).find((l) => l.trim().length > 0)) || '';
  let comma = 0;
  let semi = 0;
  let tab = 0;
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ',') comma++;
      else if (ch === ';') semi++;
      else if (ch === '\t') tab++;
    }
  }
  if (tab > comma && tab >= semi) return '\t';
  if (semi > comma) return ';';
  return ',';
}

function parseRfc4180Csv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.length === 0) {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function normalizeCsvHeader(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvTracks(csvText, fileName = 'Imported Playlist') {
  const cleanText = String(csvText || '').replace(/^\uFEFF/, '').trim();
  if (!cleanText) throw new Error('CSV file is empty.');

  const delimiter = detectCsvDelimiter(cleanText);
  const grid = parseRfc4180Csv(cleanText, delimiter);
  if (grid.length === 0) throw new Error('No rows found in CSV file.');

  const TITLE_ALIASES = new Set(['track name', 'song', 'title', 'name', 'track', 'track title', 'song name']);
  const ARTIST_ALIASES = new Set(['artist name s', 'artist names', 'artists', 'artist', 'artist name', 'author', 'singer']);
  const ALBUM_ALIASES = new Set(['album name', 'album', 'record']);

  const firstHeaders = grid[0].map(normalizeCsvHeader);
  let titleIdx = firstHeaders.findIndex((h) => TITLE_ALIASES.has(h));
  let artistIdx = firstHeaders.findIndex((h) => ARTIST_ALIASES.has(h));
  const albumIdx = firstHeaders.findIndex((h) => ALBUM_ALIASES.has(h));

  let startRow = 1;
  if (titleIdx === -1) {
    // Fallback for Exportify variants or headerless Title,Artist CSVs
    titleIdx = firstHeaders.findIndex((h) => h.includes('track') && h.includes('name'));
    if (artistIdx === -1) {
      artistIdx = firstHeaders.findIndex((h) => h.includes('artist'));
    }
    if (titleIdx === -1) {
      titleIdx = 0;
      artistIdx = grid[0].length > 1 ? 1 : -1;
      startRow = 0;
    }
  }

  const rows = [];
  for (let i = startRow; i < grid.length; i++) {
    const cols = grid[i];
    const title = cleanSpotifyText(cols[titleIdx]);
    if (!title) continue;
    const rawArtist = artistIdx >= 0 ? cleanSpotifyText(cols[artistIdx]) : '';
    const artist = rawArtist.replace(/\s*;\s*/g, ', ');
    const album = albumIdx >= 0 ? cleanSpotifyText(cols[albumIdx]) || undefined : undefined;
    rows.push({ title, artist, album });
  }

  if (rows.length === 0) {
    throw new Error('Could not find track titles in this CSV file.');
  }

  const suggestedTitle =
    String(fileName || '')
      .replace(/\.(csv|txt)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Imported CSV Playlist';

  return { title: suggestedTitle, rows };
}

async function importCsvPlaylist({ csvText, title, fileName }, postInnerTube) {
  const parsed = parseCsvTracks(csvText, fileName || title || 'Imported CSV Playlist');
  const finalTitle = String(title || '').trim() || parsed.title;
  const matched = await matchRowsToYouTube(parsed.rows, postInnerTube, 500);
  return {
    title: finalTitle,
    source: 'spotify',
    ...matched,
  };
}

function getPublicAuthStatus() {
  return {
    yt: authState.yt
      ? {
          connected: true,
          accountName: authState.yt.accountName,
          handle: authState.yt.handle,
          photoUrl: authState.yt.photoUrl,
        }
      : { connected: false },
    spotify: authState.spotify
      ? {
          connected: true,
          displayName: authState.spotify.displayName,
          photoUrl: authState.spotify.photoUrl,
        }
      : { connected: false },
    nativeLoginAvailable: Boolean(electronLoginHandlers.openYtLogin),
  };
}

async function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) {
      throw new Error('Request payload exceeds 15 MB limit.');
    }
    chunks.push(c);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function handleAuthAndImportRequest(req, res, postInnerTube) {
  const parsed = new URL(req.url || '/', 'http://127.0.0.1');

  if (parsed.pathname === '/api/auth/status') {
    sendJson(res, 200, getPublicAuthStatus());
    return true;
  }

  if (parsed.pathname === '/api/auth/yt/login' && req.method === 'POST') {
    const body = await readJsonBody(req);
    let cookies = null;
    if (body.cookieHeader) {
      cookies = parseCookieString(body.cookieHeader);
    } else if (electronLoginHandlers.openYtLogin) {
      cookies = await electronLoginHandlers.openYtLogin();
    } else {
      sendJson(res, 400, { error: 'Paste cookie header or run inside ClaudeWaves Desktop app for 1-click Google login.' });
      return true;
    }

    if (!cookies || (!cookies.SAPISID && !cookies['__Secure-3PAPISID'] && !cookies.APISID)) {
      sendJson(res, 400, { error: 'Sign-in cancelled or missing YouTube session cookies.' });
      return true;
    }

    authState.yt = { cookies, accountName: 'YouTube Music User' };
    const identity = await fetchYtAccountIdentity(postInnerTube);
    authState.yt = { cookies, ...identity };
    saveAuthState();
    sendJson(res, 200, getPublicAuthStatus());
    return true;
  }

  if (parsed.pathname === '/api/auth/yt/logout' && req.method === 'POST') {
    authState.yt = null;
    saveAuthState();
    if (electronLoginHandlers.clearYtSession) {
      await electronLoginHandlers.clearYtSession().catch(() => {});
    }
    sendJson(res, 200, getPublicAuthStatus());
    return true;
  }

  if (parsed.pathname === '/api/auth/spotify/login' && req.method === 'POST') {
    const body = await readJsonBody(req);
    let spdc = String(body.spdc || '').trim();
    let capturedToken = null;
    let capturedClientToken = null;
    if (!spdc && electronLoginHandlers.openSpotifyLogin) {
      const result = await electronLoginHandlers.openSpotifyLogin();
      spdc = result?.spdc || '';
      capturedToken = result?.accessToken || null;
      capturedClientToken = result?.clientToken || null;
    } else if (!spdc) {
      sendJson(res, 400, { error: 'Provide sp_dc cookie or run inside ClaudeWaves Desktop app for 1-click Spotify login.' });
      return true;
    }

    if (!spdc) {
      sendJson(res, 400, { error: 'Spotify login cancelled or sp_dc cookie not found.' });
      return true;
    }

    let tokenObj =
      capturedToken && capturedToken.length >= MIN_PERSONAL_TOKEN_LENGTH
        ? { accessToken: capturedToken, expiresAtMs: Date.now() + 3000_000 }
        : null;
    if (!tokenObj) {
      try {
        tokenObj = await refreshSpotifyAccessToken(spdc);
      } catch {
        tokenObj = { accessToken: null, expiresAtMs: 0 };
      }
    }

    const profile = tokenObj.accessToken
      ? await fetchSpotifyProfile(tokenObj.accessToken)
      : { displayName: 'Spotify Connected' };

    authState.spotify = {
      spdc,
      accessToken: tokenObj.accessToken,
      expiresAtMs: tokenObj.expiresAtMs,
      clientToken: capturedClientToken || undefined,
      clientTokenExpiresAtMs: capturedClientToken ? Date.now() + 3600_000 : 0,
      deviceId: authState.spotify?.deviceId || crypto.randomUUID().replace(/-/g, ''),
      ...profile,
    };
    saveAuthState();
    sendJson(res, 200, getPublicAuthStatus());
    return true;
  }

  if (parsed.pathname === '/api/auth/spotify/logout' && req.method === 'POST') {
    authState.spotify = null;
    saveAuthState();
    if (electronLoginHandlers.clearSpotifySession) {
      await electronLoginHandlers.clearSpotifySession().catch(() => {});
    }
    sendJson(res, 200, getPublicAuthStatus());
    return true;
  }

  if (parsed.pathname === '/api/yt/my-playlists') {
    const playlists = await fetchYtUserPlaylists(postInnerTube);
    sendJson(res, 200, { playlists });
    return true;
  }

  if (parsed.pathname === '/api/spotify/my-playlists') {
    const playlists = await fetchSpotifyUserPlaylists();
    sendJson(res, 200, { playlists });
    return true;
  }

  if (parsed.pathname === '/api/spotify/import-liked' && req.method === 'POST') {
    const result = await importSpotifyLikedSongs(postInnerTube);
    sendJson(res, 200, result);
    return true;
  }

  if (parsed.pathname === '/api/import/csv' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const result = await importCsvPlaylist(
      { csvText: body.csvText, title: body.title, fileName: body.fileName },
      postInnerTube,
    );
    sendJson(res, 200, result);
    return true;
  }

  if (parsed.pathname === '/api/import/playlist' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const url = String(body.url || '').trim();
    if (!url) {
      sendJson(res, 400, { error: 'Paste a YouTube Music or Spotify playlist URL.' });
      return true;
    }
    if (url === 'spotify:liked') {
      const result = await importSpotifyLikedSongs(postInnerTube);
      sendJson(res, 200, result);
      return true;
    }
    const isSpotify = url.includes('spotify.com') || url.includes('spotify.link') || url.startsWith('spotify:playlist:');
    const result = isSpotify
      ? await importSpotifyPlaylist(url, postInnerTube)
      : await importYouTubePlaylist(url, postInnerTube);
    sendJson(res, 200, result);
    return true;
  }

  return false;
}

loadAuthState();

module.exports = {
  initAuthStore,
  getYtAuthHeaders,
  handleAuthAndImportRequest,
  parseCsvTracks,
  generateSpotifyOtp,
  decodeSpotifySecretKey,
};
