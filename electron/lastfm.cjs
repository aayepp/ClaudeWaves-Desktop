const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const LASTFM_ENDPOINT = 'https://ws.audioscrobbler.com/2.0/';

const LASTFM_ERROR_MAP = {
  4: 'Authentication failed — check your Last.fm username and password.',
  9: 'Last.fm session expired — please reconnect your account.',
  10: 'Invalid Last.fm API Key — copy the 32-character hex key from last.fm/api/accounts.',
  11: 'Last.fm service is temporarily offline.',
  13: 'Invalid API signature — check your Last.fm Shared Secret carefully.',
  14: 'Token not authorized yet.',
  26: 'Last.fm API key was suspended.',
  29: 'Rate limit exceeded — wait a moment before scrobbling again.',
};

let sessionFilePath = '';
let sessionState = null; // { username, apiKey, apiSecret, sessionKey }
let scrobbledCount = 0;
let lastScrobble = null;
let lastError = null;

function normalizeKey(raw) {
  return String(raw || '')
    .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/[^a-fA-F0-9]/g, '')
    .toLowerCase();
}

function signParams(params, apiSecret) {
  const skip = new Set(['format', 'callback', 'api_sig']);
  const keys = Object.keys(params)
    .filter((k) => !skip.has(k) && params[k] !== undefined && params[k] !== null)
    .sort();
  let base = '';
  for (const k of keys) {
    base += `${k}${String(params[k])}`;
  }
  base += apiSecret;
  return crypto.createHash('md5').update(base, 'utf8').digest('hex');
}

