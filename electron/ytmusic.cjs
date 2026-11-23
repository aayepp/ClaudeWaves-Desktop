// Shared YouTube Music InnerTube + Chunked 512KB Stream Proxy (used by Electron & Vite)
const { getYtAuthHeaders, handleAuthAndImportRequest } = require('./authAndImport.cjs');
const {
  fetchArtistPage,
  fetchAlbumTracks,
  fetchWordSyncedLyrics,
  fetchBestPartSignals,
  fetchSponsorBlockSegments,
  romanizeLyricLines,
  translateLyricLines,
} = require('./extras.cjs');

let windowMiniHandler = null;
function setWindowMiniHandler(fn) {
  windowMiniHandler = fn;
}

const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FALLBACK_WEB_VERSION = '1.20251101.01.00';
const CHUNK_BYTES = 512 * 1024; // 512 KB bounded range (matches Android ChunkedRangeDataSource)

const PLAYER_CLIENTS = [
  {
    name: 'VISIONOS',
    version: '0.1',
    clientId: '101',
    apiKey: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    extra: {
      osName: 'visionOS',
      osVersion: '1.3.21O771',
      deviceMake: 'Apple',
      deviceModel: 'RealityDevice14,1',
    },
  },
  {
    name: 'ANDROID_VR',
    version: '1.65.10',
    clientId: '28',
    apiKey: 'AIzaSyD-p045F_WzU-vA_YgX20SCx4KAo',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    extra: {
      osName: 'Android',
      osVersion: '12L',
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      androidSdkVersion: 32,
    },
  },
  {
    name: 'ANDROID_VR',
    version: '1.60.19',
    clientId: '28',
    apiKey: 'AIzaSyD-p045F_WzU-vA_YgX20SCx4KAo',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1) gzip',
    extra: {
      osName: 'Android',
      osVersion: '12',
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      androidSdkVersion: 32,
    },
  },
  {
    name: 'ANDROID_CREATOR',
    version: '24.32.100',
    clientId: '14',
    apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    userAgent:
      'com.google.android.apps.youtube.creator/24.32.100 (Linux; U; Android 13; en_US) gzip',
    extra: {
      osName: 'Android',
      osVersion: '13',
    },
  },
];

let cachedConfig = null; // { visitorData, clientVersion, fetchedAt }
const streamCache = new Map(); // videoId -> { url, userAgent, mimeType, bitrateKbps, contentLength, itag, source, expiresAtMs }
const videoStreamCache = new Map(); // `${videoId}|${height}` -> { url, userAgent, mimeType, height, contentLength, availableHeights, source, expiresAtMs }

async function getWebConfig(force = false) {
  const now = Date.now();
  if (!force && cachedConfig && now - cachedConfig.fetchedAt < 30 * 60 * 1000) {
    return cachedConfig;
  }
  try {
    const html = await (
      await fetch('https://music.youtube.com/', {
        headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      })
    ).text();
    const visitorData = html.match(/"VISITOR_DATA":"([^"]+)"/)?.[1] || '';
    const clientVersion =
      html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || FALLBACK_WEB_VERSION;
    cachedConfig = { visitorData, clientVersion, fetchedAt: now };
    return cachedConfig;
  } catch {
    return cachedConfig || { visitorData: '', clientVersion: FALLBACK_WEB_VERSION, fetchedAt: now };
  }
}

async function postInnerTube(endpoint, bodyExtra) {
  const cfg = await getWebConfig();
  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: cfg.clientVersion,
        hl: 'en',
        gl: 'US',
        ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {}),
      },
    },
    ...bodyExtra,
  };
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': WEB_UA,
    Origin: 'https://music.youtube.com',
    Referer: 'https://music.youtube.com/',
    'X-YouTube-Client-Name': '67',
    'X-YouTube-Client-Version': cfg.clientVersion,
  };
  if (cfg.visitorData) headers['X-Goog-Visitor-Id'] = cfg.visitorData;
  const authHeaders = getYtAuthHeaders();
  if (authHeaders) Object.assign(headers, authHeaders);

  const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`InnerTube ${endpoint} HTTP ${res.status}`);
  return res.json();
}

function parseExpireMs(url) {
  const m = /[?&]expire=(\d+)/.exec(url);
  return m ? Number(m[1]) * 1000 : Date.now() + 3600 * 1000;
}

