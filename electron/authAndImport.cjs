// Authentication (YouTube Music + Spotify) & Playlist Importer for ClaudeWaves Desktop
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const YT_ORIGIN = 'https://music.youtube.com';
const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let authStorePath = path.join(os.homedir(), '.claudewaves-desktop', 'auth.json');
let authState = {
  yt: null, // { cookies: Record<string,string>, accountName, handle, photoUrl }
  spotify: null, // { spdc, accessToken, expiresAtMs, displayName, photoUrl }
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

// --- Spotify Auth & Importer ---

async function refreshSpotifyAccessToken(spdc) {
  const res = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
    headers: {
      Cookie: `sp_dc=${spdc}`,
      'User-Agent': WEB_UA,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Spotify token HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.accessToken || data?.isAnonymous) {
    throw new Error('Spotify session expired or invalid sp_dc cookie');
  }
  return {
    accessToken: data.accessToken,
    expiresAtMs: Number(data.accessTokenExpirationTimestampMs || Date.now() + 3000_000),
  };
}

async function getValidSpotifyToken() {
  const sp = authState.spotify;
  if (!sp) return null;
  if (sp.accessToken && sp.expiresAtMs && sp.expiresAtMs - Date.now() > 60_000) {
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

async function fetchSpotifyProfile(token) {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': WEB_UA },
  });
  if (!res.ok) return { displayName: 'Spotify User' };
  const me = await res.json();
  return {
    displayName: me.display_name || me.id || 'Spotify User',
    photoUrl: me.images?.[0]?.url || undefined,
  };
}

async function fetchSpotifyUserPlaylists() {
  const token = await getValidSpotifyToken();
  if (!token) return [];
  const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': WEB_UA },
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
}

function unescapeHtml(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractSpotifyPlaylistId(input) {
  const clean = String(input || '').trim();
  const m = clean.match(/playlist[/:]([A-Za-z0-9]{10,32})/);
  return m ? m[1] : null;
}

async function fetchSpotifyTrackRows(urlOrId) {
  let input = String(urlOrId || '').trim();
  if (input.includes('spotify.link')) {
    try {
      const resp = await fetch(input, { method: 'HEAD', redirect: 'follow' });
      input = resp.url || input;
    } catch {
      // Keep original
    }
  }
  const id = extractSpotifyPlaylistId(input);
  if (!id) throw new Error('Invalid Spotify playlist link');

  // 1. Authenticated Spotify Web API (handles private & large playlists)
  const token = await getValidSpotifyToken();
  if (token) {
    try {
      const metaRes = await fetch(`https://api.spotify.com/v1/playlists/${id}?fields=name,tracks(items(track(name,artists(name),duration_ms)),next)`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': WEB_UA },
      });
      if (metaRes.ok) {
        const pl = await metaRes.json();
        const rows = [];
        const addItems = (items) => {
          for (const it of items || []) {
            const tr = it?.track;
            if (!tr?.name) continue;
            const artist = (tr.artists || []).map((a) => a.name).filter(Boolean).join(', ');
            rows.push({ title: tr.name, artist });
          }
        };
        addItems(pl.tracks?.items);
        let nextUrl = pl.tracks?.next;
        let pages = 0;
        while (nextUrl && pages < 3 && rows.length < 150) {
          pages++;
          const nr = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': WEB_UA } });
          if (!nr.ok) break;
          const nd = await nr.json();
          addItems(nd.items);
          nextUrl = nd.next;
        }
        if (rows.length > 0) {
          return { title: pl.name || 'Spotify Playlist', rows };
        }
      }
    } catch {
      // Fall through to embed scraper
    }
  }

  // 2. Public embed page fallback (__NEXT_DATA__, matching SpotifyPlaylistImporter.kt)
  const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${id}`, {
    headers: { 'User-Agent': WEB_UA },
  });
  if (!embedRes.ok) {
    throw new Error(`Could not read Spotify playlist (HTTP ${embedRes.status}). If private, connect Spotify first.`);
  }
  const html = await embedRes.text();
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
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
        title = node.title;
      } else if (node.uri.startsWith('spotify:track:') && !seen.has(node.uri)) {
        seen.add(node.uri);
        rows.push({
          title: node.title,
          artist: String(node.subtitle || '').replace(/\u00a0/g, ' ').trim(),
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

async function importSpotifyPlaylist(urlOrId, postInnerTube) {
  const { title, rows } = await fetchSpotifyTrackRows(urlOrId);
  const limited = rows.slice(0, 60); // Keep import snappy (<10s)
  const matched = [];
  const concurrency = 5;

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
          return found[0] || null;
        } catch {
          return null;
        }
      }),
    );
    for (const tr of settled) {
      if (tr) matched.push(tr);
    }
  }

  const seen = new Set();
  const deduped = matched.filter((t) => {
    if (seen.has(t.videoId)) return false;
    seen.add(t.videoId);
    return true;
  });

  if (deduped.length === 0) {
    throw new Error('Could not match tracks on YouTube Music.');
  }
  return {
    title,
    source: 'spotify',
    totalSourceTracks: rows.length,
    tracks: deduped,
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

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
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
    if (!spdc && electronLoginHandlers.openSpotifyLogin) {
      const result = await electronLoginHandlers.openSpotifyLogin();
      spdc = result?.spdc || '';
      capturedToken = result?.accessToken || null;
    } else if (!spdc) {
      sendJson(res, 400, { error: 'Provide sp_dc cookie or run inside ClaudeWaves Desktop app for 1-click Spotify login.' });
      return true;
    }

    if (!spdc) {
      sendJson(res, 400, { error: 'Spotify login cancelled or sp_dc cookie not found.' });
      return true;
    }

    let tokenObj = capturedToken
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

  if (parsed.pathname === '/api/import/playlist' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const url = String(body.url || '').trim();
    if (!url) {
      sendJson(res, 400, { error: 'Paste a YouTube Music or Spotify playlist URL.' });
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
};
