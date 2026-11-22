// Local Bounded-Range Audio Downloader & HTTP 206 Range Server for Offline Mode
const fs = require('node:fs');
const path = require('node:path');

const CHUNK_BYTES = 512 * 1024; // <= 512 KB per request (matches YouTube bounded-range rule)
const VALID_ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

let offlineDir = null;
let manifestFile = null;
const inFlightDownloads = new Map();

function initOfflineStore(userDataDir) {
  offlineDir = path.join(userDataDir, 'offline-audio');
  manifestFile = path.join(userDataDir, 'offline-index.json');
  fs.mkdirSync(offlineDir, { recursive: true });
}

function assertValidVideoId(videoId) {
  const id = String(videoId || '').trim();
  if (!VALID_ID_RE.test(id)) {
    throw new Error('Invalid videoId for offline storage');
  }
  return id;
}

function readManifestRaw() {
  if (!manifestFile || !fs.existsSync(manifestFile)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeManifest(map) {
  if (!manifestFile) return;
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  const tmp = `${manifestFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf8');
  fs.renameSync(tmp, manifestFile);
}

function pruneManifest(raw) {
  const clean = {};
  let changed = false;
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || !VALID_ID_RE.test(id) || typeof entry.fileName !== 'string') {
      changed = true;
      continue;
    }
    const full = path.join(offlineDir, path.basename(entry.fileName));
    if (!fs.existsSync(full)) {
      changed = true;
      continue;
    }
    clean[id] = entry;
  }
  if (changed) writeManifest(clean);
  return clean;
}

function listOfflineTracks() {
  if (!offlineDir) return { tracks: [], totalBytes: 0 };
  const map = pruneManifest(readManifestRaw());
  const tracks = Object.values(map)
    .map((e) => ({
      videoId: e.videoId,
      title: e.title,
      artist: e.artist,
      album: e.album,
      durationMs: Number(e.durationMs) || 0,
      thumbnailUrl: e.thumbnailUrl || '',
      bytes: Number(e.bytes) || 0,
      mimeType: e.mimeType || 'audio/mp4',
      bitrateKbps: Number(e.bitrateKbps) || 0,
      downloadedAtMs: Number(e.downloadedAtMs) || 0,
    }))
    .sort((a, b) => b.downloadedAtMs - a.downloadedAtMs);
  const totalBytes = tracks.reduce((sum, t) => sum + (t.bytes || 0), 0);
  return { tracks, totalBytes };
}

async function downloadTrackOffline(track, resolveAudioStream) {
  if (!offlineDir) throw new Error('Offline store not initialized');
  const videoId = assertValidVideoId(track?.videoId);

  if (inFlightDownloads.has(videoId)) {
    return inFlightDownloads.get(videoId);
  }

  const job = (async () => {
    let stream = await resolveAudioStream(videoId, false);
    const ext = String(stream.mimeType || '').includes('webm') ? '.webm' : '.m4a';
    const fileName = `${videoId}${ext}`;
    const finalPath = path.join(offlineDir, fileName);
    const tmpPath = `${finalPath}.tmp`;

    // Remove any older variant extension for the same videoId
    for (const oldExt of ['.m4a', '.webm']) {
      const candidate = path.join(offlineDir, `${videoId}${oldExt}`);
      if (candidate !== finalPath && fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
      }
    }

    const ws = fs.createWriteStream(tmpPath);
    let pos = 0;
    let total = Number(stream.contentLength) || 0;
    let refreshedOnce = false;

    try {
      while (total === 0 || pos < total) {
        const chunkEnd = total > 0 ? Math.min(pos + CHUNK_BYTES - 1, total - 1) : pos + CHUNK_BYTES - 1;
        const upstream = await fetch(stream.url, {
          headers: {
            'User-Agent': stream.userAgent,
            Range: `bytes=${pos}-${chunkEnd}`,
          },
          signal: AbortSignal.timeout(20_000),
        });

        if ((upstream.status === 403 || upstream.status === 410) && !refreshedOnce) {
          refreshedOnce = true;
          stream = await resolveAudioStream(videoId, true);
          continue;
        }

        if (upstream.status !== 206 && upstream.status !== 200) {
          throw new Error(`Offline download failed: HTTP ${upstream.status}`);
        }

        const cr = upstream.headers.get('content-range');
        if (cr) {
          const match = /\/(\d+)$/.exec(cr);
          if (match) total = Number(match[1]) || total;
        } else if (upstream.status === 200) {
          const cl = Number(upstream.headers.get('content-length') || '0');
          if (cl > 0) total = cl;
        }

        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length === 0) break;

        if (!ws.write(buf)) {
          await new Promise((resolve) => ws.once('drain', resolve));
        }
        pos += buf.length;

        if (upstream.status === 200 || (total === 0 && buf.length < CHUNK_BYTES)) {
          break;
        }
      }

      await new Promise((resolve, reject) => {
        ws.end(resolve);
        ws.on('error', reject);
      });

      fs.renameSync(tmpPath, finalPath);
    } catch (err) {
      try {
        ws.destroy();
      } catch {
        // ignore
      }
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // ignore
        }
      }
      throw err;
    }

    const stat = fs.statSync(finalPath);
    const entry = {
      videoId,
      title: String(track.title || videoId),
      artist: String(track.artist || 'YouTube Music'),
      album: track.album || undefined,
      durationMs: Number(track.durationMs) || 0,
      thumbnailUrl: String(track.thumbnailUrl || ''),
      mimeType: stream.mimeType || 'audio/mp4',
      bitrateKbps: Number(stream.bitrateKbps) || 0,
      bytes: stat.size,
      fileName,
      downloadedAtMs: Date.now(),
    };

    const map = pruneManifest(readManifestRaw());
    map[videoId] = entry;
    writeManifest(map);
    return entry;
  })().finally(() => {
    inFlightDownloads.delete(videoId);
  });

  inFlightDownloads.set(videoId, job);
  return job;
}

function deleteOfflineTrack(videoId) {
  if (!offlineDir) return false;
  const id = assertValidVideoId(videoId);
  const map = readManifestRaw();
  const entry = map[id];
  if (entry?.fileName) {
    const p = path.join(offlineDir, path.basename(entry.fileName));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  for (const ext of ['.m4a', '.webm']) {
    const p = path.join(offlineDir, `${id}${ext}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  delete map[id];
  writeManifest(map);
  return true;
}

function clearOfflineTracks() {
  if (!offlineDir) return true;
  const map = readManifestRaw();
  for (const entry of Object.values(map)) {
    if (entry?.fileName) {
      const p = path.join(offlineDir, path.basename(entry.fileName));
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
  }
  writeManifest({});
  return true;
}

function serveOfflineAudio(req, res, videoId) {
  if (!offlineDir) {
    res.statusCode = 404;
    res.end('Offline store not ready');
    return;
  }
  let id;
  try {
    id = assertValidVideoId(videoId);
  } catch {
    res.statusCode = 400;
    res.end('Invalid videoId');
    return;
  }

  const map = readManifestRaw();
  const entry = map[id];
  const filePath = entry?.fileName ? path.join(offlineDir, path.basename(entry.fileName)) : null;
  if (!filePath || !fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Offline audio not found');
    return;
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const mime = entry.mimeType || (filePath.endsWith('.webm') ? 'audio/webm' : 'audio/mp4');
  const rangeHeader = req.headers.range;

  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');

  if (rangeHeader && typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
    const [rawStart, rawEnd] = rangeHeader.replace('bytes=', '').split('-');
    const start = Math.max(0, Number(rawStart) || 0);
    const end = Math.min(total - 1, rawEnd ? Number(rawEnd) || total - 1 : total - 1);
    if (start > end || start >= total) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${total}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(end - start + 1));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', String(total));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

module.exports = {
  initOfflineStore,
  listOfflineTracks,
  downloadTrackOffline,
  deleteOfflineTrack,
  clearOfflineTracks,
  serveOfflineAudio,
};
