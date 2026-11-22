const net = require('node:net');
const crypto = require('node:crypto');
const path = require('node:path');

const DEFAULT_DISCORD_APP_ID = '1552563991426105414';
const DISCORD_LOGO_URL =
  'https://raw.githubusercontent.com/aayepp/ClaudeWaves/main/app/src/main/res/drawable-nodpi/ic_launcher_wave_badge.png';
const REPO_RELEASES_URL = 'https://github.com/aayepp/ClaudeWaves-Desktop/releases/latest';
const RETRY_INTERVAL_MS = 15_000;

let socket = null;
let connectingPromise = null;
let connected = false;
let ready = false;
let activeClientId = DEFAULT_DISCORD_APP_ID;
let lastEnabled = true;
let lastError = null;
let nextRetryAt = 0;
let readBuffer = Buffer.alloc(0);
let pendingActivity = undefined; // undefined = nothing queued; null = clear; object = set

function encodeFrame(op, payloadObj) {
  const json = JSON.stringify(payloadObj);
  const body = Buffer.from(json, 'utf8');
  const frame = Buffer.allocUnsafe(8 + body.length);
  frame.writeUInt32LE(op >>> 0, 0);
  frame.writeUInt32LE(body.length >>> 0, 4);
  body.copy(frame, 8);
  return frame;
}

function writeFrame(op, payloadObj) {
  if (!socket || socket.destroyed || !socket.writable) return false;
  try {
    socket.write(encodeFrame(op, payloadObj));
    return true;
  } catch (err) {
    lastError = err?.message || 'Discord IPC write failed';
    closeSocket();
    return false;
  }
}

function closeSocket() {
  const s = socket;
  socket = null;
  connected = false;
  ready = false;
  readBuffer = Buffer.alloc(0);
  if (s) {
    try {
      s.removeAllListeners();
      s.destroy();
    } catch {
      // ignore
    }
  }
}

function getCandidatePipePaths() {
  if (process.platform === 'win32') {
    const out = [];
    for (let i = 0; i < 10; i++) out.push(`\\\\.\\pipe\\discord-ipc-${i}`);
    return out;
  }
  const base =
    process.env.XDG_RUNTIME_DIR ||
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    '/tmp';
  const out = [];
  for (let i = 0; i < 10; i++) out.push(path.join(base, `discord-ipc-${i}`));
  return out;
}

function probeSinglePipe(pipePath) {
  return new Promise((resolve) => {
    let settled = false;
    const s = net.createConnection(pipePath);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        s.destroy();
      } catch {
        // ignore
      }
      resolve(null);
    }, 550);

    s.once('connect', () => {
      if (settled) {
        s.destroy();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(s);
    });

    s.once('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        s.destroy();
      } catch {
        // ignore
      }
      resolve(null);
    });
  });
}

function sendSetActivity(activity) {
  if (!connected || !ready) {
    pendingActivity = activity;
    return false;
  }
  pendingActivity = undefined;
  return writeFrame(1, {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity,
    },
    nonce: crypto.randomUUID(),
  });
}

function handleIncomingFrames(chunk) {
  readBuffer = Buffer.concat([readBuffer, chunk]);
  while (readBuffer.length >= 8) {
    const op = readBuffer.readUInt32LE(0);
    const len = readBuffer.readUInt32LE(4);
    if (len > 2 * 1024 * 1024) {
      closeSocket();
      return;
    }
    if (readBuffer.length < 8 + len) break;
    const rawJson = readBuffer.subarray(8, 8 + len).toString('utf8');
    readBuffer = readBuffer.subarray(8 + len);
    try {
      const msg = JSON.parse(rawJson);
      if (op === 1 && msg?.cmd === 'DISPATCH' && msg?.evt === 'READY') {
        ready = true;
        lastError = null;
        if (pendingActivity !== undefined) {
          const next = pendingActivity;
          pendingActivity = undefined;
          sendSetActivity(next);
        }
      } else if (op === 2 || msg?.evt === 'ERROR') {
        lastError = msg?.data?.message || msg?.message || 'Discord RPC error';
      }
    } catch {
      // ignore partial/malformed frame
    }
  }
}