async function resolveAudioStream(videoId, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh) {
    const cached = streamCache.get(videoId);
    if (cached && cached.expiresAtMs - now > 120_000) {
      return cached;
    }
  }

  const cfg = await getWebConfig();
  const errors = [];

  for (const client of PLAYER_CLIENTS) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': client.userAgent,
        'X-YouTube-Client-Name': client.clientId,
        'X-YouTube-Client-Version': client.version,
      };
      if (cfg.visitorData) headers['X-Goog-Visitor-Id'] = cfg.visitorData;

      const res = await fetch(
        `https://youtubei.googleapis.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
            context: {
              client: {
                clientName: client.name,
                clientVersion: client.version,
                hl: 'en',
                gl: 'US',
                ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {}),
                ...client.extra,
              },
            },
          }),
        },
      );
      if (!res.ok) {
        errors.push(`${client.name}: HTTP ${res.status}`);
        continue;
      }

      const root = await res.json();
      const status = root?.playabilityStatus?.status;
      const formats = (root?.streamingData?.adaptiveFormats || []).filter(
        (f) => typeof f.mimeType === 'string' && f.mimeType.startsWith('audio/') && typeof f.url === 'string',
      );
      if (!formats.length) {
        errors.push(`${client.name}: ${status || 'no formats'}`);
        continue;
      }

      // Rank Opus (itag 251) first, then high-bitrate AAC (itag 140)
      formats.sort((a, b) => {
        const score = (f) =>
          (Number(f.bitrate) || 0) + (f.mimeType.includes('opus') ? 50_000 : f.mimeType.includes('mp4') ? 25_000 : 0);
        return score(b) - score(a);
      });

      const best = formats[0];

      // Byte-probe first 1 KB with bounded Range + matching User-Agent before accepting
      const probe = await fetch(best.url, {
        headers: {
          'User-Agent': client.userAgent,
          Range: 'bytes=0-1023',
        },
      });
      if (probe.status !== 206 && probe.status !== 200) {
        errors.push(`${client.name}: probe HTTP ${probe.status}`);
        continue;
      }
      // Consume tiny probe body to free socket
      await probe.arrayBuffer().catch(() => {});

      const rangeTotal = probe.headers.get('content-range')?.split('/')?.[1];
      const contentLength = Number(best.contentLength || rangeTotal || 0);

      const resolved = {
        videoId,
        url: best.url,
        userAgent: client.userAgent,
        mimeType: best.mimeType.split(';')[0] || 'audio/webm',
        bitrateKbps: Math.max(64, Math.round((Number(best.bitrate) || 128000) / 1000)),
        contentLength,
        itag: Number(best.itag) || 0,
        source: client.name,
        expiresAtMs: parseExpireMs(best.url),
      };
      streamCache.set(videoId, resolved);
      return resolved;
    } catch (err) {
      errors.push(`${client.name}: ${err?.message || 'err'}`);
    }
  }

  throw new Error(`Stream resolve failed (${errors.join('; ')})`);
}

const mvLookupCache = new Map();

const NON_MV_PENALTY_RULES = [
  { re: /\b(lyrics?|lirik)\b/i, checkRe: /\b(lyrics?|lirik)\b/i, penalty: -160, nonMv: true },
  { re: /\b(official\s+audio|audio\s+only|audio)\b/i, checkRe: /\baudio\b/i, penalty: -170, nonMv: true },
  { re: /\bvisuali[sz]er\b/i, checkRe: /\bvisuali[sz]er\b/i, penalty: -135, nonMv: true },
  { re: /\b(karaoke|instrumental|backing\s+track)\b/i, checkRe: /\b(karaoke|instrumental|backing\s+track)\b/i, penalty: -180, nonMv: true },
  { re: /\b(slowed|reverb|nightcore|sped\s+up|8d)\b/i, checkRe: /\b(slowed|reverb|nightcore|sped\s+up|8d)\b/i, penalty: -170, nonMv: true },
  { re: /\b(cover|reaction|teaser|trailer|behind\s+the\s+scenes|making\s+of|shorts?)\b/i, checkRe: /\b(cover|reaction|teaser|trailer|behind\s+the\s+scenes|making\s+of|shorts?)\b/i, penalty: -145, nonMv: false },
  { re: /\bremix\b/i, checkRe: /\bremix\b/i, penalty: -90, nonMv: false },
  { re: /\b(live|acoustic|unplugged|performance|concert)\b/i, checkRe: /\b(live|acoustic|unplugged|performance|concert)\b/i, penalty: -70, nonMv: false },
];

function cleanSearchTitle(title) {
  return String(title || '')
    .replace(/[\[(][^\]\)]*(official\s*(audio|lyric|lyrics|visualizer|visualiser)|lyric\s*video|lyrics?|audio|feat\.?[^\]\)]*|ft\.?[^\]\)]*)[^\]\)]*[\])]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function runsToText(obj) {
  if (!obj) return '';
  if (Array.isArray(obj.runs)) {
    return obj.runs.map((r) => r?.text || '').join('').trim();
  }
  return String(obj.simpleText || '').trim();
}

function walkJson(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkJson(item, visitor);
    return;
  }
  visitor(node);
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') walkJson(val, visitor);
  }
}

function isLikelyNonMvTitle(videoTitle, originalTrackTitle = '') {
  const vt = String(videoTitle || '');
  const ot = String(originalTrackTitle || '');
  if (!vt) return false;
  return NON_MV_PENALTY_RULES.some((rule) => rule.nonMv && rule.re.test(vt) && !rule.checkRe.test(ot));
}

function scoreMvCandidate(candTitle, candChannel, originalTitle, originalArtist, opts = {}) {
  if (opts.musicVideoType === 'MUSIC_VIDEO_TYPE_ATV') return -999;

  const ct = String(candTitle || '');
  const cc = String(candChannel || '');
  const ot = String(originalTitle || '');
  const oa = String(originalArtist || '');
  const combined = `${ct} ${cc}`.toLowerCase();

  let score = 0;
  if (opts.musicVideoType === 'MUSIC_VIDEO_TYPE_OMV') score += 220;

  if (/\bofficial\s+music\s+video\b/i.test(ct)) score += 130;
  else if (/\bofficial\s+m\/?v\b|\bm\/v\b|[\[(]\s*mv\s*[\])]/i.test(ct)) score += 115;
  else if (/\bofficial\s+video\b/i.test(ct)) score += 100;
  else if (/\bmusic\s+video\b/i.test(ct)) score += 70;

  const primaryArtist = oa.split(/[,&•×/]|feat\.?|ft\.?/i)[0].trim().toLowerCase();
  if (primaryArtist.length >= 2 && combined.includes(primaryArtist)) {
    score += 35;
  }
  if (/vevo\b|official$/i.test(cc)) score += 20;

  const titleTokens = cleanSearchTitle(ot)
    .toLowerCase()
    .split(/[^a-z0-9\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
  if (titleTokens.length > 0) {
    const matched = titleTokens.filter((t) => ct.toLowerCase().includes(t)).length;
    if (matched >= Math.ceil(titleTokens.length / 2)) score += 30;
    else score -= 40;
  }

  for (const rule of NON_MV_PENALTY_RULES) {
    if (rule.re.test(ct) && !rule.checkRe.test(ot)) {
      score += rule.penalty;
    }
  }

  return score;
}

async function findCounterpartMv(videoId) {
  if (!videoId) return [];
  const results = [];
  try {
    const data = await postInnerTube('next', { videoId, isAudioOnly: false });
    walkJson(data, (node) => {
      const wrapper = node.playlistPanelVideoWrapperRenderer;
      if (!wrapper || !Array.isArray(wrapper.counterpart)) return;
      for (const cp of wrapper.counterpart) {
        const pv = cp?.counterpartRenderer?.playlistPanelVideoRenderer;
        const cpVid = pv?.videoId;
        if (!cpVid || cpVid === videoId) continue;
        const musicVideoType =
          pv?.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig
            ?.musicVideoType || '';
        if (musicVideoType === 'MUSIC_VIDEO_TYPE_ATV') continue;
        results.push({
          videoId: cpVid,
          title: runsToText(pv?.title),
          channel: runsToText(pv?.longBylineText) || runsToText(pv?.shortBylineText),
          musicVideoType: musicVideoType || 'MUSIC_VIDEO_TYPE_OMV',
        });
      }
    });
  } catch {
    // Ignore InnerTube counterpart lookup errors; search candidates still handle MV resolution.
  }
  return results;
}

function extractSearchVideoCandidates(data) {
  const results = [];
  walkJson(data, (node) => {
    const item = node.musicResponsiveListItemRenderer;
    if (!item) return;

    let watchEndpoint =
      item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
        ?.playNavigationEndpoint?.watchEndpoint;
    if (!watchEndpoint) {
      walkJson(item, (sub) => {
        if (!watchEndpoint && sub?.watchEndpoint?.videoId) watchEndpoint = sub.watchEndpoint;
      });
    }

    const vid = item?.playlistItemData?.videoId || watchEndpoint?.videoId;
    if (!vid || typeof vid !== 'string') return;
    const musicVideoType =
      watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';
    if (musicVideoType === 'MUSIC_VIDEO_TYPE_ATV') return;

    const flex = Array.isArray(item.flexColumns) ? item.flexColumns : [];
    const candTitle = runsToText(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
    const candChannel = runsToText(flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text);
    results.push({ videoId: vid, title: candTitle, channel: candChannel, musicVideoType });
  });
  return results;
}

async function findMusicVideoCandidates(title, artist, originalVideoId = '') {
  const cleanTitle = cleanSearchTitle(title) || String(title || '').trim();
  const cleanArtist = String(artist || '').trim();
  const cacheKey = `${originalVideoId || ''}|${cleanTitle.toLowerCase()}|${cleanArtist.toLowerCase()}`;
  if (!cleanTitle) return [];
  if (mvLookupCache.has(cacheKey)) return mvLookupCache.get(cacheKey);

  const primaryQuery = `${cleanTitle} ${cleanArtist} official music video`.trim();
  const [cpRes, searchRes] = await Promise.allSettled([
    originalVideoId ? findCounterpartMv(originalVideoId) : Promise.resolve([]),
    postInnerTube('search', {
      query: primaryQuery,
      params: 'EgWKAQIQAWoKEAkQBRAKEAMQBA%3D%3D', // YouTube Music Videos filter
    }),
  ]);

  const rawPool = [];
  if (cpRes.status === 'fulfilled') rawPool.push(...cpRes.value);
  const firstSearchList =
    searchRes.status === 'fulfilled' ? extractSearchVideoCandidates(searchRes.value) : [];
  rawPool.push(...firstSearchList);

  if (firstSearchList.length < 2) {
    try {
      const fallbackData = await postInnerTube('search', {
        query: `${cleanTitle} ${cleanArtist}`.trim(),
        params: 'EgWKAQIQAWoKEAkQBRAKEAMQBA%3D%3D',
      });
      rawPool.push(...extractSearchVideoCandidates(fallbackData));
    } catch {
      // Ignore fallback search failure; use whatever counterpart/first search gave us.
    }
  }

  const byId = new Map();
  for (const item of rawPool) {
    if (!item?.videoId) continue;
    const score = scoreMvCandidate(item.title, item.channel, title, artist, {
      musicVideoType: item.musicVideoType,
    });
    const prev = byId.get(item.videoId);
    if (!prev || score > prev.score) {
      byId.set(item.videoId, { ...item, score });
    }
  }

  const sorted = Array.from(byId.values())
    .filter((c) => c.score > -500)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  setBoundedMap(mvLookupCache, cacheKey, sorted, 120);
  return sorted;
}

const STANDARD_VIDEO_TIERS = [360, 480, 720, 1080, 1440, 2160];

function parseQualityTier(fmt) {
  const label = typeof fmt.qualityLabel === 'string' ? fmt.qualityLabel : '';
  const m = /(2160|1440|1080|720|480|360)/.exec(label);
  if (m) return Number(m[1]);
  const h = Number(fmt.height) || 0;
  const w = Number(fmt.width) || 0;
  // Normalize 21:9 cinema framing (e.g. 1920x804) to equivalent 16:9 vertical tier (1080)
  const norm = Math.max(h, Math.round((w * 9) / 16));
  let best = STANDARD_VIDEO_TIERS[0];
  let bestDist = Infinity;
  for (const tier of STANDARD_VIDEO_TIERS) {
    const dist = Math.abs(norm - tier);
    if (dist < bestDist) {
      bestDist = dist;
      best = tier;
    }
  }
  return best;
}

const mvOrderedIdsCache = new Map();

function setBoundedMap(map, key, value, max = 120) {
  if (map.size >= max && !map.has(key)) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
  map.set(key, value);
}

async function resolveVideoStream(
  videoId,
  targetHeight = 720,
  forceRefresh = false,
  title = '',
  artist = '',
  candidateIndex = 0,
) {
  const idxReq = Math.max(0, Number(candidateIndex) || 0);
  const key = `${videoId}|${targetHeight}|${title ? `mv:${idxReq}` : 'raw'}`;
  const now = Date.now();
  if (!forceRefresh) {
    const cached = videoStreamCache.get(key);
    if (cached && cached.expiresAtMs - now > 120_000) return cached;
  }

  const cfg = await getWebConfig();
  const errors = [];

  const fetchForId = async (targetVid) => {
    for (const client of PLAYER_CLIENTS) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': client.userAgent,
          'X-YouTube-Client-Name': client.clientId,
          'X-YouTube-Client-Version': client.version,
        };
        if (cfg.visitorData) headers['X-Goog-Visitor-Id'] = cfg.visitorData;

        const res = await fetch(
          `https://youtubei.googleapis.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              videoId: targetVid,
              contentCheckOk: true,
              racyCheckOk: true,
              context: {
                client: {
                  clientName: client.name,
                  clientVersion: client.version,
                  hl: 'en',
                  gl: 'US',
                  ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {}),
                  ...client.extra,
                },
              },
            }),
          },
        );
        if (!res.ok) continue;
        const root = await res.json();
        const allFormats = (root?.streamingData?.adaptiveFormats || []).filter(
          (f) =>
            typeof f.mimeType === 'string' &&
            f.mimeType.startsWith('video/') &&
            typeof f.url === 'string' &&
            (Number(f.height) >= 240 || Number(f.width) >= 426),
        );
        if (!allFormats.length) {
          errors.push(`${client.name}: no video`);
          continue;
        }

        // CRITICAL for Electron: open-source Chromium builds DO NOT include proprietary H.264 (avc1).
        // Filter strictly to VP9 / AV1 first, falling back to H.264 only if neither exists.
        const openCodecFormats = allFormats.filter(
          (f) => f.mimeType.includes('vp9') || f.mimeType.includes('vp09') || f.mimeType.includes('av01'),
        );
        const formats = openCodecFormats.length > 0 ? openCodecFormats : allFormats;

        const byTier = new Map();
        for (const f of formats) {
          const tier = parseQualityTier(f);
          const existing = byTier.get(tier);
          const isVp9 = f.mimeType.includes('vp9') || f.mimeType.includes('vp09');
          const isAv1 = f.mimeType.includes('av01');
          const isAvc = f.mimeType.includes('avc1');
          const fpsBonus = (Number(f.fps) || 0) >= 50 ? 40 : 0;
          const brMbps = (Number(f.averageBitrate || f.bitrate) || 0) / 100000;
          const score = (isVp9 ? 300 : isAv1 ? 260 : isAvc ? 50 : 100) + fpsBonus + brMbps;
          if (!existing || score > existing._score) {
            byTier.set(tier, { ...f, _score: score, _tier: tier });
          }
        }

        const tiers = Array.from(byTier.keys()).sort((a, b) => a - b);
        const chosenTier = tiers.filter((t) => t <= targetHeight).pop() ?? tiers[0];
        const chosen = byTier.get(chosenTier);
        if (!chosen) continue;

        // Probe first 1KB
        const probe = await fetch(chosen.url, {
          headers: { 'User-Agent': client.userAgent, Range: 'bytes=0-1023' },
        });
        if (probe.status !== 206 && probe.status !== 200) {
          errors.push(`${client.name}: probe ${probe.status}`);
          continue;
        }
        await probe.arrayBuffer().catch(() => {});

        const rangeTotal = probe.headers.get('content-range')?.split('/')?.[1];
        const contentLength = Number(chosen.contentLength || rangeTotal || 0);
        const availableHeights = [480, 720, 1080, 1440, 2160].filter((q) => byTier.has(q));
        const width = Number(chosen.width || 0);
        const rawHeight = Number(chosen.height || chosenTier);
        const isSquareArtTrack = width > 0 && rawHeight > 0 && width <= rawHeight * 1.12;
        const codec =
          chosen.mimeType.includes('vp9') || chosen.mimeType.includes('vp09')
            ? 'VP9'
            : chosen.mimeType.includes('av01')
              ? 'AV1'
              : 'H264';

        return {
          videoId: targetVid,
          videoTitle: String(root?.videoDetails?.title || ''),
          videoAuthor: String(root?.videoDetails?.author || ''),
          url: chosen.url,
          userAgent: client.userAgent,
          mimeType: chosen.mimeType.split(';')[0] || 'video/webm',
          tier: chosenTier,
          height: rawHeight,
          width,
          fps: Number(chosen.fps || 0),
          bitrateKbps: Math.round((Number(chosen.averageBitrate || chosen.bitrate) || 0) / 1000),
          codec,
          isSquareArtTrack,
          availableHeights: availableHeights.length > 0 ? availableHeights : [chosenTier],
          contentLength,
          source: client.name,
          expiresAtMs: parseExpireMs(chosen.url),
        };
      } catch (err) {
        errors.push(`${client.name}: ${err?.message || 'err'}`);
      }
    }
    return null;
  };

  let resolved = null;
  let actualIdx = 0;
  let candidatesCount = 1;

  if (!title) {
    resolved = await fetchForId(videoId);
  } else {
    const orderKey = `${videoId}|${cleanSearchTitle(title).toLowerCase()}|${String(artist || '').trim().toLowerCase()}`;
    const candidatesPromise = findMusicVideoCandidates(title, artist, videoId);
    let orderedIds = idxReq > 0 ? mvOrderedIdsCache.get(orderKey) : null;
    let baseResolved = null;

    if (!orderedIds) {
      const [baseOut, rawCandidates] = await Promise.all([
        idxReq === 0 ? fetchForId(videoId) : Promise.resolve(null),
        candidatesPromise,
      ]);
      baseResolved = baseOut;

      const candIds = rawCandidates.map((c) => c.videoId);
      const baseIsSquare = !baseResolved || baseResolved.isSquareArtTrack;
      const baseIsNonMv = baseResolved ? isLikelyNonMvTitle(baseResolved.videoTitle, title) : true;
      const baseScore =
        baseResolved && !baseResolved.isSquareArtTrack
          ? scoreMvCandidate(baseResolved.videoTitle, baseResolved.videoAuthor, title, artist)
          : -999;
      const topCand = rawCandidates[0];
      const topIsClearlyBetter = Boolean(
        topCand &&
          topCand.videoId !== videoId &&
          (topCand.musicVideoType === 'MUSIC_VIDEO_TYPE_OMV' ||
            (topCand.score >= 70 && topCand.score >= baseScore + 45)),
      );
      const shouldReplace =
        baseIsSquare ||
        (baseIsNonMv && Boolean(topCand && topCand.videoId !== videoId && topCand.score > baseScore)) ||
        topIsClearlyBetter;

      const rawOrdered =
        idxReq > 0
          ? [...candIds, ...(!candIds.includes(videoId) ? [videoId] : [])]
          : shouldReplace
            ? [...candIds, ...(!baseIsSquare && !candIds.includes(videoId) ? [videoId] : [])]
            : [videoId, ...candIds.filter((id) => id !== videoId)];

      orderedIds = Array.from(new Set(rawOrdered.filter(Boolean))).slice(0, 6);
      if (orderedIds.length === 0) orderedIds = [videoId];
      setBoundedMap(mvOrderedIdsCache, orderKey, orderedIds, 120);
    }

    candidatesCount = orderedIds.length;
    const startIdx = idxReq % orderedIds.length;
    let fallbackPlayable = baseResolved;

    for (let offset = 0; offset < orderedIds.length; offset += 1) {
      const idx = (startIdx + offset) % orderedIds.length;
      const targetVid = orderedIds[idx];
      const candStream =
        targetVid === videoId && baseResolved ? baseResolved : await fetchForId(targetVid);
      if (!candStream) continue;
      if (!fallbackPlayable) {
        fallbackPlayable = candStream;
        actualIdx = idx;
      }
      if (!candStream.isSquareArtTrack) {
        resolved = candStream;
        actualIdx = idx;
        break;
      }
    }

    if (!resolved) {
      resolved = fallbackPlayable;
    }
  }

  if (!resolved) {
    throw new Error(`No playable video stream (${errors.join('; ')})`);
  }

  const enriched = {
    ...resolved,
    videoTitle: resolved.videoTitle || '',
    candidatesCount,
    candidateIndex: actualIdx,
    isOfficialMv: !resolved.isSquareArtTrack && !isLikelyNonMvTitle(resolved.videoTitle, title),
  };

  videoStreamCache.set(key, enriched);
  videoStreamCache.set(`${enriched.videoId}|${enriched.tier}|raw`, enriched);
  return enriched;
}