function saveSessionFile() {
  if (!sessionFilePath) return;
  try {
    if (!sessionState) {
      if (fs.existsSync(sessionFilePath)) fs.unlinkSync(sessionFilePath);
      return;
    }
    fs.mkdirSync(path.dirname(sessionFilePath), { recursive: true });
    const tmp = `${sessionFilePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(sessionState, null, 2), 'utf8');
    fs.renameSync(tmp, sessionFilePath);
  } catch {
    // ignore disk write errors
  }
}

function initLastFm(userDataDir) {
  if (!userDataDir) return;
  sessionFilePath = path.join(userDataDir, 'lastfm-session.json');
  try {
    if (fs.existsSync(sessionFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
      if (parsed && parsed.apiKey && parsed.apiSecret && parsed.sessionKey && parsed.username) {
        sessionState = {
          username: String(parsed.username),
          apiKey: normalizeKey(parsed.apiKey),
          apiSecret: normalizeKey(parsed.apiSecret),
          sessionKey: String(parsed.sessionKey),
        };
      }
    }
  } catch {
    sessionState = null;
  }
}

async function callLastFmPost(signedParams, apiSecret) {
  const apiSig = signParams(signedParams, apiSecret);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(signedParams)) {
    if (v !== undefined && v !== null) form.set(k, String(v));
  }
  form.set('api_sig', apiSig);
  form.set('format', 'json');

  const res = await fetch(LASTFM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'User-Agent': 'ClaudeWaves-Desktop/1.4.0',
    },
    body: form.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const code = Number(data?.error);
    const friendly = LASTFM_ERROR_MAP[code] || data?.message || `Last.fm HTTP ${res.status}`;
    const err = new Error(friendly);
    err.code = code || res.status;
    throw err;
  }
  return data;
}

function getLastFmStatus() {
  return {
    connected: Boolean(sessionState && sessionState.sessionKey),
    username: sessionState?.username || '',
    scrobbledCount,
    lastScrobble,
    lastError,
  };
}

async function connectLastFm({ apiKey, apiSecret, username, password, sessionKey } = {}) {
  const cleanKey = normalizeKey(apiKey);
  const cleanSecret = normalizeKey(apiSecret);
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '');
  const cleanSk = String(sessionKey || '').trim();

  if (cleanKey.length !== 32 || cleanSecret.length !== 32) {
    const errMsg = 'API Key and Shared Secret must both be 32-character Last.fm hex strings.';
    lastError = errMsg;
    throw new Error(errMsg);
  }

  try {
    if (cleanSk) {
      sessionState = {
        username: cleanUser || 'Last.fm User',
        apiKey: cleanKey,
        apiSecret: cleanSecret,
        sessionKey: cleanSk,
      };
      lastError = null;
      saveSessionFile();
      return getLastFmStatus();
    }

    if (!cleanUser || !cleanPass) {
      throw new Error('Username and password are required to authenticate with Last.fm.');
    }

    const data = await callLastFmPost(
      {
        method: 'auth.getMobileSession',
        username: cleanUser,
        password: cleanPass,
        api_key: cleanKey,
      },
      cleanSecret,
    );

    const sk = data?.session?.key;
    const resolvedName = data?.session?.name || cleanUser;
    if (!sk) {
      throw new Error('Last.fm did not return a valid session key.');
    }

    sessionState = {
      username: String(resolvedName),
      apiKey: cleanKey,
      apiSecret: cleanSecret,
      sessionKey: String(sk),
    };
    lastError = null;
    saveSessionFile();
    return getLastFmStatus();
  } catch (err) {
    lastError = err?.message || 'Last.fm connection failed';
    throw err;
  }
}

function disconnectLastFm() {
  sessionState = null;
  lastError = null;
  saveSessionFile();
  return getLastFmStatus();
}

async function updateNowPlaying({ artist, track, album, durationSec } = {}) {
  if (!sessionState || !track) return { ok: false, skipped: true };
  const cleanTrack = String(track || '').trim();
  const cleanArtist = String(artist || '').split(/[,•]/)[0]?.trim() || 'Unknown Artist';
  if (!cleanTrack) return { ok: false, skipped: true };

  const params = {
    method: 'track.updateNowPlaying',
    artist: cleanArtist,
    track: cleanTrack,
    api_key: sessionState.apiKey,
    sk: sessionState.sessionKey,
  };
  if (album && String(album).trim()) params.album = String(album).trim();
  if (Number(durationSec) >= 30) params.duration = Math.round(Number(durationSec));

  try {
    await callLastFmPost(params, sessionState.apiSecret);
    lastError = null;
    return { ok: true };
  } catch (err) {
    lastError = err?.message || 'Failed to update Last.fm Now Playing';
    if (err?.code === 9) {
      sessionState = null;
      saveSessionFile();
    }
    return { ok: false, error: lastError };
  }
}

async function scrobbleTrack({ artist, track, album, durationSec, timestampSec } = {}) {
  if (!sessionState || !track) return { ok: false, skipped: true };
  const cleanTrack = String(track || '').trim();
  const cleanArtist = String(artist || '').split(/[,•]/)[0]?.trim() || 'Unknown Artist';
  if (!cleanTrack) return { ok: false, skipped: true };

  const ts = Number(timestampSec) > 0 ? Math.floor(Number(timestampSec)) : Math.floor(Date.now() / 1000);
  const params = {
    method: 'track.scrobble',
    'artist[0]': cleanArtist,
    'track[0]': cleanTrack,
    'timestamp[0]': ts,
    api_key: sessionState.apiKey,
    sk: sessionState.sessionKey,
  };
  if (album && String(album).trim()) params['album[0]'] = String(album).trim();
  if (Number(durationSec) >= 30) params['duration[0]'] = Math.round(Number(durationSec));

  try {
    const data = await callLastFmPost(params, sessionState.apiSecret);
    const accepted = Number(data?.scrobbles?.['@attr']?.accepted ?? 1);
    if (accepted > 0) {
      scrobbledCount += accepted;
      lastScrobble = `${cleanArtist} — ${cleanTrack}`;
    }
    lastError = null;
    return { ok: true, accepted, status: getLastFmStatus() };
  } catch (err) {
    lastError = err?.message || 'Failed to scrobble track';
    if (err?.code === 9) {
      sessionState = null;
      saveSessionFile();
    }
    return { ok: false, error: lastError, status: getLastFmStatus() };
  }
}

module.exports = {
  initLastFm,
  getLastFmStatus,
  connectLastFm,
  disconnectLastFm,
  updateNowPlaying,
  scrobbleTrack,
};