async function ensureConnected(clientId) {
  const resolvedId = (clientId || '').trim() || DEFAULT_DISCORD_APP_ID;
  if (socket && !socket.destroyed && activeClientId === resolvedId) {
    return connected;
  }
  if (activeClientId !== resolvedId) {
    closeSocket();
    activeClientId = resolvedId;
    nextRetryAt = 0;
  }
  if (connectingPromise) return connectingPromise;
  if (Date.now() < nextRetryAt) return false;

  connectingPromise = (async () => {
    try {
      const candidates = getCandidatePipePaths();
      let opened = null;
      for (const pipePath of candidates) {
        // eslint-disable-next-line no-await-in-loop
        opened = await probeSinglePipe(pipePath);
        if (opened) break;
      }
      if (!opened) {
        nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
        lastError = null;
        return false;
      }

      socket = opened;
      connected = true;
      ready = false;
      readBuffer = Buffer.alloc(0);

      socket.on('data', handleIncomingFrames);
      socket.on('error', (err) => {
        lastError = err?.message || 'Discord socket closed';
        closeSocket();
        nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
      });
      socket.on('close', () => {
        closeSocket();
        nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
      });

      writeFrame(0, { v: 1, client_id: resolvedId });
      return true;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

function clipText(val, maxLen) {
  const s = String(val || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s.length === 1 ? `${s} ` : s;
  return `${s.slice(0, maxLen - 1)}…`;
}

function buildActivityPayload({ track, isPlaying, positionMs, durationMs }) {
  if (!track || !track.title) return null;

  const details = clipText(track.title, 120) || 'ClaudeWaves Desktop';
  const artistPart = clipText(track.artist || 'YouTube Music', 90);
  const albumPart = clipText(track.album || '', 30);
  const rawState = albumPart && !artistPart.includes(albumPart) ? `${artistPart} • ${albumPart}` : artistPart;
  const state = clipText(rawState, 125) || 'Listening on ClaudeWaves Desktop';

  const thumb =
    typeof track.thumbnailUrl === 'string' && /^https?:\/\//i.test(track.thumbnailUrl)
      ? track.thumbnailUrl
      : DISCORD_LOGO_URL;

  const activity = {
    type: 2, // Listening
    details,
    state: isPlaying ? state : `Paused • ${state}`.slice(0, 125),
    assets: {
      large_image: thumb,
      large_text: clipText(track.album || track.title || 'ClaudeWaves Desktop', 120),
      small_image: DISCORD_LOGO_URL,
      small_text: 'ClaudeWaves Desktop',
    },
    instance: false,
  };

  const effDurationMs = Number(durationMs) > 0 ? Number(durationMs) : Number(track.durationMs) || 0;
  if (isPlaying && effDurationMs > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    const posSec = Math.max(0, Math.floor((Number(positionMs) || 0) / 1000));
    const durSec = Math.max(posSec + 1, Math.floor(effDurationMs / 1000));
    activity.timestamps = {
      start: nowSec - posSec,
      end: nowSec + Math.max(1, durSec - posSec),
    };
  }

  const videoId = typeof track.videoId === 'string' ? track.videoId.trim() : '';
  const buttons = [];
  if (/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    buttons.push({
      label: 'Listen on YouTube Music',
      url: `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    });
  }
  buttons.push({
    label: 'Get ClaudeWaves Desktop',
    url: REPO_RELEASES_URL,
  });
  activity.buttons = buttons;

  return activity;
}

async function updateDiscordPresence(payload = {}) {
  const enabled = payload.enabled !== false;
  lastEnabled = enabled;
  const clientId = (payload.clientId || '').trim() || DEFAULT_DISCORD_APP_ID;

  if (!enabled || !payload.track) {
    pendingActivity = null;
    if (connected && ready) sendSetActivity(null);
    return getDiscordStatus();
  }

  const activity = buildActivityPayload(payload);
  pendingActivity = activity;
  const ok = await ensureConnected(clientId);
  if (ok && ready) {
    sendSetActivity(activity);
  }
  return getDiscordStatus();
}

function clearDiscordPresence() {
  pendingActivity = null;
  if (connected && ready) {
    sendSetActivity(null);
  }
  return getDiscordStatus();
}

function getDiscordStatus() {
  return {
    enabled: lastEnabled,
    connected,
    ready,
    clientId: activeClientId,
    defaultClientId: DEFAULT_DISCORD_APP_ID,
    lastError,
  };
}

function destroyDiscordRpc() {
  try {
    if (connected && ready) {
      writeFrame(1, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: null },
        nonce: crypto.randomUUID(),
      });
    }
  } catch {
    // ignore
  }
  closeSocket();
}

module.exports = {
  DEFAULT_DISCORD_APP_ID,
  updateDiscordPresence,
  clearDiscordPresence,
  getDiscordStatus,
  destroyDiscordRpc,
};