const MAX_CACHED_CHUNKS = 24; // ~12 MB bounded RAM LRU cache for instant seek & zero gap reads
const chunkLruCache = new Map();

function getCachedChunk(key) {
  if (!chunkLruCache.has(key)) return null;
  const buf = chunkLruCache.get(key);
  chunkLruCache.delete(key);
  chunkLruCache.set(key, buf);
  return buf;
}

function putCachedChunk(key, buf) {
  if (!buf || buf.length === 0 || buf.length > CHUNK_BYTES) return;
  if (chunkLruCache.has(key)) chunkLruCache.delete(key);
  chunkLruCache.set(key, buf);
  while (chunkLruCache.size > MAX_CACHED_CHUNKS) {
    const oldestKey = chunkLruCache.keys().next().value;
    chunkLruCache.delete(oldestKey);
  }
}

async function fetchChunkWithRetry(streamRef, fetcher, pos, chunkEnd, externalSignal) {
  const getKey = () =>
    `${streamRef.current.videoId}|${streamRef.current.itag || streamRef.current.tier || 0}|${pos}-${chunkEnd}`;
  const hit = getCachedChunk(getKey());
  if (hit) return hit;

  const backoffs = [200, 500];
  let retryCount = 0;

  while (retryCount < 3) {
    if (externalSignal?.aborted) return null;

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), 12_000);

    try {
      const upstream = await fetch(streamRef.current.url, {
        headers: {
          'User-Agent': streamRef.current.userAgent,
          Range: `bytes=${pos}-${chunkEnd}`,
        },
        signal: controller.signal,
      });

      if ((upstream.status === 403 || upstream.status === 410) && !streamRef.refreshedOnce) {
        streamRef.refreshedOnce = true;
        try {
          streamRef.current = await fetcher(true);
          continue;
        } catch {
          return null;
        }
      }

      if (upstream.status >= 500 && retryCount < 2) {
        await new Promise((r) => setTimeout(r, backoffs[retryCount] || 500));
        retryCount += 1;
        continue;
      }

      if (upstream.status !== 206 && upstream.status !== 200) {
        return null;
      }

      let buf = Buffer.from(await upstream.arrayBuffer());
      if (upstream.status === 200) {
        const expectedLen = chunkEnd - pos + 1;
        if (pos > 0 || buf.length > expectedLen) {
          buf = buf.subarray(pos, pos + expectedLen);
        }
      }

      if (buf.length > 0) {
        putCachedChunk(getKey(), buf);
      }
      return buf;
    } catch {
      if (externalSignal?.aborted) return null;
      if (retryCount < 2) {
        await new Promise((r) => setTimeout(r, backoffs[retryCount] || 500));
        retryCount += 1;
        continue;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }
  return null;
}

async function handleChunkedProxy(req, res, fetcher) {
  const streamRef = { current: await fetcher(false), refreshedOnce: false };
  const total = streamRef.current.contentLength;

  let start = 0;
  let end = total > 0 ? total - 1 : CHUNK_BYTES - 1;
  const rangeHeader = req.headers.range;
  let isPartial = false;

  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      isPartial = true;
      start = m[1] ? Number(m[1]) : 0;
      end = m[2] ? Number(m[2]) : total > 0 ? total - 1 : start + CHUNK_BYTES - 1;
      if (total > 0 && end >= total) end = total - 1;
    }
  }

  if (total > 0 && start >= total) {
    res.statusCode = 416;
    res.setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }

  const lengthToServe = total > 0 ? end - start + 1 : undefined;
  res.statusCode = isPartial && total > 0 ? 206 : 200;
  res.setHeader('Content-Type', streamRef.current.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  if (total > 0) {
    res.setHeader('Content-Length', String(lengthToServe));
    if (isPartial) {
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    }
  }

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  let closed = false;
  const sessionAbort = new AbortController();
  const abortAll = () => {
    closed = true;
    sessionAbort.abort();
  };
  res.on('close', () => {
    if (!res.writableFinished) abortAll();
  });

  let pos = start;
  let pendingPrefetch = null; // { startPos, promise }

  try {
    while (!closed && (total <= 0 || pos <= end)) {
      const chunkEnd = total > 0 ? Math.min(end, pos + CHUNK_BYTES - 1) : pos + CHUNK_BYTES - 1;

      const buf =
        pendingPrefetch && pendingPrefetch.startPos === pos
          ? await pendingPrefetch.promise
          : await fetchChunkWithRetry(streamRef, fetcher, pos, chunkEnd, sessionAbort.signal);
      pendingPrefetch = null;

      if (closed || res.writableEnded || !buf || buf.length === 0) break;

      const nextPos = pos + buf.length;
      if (!closed && (total <= 0 || nextPos <= end) && !(total <= 0 && buf.length < CHUNK_BYTES)) {
        const nextEnd = total > 0 ? Math.min(end, nextPos + CHUNK_BYTES - 1) : nextPos + CHUNK_BYTES - 1;
        pendingPrefetch = {
          startPos: nextPos,
          promise: fetchChunkWithRetry(streamRef, fetcher, nextPos, nextEnd, sessionAbort.signal),
        };
      }

      const ok = res.write(buf);
      pos = nextPos;

      if (!ok && !closed) {
        await new Promise((resolve) => {
          const onFinish = () => {
            res.removeListener('drain', onFinish);
            res.removeListener('close', onFinish);
            resolve();
          };
          res.once('drain', onFinish);
          res.once('close', onFinish);
        });
      }
      if (total <= 0 && buf.length < CHUNK_BYTES) break;
    }
  } finally {
    sessionAbort.abort();
  }

  if (!res.writableEnded) res.end();
}

async function handleChunkedAudioProxy(req, res, videoId) {
  return handleChunkedProxy(req, res, (force) => resolveAudioStream(videoId, force));
}

async function handleChunkedVideoProxy(req, res, videoId, quality) {
  return handleChunkedProxy(req, res, (force) => resolveVideoStream(videoId, quality, force));
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

const MOOD_SHELF_QUERIES = {
  all: [
    { title: 'New Releases', subtitle: 'Fresh this week', query: 'new music releases 2026 official audio' },
    { title: 'Top Malaysia', subtitle: 'Malaysia charts', query: 'lagu melayu viral top malaysia hits 2025 2026' },
    { title: 'Top Indonesia', subtitle: 'Indonesia charts', query: 'lagu indonesia terpopuler hits viral 2025 2026' },
    { title: 'Top Global', subtitle: 'Global hits', query: 'top global pop hits official audio billboard' },
    { title: 'Chill & Late Night Mixes', subtitle: 'Unwind & relax', query: 'late night rnb lofi chill beats aesthetic' },
  ],
  energize: [
    { title: 'High Energy Pop & Dance', subtitle: 'Energize', query: 'upbeat dance pop hits workout energy' },
    { title: 'Electronic & House Pulse', subtitle: 'Non-stop rhythm', query: 'electronic house edm festival hits' },
    { title: 'Feel Good Anthems', subtitle: 'Instant boost', query: 'feel good upbeat summer anthems' },
  ],
  chill: [
    { title: 'Chill & Lo-Fi Beats', subtitle: 'Chill', query: 'lofi hip hop chill study beats' },
    { title: 'Acoustic Sunset', subtitle: 'Mellow guitars', query: 'acoustic indie chill sunset songs' },
    { title: 'Dreamy Indie & Bedroom Pop', subtitle: 'Soft vibes', query: 'bedroom pop dreamy indie chill' },
  ],
  focus: [
    { title: 'Deep Focus Ambient', subtitle: 'Focus', query: 'ambient focus music brain waves' },
    { title: 'Piano & Modern Classical', subtitle: 'Pure concentration', query: 'peaceful piano modern classical study' },
    { title: 'Synthwave Coding Mix', subtitle: 'Flow state', query: 'chill synthwave coding instrumental' },
  ],
  workout: [
    { title: 'Beast Mode Workout', subtitle: 'Workout', query: 'gym workout hip hop phonk hype' },
    { title: 'Cardio & Running Hits', subtitle: 'High BPM', query: 'running cardio upbeat electronic pop' },
    { title: 'Rock & Metal Adrenaline', subtitle: 'Heavy energy', query: 'workout rock adrenaline hits' },
  ],
  pop: [
    { title: 'Global Pop Superstars', subtitle: 'Pop', query: 'pop hits 2025 2026 official audio' },
    { title: 'K-Pop & J-Pop Wave', subtitle: 'Asia hits', query: 'kpop jpop top hits official' },
    { title: 'Throwback Pop Classics', subtitle: 'Timeless', query: '2010s pop hits nostalgia' },
  ],
  malay: [
    { title: 'Malay Pop & Ballads', subtitle: 'Malay & Indie', query: 'lagu melayu popular terbaru 2025' },
    { title: 'Indo & Nusantara Indie', subtitle: 'Regional favorites', query: 'indie indonesia malaysia chill hits' },
    { title: 'Malay Rock Kapak & Classics', subtitle: 'Legenda', query: 'lagu rock kapak klasik malaysia' },
  ],
  latenight: [
    { title: 'Midnight R&B Drive', subtitle: 'Late Night', query: 'midnight drive rnb the weeknd sza frank ocean' },
    { title: 'Slowed & Atmospheric', subtitle: '2 AM mood', query: 'late night atmospheric alt rnb chill' },
    { title: 'Jazz & Rainy Night', subtitle: 'Cozy lounge', query: 'smooth jazz rainy night lounge' },
  ],
};

async function fetchCuratedSearchShelf(def) {
  try {
    const raw = await postInnerTube('search', {
      query: def.query,
      params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
    });
    return { title: def.title, subtitle: def.subtitle, raw };
  } catch {
    return null;
  }
}

async function handleApiRequest(req, res) {
  const authHandled = await handleAuthAndImportRequest(req, res, postInnerTube);
  if (authHandled) return true;

  const parsed = new URL(req.url || '/', 'http://127.0.0.1');

  if (parsed.pathname === '/api/yt/home') {
    const mood = (parsed.searchParams.get('mood') || 'all').toLowerCase();
    const curatedDefs = MOOD_SHELF_QUERIES[mood] || MOOD_SHELF_QUERIES.all;

    if (mood !== 'all') {
      const curated = (await Promise.all(curatedDefs.map(fetchCuratedSearchShelf))).filter(Boolean);
      sendJson(res, 200, { home: null, charts: null, curated });
      return true;
    }

    const [home, explore, curatedRaw] = await Promise.all([
      postInnerTube('browse', { browseId: 'FEmusic_home' }).catch(() => null),
      postInnerTube('browse', { browseId: 'FEmusic_explore' }).catch(() => null),
      Promise.all(curatedDefs.map(fetchCuratedSearchShelf)),
    ]);
    sendJson(res, 200, { home, charts: explore, curated: curatedRaw.filter(Boolean) });
    return true;
  }

  if (parsed.pathname === '/api/yt/explore') {
    const [explore, charts] = await Promise.all([
      postInnerTube('browse', { browseId: 'FEmusic_explore' }),
      postInnerTube('browse', { browseId: 'FEmusic_charts' }).catch(() => null),
    ]);
    sendJson(res, 200, { explore, charts });
    return true;
  }

  if (parsed.pathname === '/api/yt/search') {
    const q = parsed.searchParams.get('q') ?? '';
    const params = parsed.searchParams.get('params');
    const extra = { query: q };
    if (params) extra.params = params;
    const data = await postInnerTube('search', extra);
    sendJson(res, 200, data);
    return true;
  }

  if (parsed.pathname === '/api/yt/next') {
    const videoId = parsed.searchParams.get('videoId') ?? '';
    const data = await postInnerTube('next', {
      videoId,
      playlistId: `RDAMVM${videoId}`,
      isAudioOnly: true,
    });
    sendJson(res, 200, data);
    return true;
  }

  if (parsed.pathname === '/api/yt/stream') {
    const videoId = parsed.searchParams.get('videoId') ?? '';
    if (!videoId) {
      sendJson(res, 400, { error: 'Missing videoId' });
      return true;
    }
    const resolved = await resolveAudioStream(videoId);
    sendJson(res, 200, {
      url: resolved.url,
      mimeType: resolved.mimeType,
      bitrateKbps: resolved.bitrateKbps,
      source: resolved.source,
      proxyUrl: `/api/audio-proxy?videoId=${encodeURIComponent(videoId)}`,
    });
    return true;
  }

  if (parsed.pathname === '/api/audio-proxy') {
    const videoId = parsed.searchParams.get('videoId') ?? '';
    if (!videoId) {
      res.statusCode = 400;
      res.end('Missing videoId');
      return true;
    }
    await handleChunkedAudioProxy(req, res, videoId);
    return true;
  }

  if (parsed.pathname === '/api/yt/video') {
    const videoId = parsed.searchParams.get('videoId') ?? '';
    const quality = Number(parsed.searchParams.get('quality') ?? '720') || 720;
    const title = parsed.searchParams.get('title') ?? '';
    const artist = parsed.searchParams.get('artist') ?? '';
    const candidateIndex = Math.max(
      0,
      Number.parseInt(parsed.searchParams.get('candidateIndex') ?? '0', 10) || 0,
    );
    if (!videoId) {
      sendJson(res, 400, { error: 'Missing videoId' });
      return true;
    }
    const resolved = await resolveVideoStream(
      videoId,
      quality,
      false,
      title,
      artist,
      candidateIndex,
    );
    sendJson(res, 200, {
      resolvedVideoId: resolved.videoId,
      videoTitle: resolved.videoTitle || '',
      tier: resolved.tier,
      height: resolved.height,
      width: resolved.width,
      fps: resolved.fps,
      bitrateKbps: resolved.bitrateKbps,
      codec: resolved.codec,
      availableHeights: resolved.availableHeights,
      mimeType: resolved.mimeType,
      source: resolved.source,
      candidatesCount: resolved.candidatesCount ?? 1,
      candidateIndex: resolved.candidateIndex ?? 0,
      isOfficialMv: Boolean(resolved.isOfficialMv),
      proxyUrl: `/api/video-proxy?videoId=${encodeURIComponent(resolved.videoId)}&quality=${resolved.tier}`,
    });
    return true;
  }

  if (parsed.pathname === '/api/video-proxy') {
    const videoId = parsed.searchParams.get('videoId') ?? '';
    const quality = Number(parsed.searchParams.get('quality') ?? '720') || 720;
    if (!videoId) {
      res.statusCode = 400;
      res.end('Missing videoId');
      return true;
    }
    await handleChunkedVideoProxy(req, res, videoId, quality);
    return true;
  }

  if (parsed.pathname === '/api/yt/artist') {
    const name = parsed.searchParams.get('name') ?? '';
    const data = await fetchArtistPage(name, postInnerTube);
    sendJson(res, 200, data);
    return true;
  }

  if (parsed.pathname === '/api/yt/album') {
    const browseId = parsed.searchParams.get('browseId') ?? '';
    if (!browseId) {
      sendJson(res, 400, { error: 'Missing browseId' });
      return true;
    }
    const data = await fetchAlbumTracks(browseId, postInnerTube);
    sendJson(res, 200, data);
    return true;
  }

  if (parsed.pathname === '/api/lyrics') {
    const title = parsed.searchParams.get('title') ?? '';
    const artist = parsed.searchParams.get('artist') ?? '';
    const duration = Number(parsed.searchParams.get('duration') ?? '0');
    const data = await fetchWordSyncedLyrics(title, artist, duration);
    sendJson(res, 200, data);
    return true;
  }

  if (parsed.pathname === '/api/lyrics/romanize' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const data = await romanizeLyricLines(body.trackId, body.lines);
      sendJson(res, 200, data);
    } catch {
      sendJson(res, 400, { status: 'unavailable', subLines: [] });
    }
    return true;
  }

  if (parsed.pathname === '/api/lyrics/translate' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const data = await translateLyricLines(body.trackId, body.lines, body.targetLang);
      sendJson(res, 200, data);
    } catch {
      sendJson(res, 400, { status: 'unavailable', subLines: [] });
    }
    return true;
  }

  if (parsed.pathname === '/api/yt/best-part') {
    const videoId = parsed.searchParams.get('videoId') ?? '';
    const data = await fetchBestPartSignals(videoId);
    sendJson(res, 200, data);
    return true;
  }

  if (parsed.pathname === '/api/yt/sponsorblock') {
    const videoId = parsed.searchParams.get('videoId') ?? '';
    const segments = await fetchSponsorBlockSegments(videoId);
    sendJson(res, 200, { segments });
    return true;
  }

  if (parsed.pathname === '/api/window/mini' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let enabled = false;
    try {
      enabled = Boolean(JSON.parse(Buffer.concat(chunks).toString('utf8')).enabled);
    } catch {
      enabled = false;
    }
    const supported = Boolean(windowMiniHandler);
    if (windowMiniHandler) windowMiniHandler(enabled);
    sendJson(res, 200, { enabled, supported });
    return true;
  }

  return false;
}

module.exports = {
  handleApiRequest,
  resolveAudioStream,
  postInnerTube,
  setWindowMiniHandler,
};
