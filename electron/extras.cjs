// Artist Page, Album Tracks, Word-Synced Lyrics (BetterLyrics TTML + LRCLIB), and Best Part Detection

const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function extractRunsText(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) {
    return node.runs.map((r) => (typeof r?.text === 'string' ? r.text : '')).join('').trim();
  }
  return '';
}

function highResThumb(url, videoId) {
  if (!url && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (!url) return '';
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

function parseResponsiveTrack(item, fallbackArtist) {
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
  let plays = null;
  const info = [];
  for (const p of parts) {
    const d = parseDurationMs(p);
    if (d > 0 && durationMs === 0) durationMs = d;
    else if (/plays|views/i.test(p)) plays = p;
    else info.push(p);
  }
  if (cols[2]) {
    const c2 = extractRunsText(cols[2]?.musicResponsiveListItemFlexColumnRenderer?.text);
    if (/plays|views/i.test(c2) && !plays) plays = c2;
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
    artist: info[0] || fallbackArtist || 'YouTube Music',
    album: info[1],
    plays: plays || undefined,
    durationMs,
    thumbnailUrl: highResThumb(thumbUrl, videoId),
  };
}

// --- 1. ARTIST PAGE & ALBUMS ---

async function fetchArtistPage(artistName, postInnerTube) {
  const cleanName = String(artistName || '').split(/[,&•]/)[0].trim();
  if (!cleanName) throw new Error('Missing artist name');

  // Search artist channel
  let browseId = null;
  let fallbackBanner = '';
  try {
    const searchRes = await postInnerTube('search', {
      query: cleanName,
      params: 'EgWKAQIgAWoKEAkQBRAKEAMQBA%3D%3D', // Artists filter
    });
    function findArtistItem(node) {
      if (Array.isArray(node)) {
        for (const el of node) {
          const found = findArtistItem(el);
          if (found) return found;
        }
        return null;
      }
      if (!node || typeof node !== 'object') return null;
      const item = node.musicResponsiveListItemRenderer;
      if (item) {
        const bid = item?.navigationEndpoint?.browseEndpoint?.browseId;
        if (typeof bid === 'string' && bid.startsWith('UC')) {
          const thumbs = item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          return { bid, thumb: thumbs[thumbs.length - 1]?.url || '' };
        }
      }
      for (const v of Object.values(node)) {
        const found = findArtistItem(v);
        if (found) return found;
      }
      return null;
    }
    const found = findArtistItem(searchRes);
    if (found) {
      browseId = found.bid;
      fallbackBanner = highResThumb(found.thumb);
    }
  } catch {
    // Fallback below
  }

  let name = cleanName;
  let description = '';
  let subscribers = '';
  let bannerUrl = fallbackBanner;
  const topSongs = [];
  const albums = [];

  if (browseId) {
    try {
      const root = await postInnerTube('browse', { browseId });
      const header =
        root?.header?.musicImmersiveHeaderRenderer ||
        root?.header?.musicVisualHeaderRenderer ||
        root?.header?.musicDetailHeaderRenderer;

      if (header) {
        name = extractRunsText(header.title) || name;
        description = extractRunsText(header.description) || '';
        subscribers =
          extractRunsText(header?.subscriptionButton?.subscribeButtonRenderer?.longSubscriberCountText) ||
          extractRunsText(header?.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText) ||
          '';
        const thumbs =
          header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
          header?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
          [];
        const best = thumbs[thumbs.length - 1]?.url;
        if (best) bannerUrl = best.replace(/=w\d+-h\d+[^&]*/, '=w1080-h540-l90-rj');
      }

      const seenSongs = new Set();
      const seenAlbums = new Set();

      function walkArtist(node) {
        if (Array.isArray(node)) return node.forEach(walkArtist);
        if (!node || typeof node !== 'object') return;

        // Top songs shelf
        if (node.musicShelfRenderer) {
          const items = node.musicShelfRenderer.contents || [];
          for (const entry of items) {
            const tr = parseResponsiveTrack(entry?.musicResponsiveListItemRenderer, name);
            if (tr && !seenSongs.has(tr.videoId)) {
              seenSongs.add(tr.videoId);
              topSongs.push(tr);
            }
          }
          return;
        }

        // Albums & Singles carousels
        if (node.musicCarouselShelfRenderer) {
          const shelfTitle = extractRunsText(
            node.musicCarouselShelfRenderer?.header?.musicCarouselShelfBasicHeaderRenderer?.title,
          );
          if (/album|single|ep/i.test(shelfTitle)) {
            const contents = node.musicCarouselShelfRenderer.contents || [];
            for (const entry of contents) {
              const card = entry?.musicTwoRowItemRenderer;
              if (!card) continue;
              const albumBrowseId = card?.navigationEndpoint?.browseEndpoint?.browseId;
              const albumTitle = extractRunsText(card.title);
              if (!albumBrowseId || !albumTitle || seenAlbums.has(albumBrowseId)) continue;
              seenAlbums.add(albumBrowseId);
              const thumbs = card?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
              albums.push({
                browseId: albumBrowseId,
                title: albumTitle,
                subtitle: extractRunsText(card.subtitle) || shelfTitle,
                thumbnailUrl: highResThumb(thumbs[thumbs.length - 1]?.url),
              });
            }
          }
          return;
        }

        Object.values(node).forEach(walkArtist);
      }

      walkArtist(root);
    } catch {
      // Fall through to search enrichment
    }
  }

  // Enrich with top song search if channel had few songs
  if (topSongs.length < 8) {
    try {
      const songSearch = await postInnerTube('search', {
        query: `${name} top songs`,
        params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
      });
      const seen = new Set(topSongs.map((t) => t.videoId));
      function walkSongs(node) {
        if (Array.isArray(node)) return node.forEach(walkSongs);
        if (!node || typeof node !== 'object') return;
        if (node.musicResponsiveListItemRenderer) {
          const tr = parseResponsiveTrack(node.musicResponsiveListItemRenderer, name);
          if (tr && !seen.has(tr.videoId)) {
            seen.add(tr.videoId);
            topSongs.push(tr);
          }
          return;
        }
        Object.values(node).forEach(walkSongs);
      }
      walkSongs(songSearch);
    } catch {
      // Ignore
    }
  }

  if (!bannerUrl && topSongs[0]?.thumbnailUrl) {
    bannerUrl = topSongs[0].thumbnailUrl;
  }

  // Mark top 5 songs with isTopSong star remark
  const annotatedSongs = topSongs.slice(0, 20).map((t, idx) => ({
    ...t,
    isTopSong: idx < 5,
  }));

  return {
    name,
    browseId,
    subscribers,
    description: description.slice(0, 320),
    bannerUrl,
    topSongs: annotatedSongs,
    albums: albums.slice(0, 16),
  };
}

async function fetchAlbumTracks(browseId, postInnerTube) {
  const root = await postInnerTube('browse', { browseId });
  const header =
    root?.header?.musicDetailHeaderRenderer ||
    root?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer;

  const title = extractRunsText(header?.title) || 'Album';
  const subtitle = extractRunsText(header?.subtitle) || '';
  const thumbs =
    header?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
    header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    [];
  const coverUrl = highResThumb(thumbs[thumbs.length - 1]?.url);

  const tracks = [];
  const seen = new Set();
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.musicResponsiveListItemRenderer) {
      const tr = parseResponsiveTrack(node.musicResponsiveListItemRenderer, subtitle.split('•')[0]?.trim());
      if (tr && !seen.has(tr.videoId)) {
        seen.add(tr.videoId);
        tracks.push({
          ...tr,
          album: title,
          thumbnailUrl: tr.thumbnailUrl || coverUrl,
        });
      }
      return;
    }
    Object.values(node).forEach(walk);
  }
  walk(root);

  return { browseId, title, subtitle, coverUrl, tracks };
}

// --- 2. WORD-BY-WORD SYNCED LYRICS (BetterLyrics TTML + LRCLIB Smart Word Split) ---

function parseTtmlTimeMs(raw) {
  const s = String(raw || '').trim();
  if (!s) return 0;
  if (s.endsWith('s')) return Math.round(parseFloat(s) * 1000) || 0;
  const parts = s.split(':').map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
  if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000);
  return Math.round(parts[0] * 1000);
}

function unescapeXml(str) {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseTtmlWordLyrics(ttml) {
  const lines = [];
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let pm;
  while ((pm = pRegex.exec(ttml)) !== null) {
    const attrs = pm[1];
    const inner = pm[2];
    const beginM = /begin="([^"]+)"/i.exec(attrs);
    const endM = /end="([^"]+)"/i.exec(attrs);
    const lineStart = beginM ? parseTtmlTimeMs(beginM[1]) : 0;
    const lineEnd = endM ? parseTtmlTimeMs(endM[1]) : lineStart + 3500;

    // Preserve exact inter-span whitespace so syllable spans (e.g. <span>dia</span><span>monds</span>)
    // merge into ONE whole word ("diamonds") instead of splitting into "dia monds"!
    const words = [];
    const spanRegex = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
    let sm;
    let lastEndIdx = 0;

    while ((sm = spanRegex.exec(inner)) !== null) {
      const sAttrs = sm[1];
      if (/x-bg/i.test(sAttrs)) {
        lastEndIdx = spanRegex.lastIndex;
        continue;
      }
      const gapBetween = inner.slice(lastEndIdx, sm.index);
      const rawText = unescapeXml(sm[2].replace(/<[^>]+>/g, ''));
      const trimmed = rawText.trim();
      lastEndIdx = spanRegex.lastIndex;
      if (!trimmed) continue;

      const sBegin = /begin="([^"]+)"/i.exec(sAttrs);
      const sEnd = /end="([^"]+)"/i.exec(sAttrs);
      const startMs = sBegin ? parseTtmlTimeMs(sBegin[1]) : lineStart;
      const endMs = sEnd ? parseTtmlTimeMs(sEnd[1]) : Math.max(startMs + 240, lineEnd);

      const hasSpaceBefore =
        words.length === 0 ||
        /\s/.test(gapBetween) ||
        /^\s/.test(rawText) ||
        words[words.length - 1]._trailingSpace;

      if (!hasSpaceBefore && words.length > 0) {
        // Merge syllable into previous word!
        const prev = words[words.length - 1];
        prev.text += trimmed;
        prev.endMs = Math.max(prev.endMs, endMs);
        prev._trailingSpace = /\s$/.test(rawText);
      } else {
        words.push({
          text: trimmed,
          startMs,
          endMs,
          _trailingSpace: /\s$/.test(rawText),
        });
      }
    }

    // Guarantee every word has clean monotonic startMs < endMs so word-grow animation never stalls
    const cleanWords = words.map(({ text, startMs, endMs }, idx) => {
      const nextStart = words[idx + 1]?.startMs;
      const safeEnd = Math.max(startMs + 90, nextStart ? Math.min(endMs, nextStart) : endMs);
      return { text, startMs, endMs: safeEnd };
    });
    const plainText =
      cleanWords.length > 0
        ? cleanWords.map((w) => w.text).join(' ')
        : unescapeXml(inner.replace(/<[^>]+>/g, ''))
            .replace(/\s+/g, ' ')
            .trim();

    if (!plainText) continue;

    // If TTML gave all words identical timestamps (line-level only), distribute across line span
    const allSameStart =
      cleanWords.length > 1 && cleanWords.every((w) => w.startMs === cleanWords[0].startMs);
    const finalWords =
      cleanWords.length === 0 || allSameStart
        ? buildInterpolatedWords(plainText, lineStart, lineEnd)
        : cleanWords;

    lines.push({
      timeMs: finalWords[0]?.startMs ?? lineStart,
      endMs: finalWords[finalWords.length - 1]?.endMs ?? lineEnd,
      text: plainText,
      words: finalWords,
    });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function buildInterpolatedWords(text, startMs, endMs) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const span = Math.max(600, Math.min(8000, endMs - startMs));
  const totalWeight = tokens.reduce((sum, w) => sum + Math.max(1, w.length), 0);
  let cursor = startMs;
  return tokens.map((word, idx) => {
    const share = (Math.max(1, word.length) / totalWeight) * span;
    const wStart = Math.round(cursor);
    cursor += share;
    const wEnd = idx === tokens.length - 1 ? Math.round(startMs + span) : Math.round(cursor);
    return { text: word, startMs: wStart, endMs: Math.max(wStart + 80, wEnd) };
  });
}

function parseLrcWithWords(raw) {
  const tagRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?]/g;
  const rawLines = [];
  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const times = [];
    let m;
    tagRegex.lastIndex = 0;
    while ((m = tagRegex.exec(trimmed)) !== null) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] || '';
      const ms =
        frac.length === 0
          ? 0
          : frac.length === 1
            ? Number(frac) * 100
            : frac.length === 2
              ? Number(frac) * 10
              : Number(frac.slice(0, 3));
      times.push((min * 60 + sec) * 1000 + ms);
    }
    if (times.length === 0) continue;
    const text = trimmed.replace(tagRegex, '').trim();
    if (!text) continue;
    for (const t of times) {
      rawLines.push({ timeMs: t, text });
    }
  }
  rawLines.sort((a, b) => a.timeMs - b.timeMs);
  return rawLines.map((line, i) => {
    const nextMs = rawLines[i + 1]?.timeMs ?? line.timeMs + 4000;
    const endMs = Math.max(line.timeMs + 500, Math.min(line.timeMs + 7500, nextMs - 60));
    return {
      timeMs: line.timeMs,
      endMs,
      text: line.text,
      words: buildInterpolatedWords(line.text, line.timeMs, endMs),
    };
  });
}

function cleanTrackTitle(title) {
  return String(title || '')
    .replace(/\s*[([](?:official|lyrics|audio|video|hd|4k|feat\.|ft\.)[^)\]]*[)\]]/gi, '')
    .trim();
}

async function fetchWordSyncedLyrics(title, artist, durationMs) {
  const t = cleanTrackTitle(title);
  const a = String(artist || '').split(/[,&]/)[0].trim();
  const durSec = durationMs > 0 ? Math.round(durationMs / 1000) : null;

  // 1. BetterLyrics TTML (exact word/syllable timing like Apple Music & ClaudeWaves Android)
  for (const endpoint of [
    'https://lyrics-api.boidu.dev/getLyrics',
    'https://lyrics-api.boidu.dev/ttml/getLyrics',
  ]) {
    try {
      const qs = new URLSearchParams({ s: t, a });
      if (durSec) qs.set('d', String(durSec));
      const res = await fetch(`${endpoint}?${qs}`, {
        headers: { 'User-Agent': 'ClaudeWaves-Desktop/1.0' },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const data = await res.json();
        const ttml = data?.ttml || data?.lyrics;
        if (typeof ttml === 'string' && ttml.includes('<p')) {
          const lines = parseTtmlWordLyrics(ttml);
          if (lines.length > 0) {
            return { kind: 'synced', wordSynced: true, source: 'BetterLyrics', lines };
          }
        }
      }
    } catch {
      // Fall back cleanly
    }
  }

  // 2. LRCLIB fallback with intelligent word-by-word timing distribution
  const tryLrclib = async (url) => {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'ClaudeWaves-Desktop/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  };

  const qsExact = new URLSearchParams({ track_name: t, artist_name: a });
  if (durSec) qsExact.set('duration', String(durSec));
  const qsLoose = new URLSearchParams({ track_name: t, artist_name: a });

  let record =
    (await tryLrclib(`https://lrclib.net/api/get?${qsExact}`)) ||
    (await tryLrclib(`https://lrclib.net/api/get?${qsLoose}`));

  if (!record) {
    const list = await tryLrclib(`https://lrclib.net/api/search?q=${encodeURIComponent(`${t} ${a}`)}`);
    if (Array.isArray(list)) {
      record = list.find((x) => x.syncedLyrics) || list[0] || null;
    }
  }

  if (!record) return { kind: 'empty' };
  if (record.instrumental) return { kind: 'instrumental' };
  if (record.syncedLyrics) {
    const lines = parseLrcWithWords(record.syncedLyrics);
    if (lines.length > 0) {
      return { kind: 'synced', wordSynced: false, source: 'LRCLIB', lines };
    }
  }
  if (record.plainLyrics?.trim()) {
    return { kind: 'plain', text: record.plainLyrics.trim() };
  }
  return { kind: 'empty' };
}

// --- 3. BEST PART DETECTION (YouTube Heatmap + Chapters, matching BestPart.kt) ---

async function fetchBestPartSignals(videoId) {
  if (!videoId) return { bestPartMs: null, source: null };
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': WEB_UA,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20251101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { bestPartMs: null, source: null };
    const root = await res.json();

    const heatMarkers = [];
    const chapters = [];

    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;

      if (node.heatMarkerRenderer) {
        const hm = node.heatMarkerRenderer;
        const startMs = Number(hm.timeRangeStartMillis);
        const intensity = Number(hm.heatMarkerIntensityScoreNormalized);
        if (Number.isFinite(startMs) && Number.isFinite(intensity)) {
          heatMarkers.push({ startMs, intensity });
        }
        return;
      }
      if (node.chapterRenderer) {
        const ch = node.chapterRenderer;
        const startMs = Number(ch.timeRangeStartMillis);
        const title = extractRunsText(ch.title);
        if (Number.isFinite(startMs) && title) {
          chapters.push({ title, startMs });
        }
        return;
      }
      Object.values(node).forEach(walk);
    }
    walk(root);

    // Layer 1: YouTube Most Replayed Heatmap (exact BestPart.kt algorithm)
    if (heatMarkers.length >= 10) {
      const body = heatMarkers.slice(Math.floor(heatMarkers.length / 10));
      let peakIdx = 0;
      for (let i = 1; i < body.length; i++) {
        if (body[i].intensity > body[peakIdx].intensity) peakIdx = i;
      }
      let foot = peakIdx;
      while (foot > 0 && body[foot - 1].intensity <= body[foot].intensity + 0.005) foot--;
      const target = body[Math.max(foot, peakIdx - 2)];
      if (target) {
        return { bestPartMs: target.startMs, source: 'Most Replayed' };
      }
    }

    // Layer 2: Chapter Chorus Markers (EN, Malay "Reff", JP, KR, CN)
    const chExclude = /\b(pre[-\s]?chorus|pre[-\s]?reff|intro|outro|verse|interlude|ending)\b/i;
    const chMatch = /\b(chorus|hook|refrain|reff|drop|climax|best\s*part)\b|サビ|후렴|副歌/i;
    const chorusChap = chapters.find((c) => !chExclude.test(c.title) && chMatch.test(c.title));
    if (chorusChap) {
      return { bestPartMs: Math.max(0, chorusChap.startMs - 800), source: 'Chapter Chorus' };
    }
  } catch {
    // Ignore and let frontend lyric chorus fallback handle it
  }
  return { bestPartMs: null, source: null };
}

const sponsorBlockCache = new Map();

async function fetchSponsorBlockSegments(videoId) {
  const cleanId = String(videoId || '').trim();
  if (!cleanId) return [];
  if (sponsorBlockCache.has(cleanId)) {
    return sponsorBlockCache.get(cleanId);
  }
  try {
    const cats = encodeURIComponent(
      JSON.stringify(['music_offtopic', 'intro', 'outro', 'sponsor', 'selfpromo', 'interaction']),
    );
    const res = await fetch(
      `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(cleanId)}&categories=${cats}`,
      { signal: AbortSignal.timeout(3500) },
    );
    if (!res.ok) {
      sponsorBlockCache.set(cleanId, []);
      return [];
    }
    const rows = await res.json();
    const segments = Array.isArray(rows)
      ? rows
          .map((row) => {
            const seg = Array.isArray(row?.segment) ? row.segment : [];
            const startSec = Number(seg[0]);
            const endSec = Number(seg[1]);
            const category = String(row?.category || 'non-music');
            if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec - startSec < 1.2) {
              return null;
            }
            return { startSec, endSec, category };
          })
          .filter(Boolean)
          .sort((a, b) => a.startSec - b.startSec)
      : [];
    if (sponsorBlockCache.size > 250) {
      const oldest = sponsorBlockCache.keys().next().value;
      if (oldest) sponsorBlockCache.delete(oldest);
    }
    sponsorBlockCache.set(cleanId, segments);
    return segments;
  } catch {
    return [];
  }
}

const ROMANIZE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MAX_ROMANIZE_BATCH_CHARS = 3500;
const MAX_ROMANIZE_CACHE = 40;
const ROMANIZE_MARKER_RE = /\uE000[^\uE001]*\uE001/g;
const romanizeCache = new Map();

function hasNonLatinLettersText(text) {
  for (const ch of String(text || '')) {
    if (/\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch)) {
      return true;
    }
  }
  return false;
}

function normalizeComparableLyric(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getCachedRomanize(key) {
  if (!romanizeCache.has(key)) return null;
  const val = romanizeCache.get(key);
  romanizeCache.delete(key);
  romanizeCache.set(key, val);
  return val;
}

function putCachedRomanize(key, val) {
  if (romanizeCache.has(key)) romanizeCache.delete(key);
  romanizeCache.set(key, val);
  while (romanizeCache.size > MAX_ROMANIZE_CACHE) {
    const oldest = romanizeCache.keys().next().value;
    if (oldest) romanizeCache.delete(oldest);
    else break;
  }
}

async function requestRomanizeBatch(slots) {
  const payload = slots
    .map((slot, idx) => (idx > 0 ? `\n\uE000${String(idx).padStart(4, '0')}\uE001\n${slot.text}` : slot.text))
    .join('');
  const form = new URLSearchParams();
  form.set('client', 'dict-chrome-ex');
  form.set('sl', 'auto');
  form.set('tl', 'en');
  form.set('dt', 'rm');
  form.set('q', payload);

  const res = await fetch(ROMANIZE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'User-Agent': 'ClaudeWaves-Desktop/1.4',
      Accept: 'application/json',
    },
    body: form.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const root = await res.json().catch(() => null);
  if (!Array.isArray(root) || !Array.isArray(root[0])) return null;

  const sourceLanguage = typeof root[2] === 'string' ? root[2] : '';
  const body = root[0]
    .map((seg) => (Array.isArray(seg) && typeof seg[3] === 'string' ? seg[3] : ''))
    .join('');
  if (!body.trim()) return null;

  let parts = body.split(ROMANIZE_MARKER_RE).map((s) => s.trim());
  if (parts.length !== slots.length && slots.length > 1) {
    const lineSplit = body
      .split(/\r?\n/)
      .map((s) => s.replace(ROMANIZE_MARKER_RE, '').trim())
      .filter(Boolean);
    if (lineSplit.length === slots.length) {
      parts = lineSplit;
    }
  }
  if (parts.length !== slots.length || parts.some((p) => !p)) return null;
  return { sourceLanguage, translations: parts };
}

async function romanizeLyricLines(trackId, lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { status: 'unavailable', subLines: [] };
  }

  const slots = [];
  lines.forEach((rawLine, index) => {
    const text = String(rawLine || '').trim();
    if (!text) return;
    const isHeader = text.length >= 3 && text.startsWith('[') && text.endsWith(']');
    const inner = isHeader ? text.slice(1, -1).trim() : text;
    if (inner) {
      slots.push({ lineIndex: index, text: inner, isHeader });
    }
  });

  if (slots.length === 0 || !slots.some((s) => hasNonLatinLettersText(s.text))) {
    return { status: 'already_latin', subLines: [] };
  }

  const cacheKey = `${String(trackId || '')}|${slots.length}|${slots[0]?.text || ''}|${slots[slots.length - 1]?.text || ''}`;
  const cached = getCachedRomanize(cacheKey);
  if (cached) return cached;

  const batches = [];
  let curBatch = [];
  let curChars = 0;
  for (const slot of slots) {
    const add = slot.text.length + (curBatch.length > 0 ? 8 : 0);
    if (curBatch.length > 0 && curChars + add > MAX_ROMANIZE_BATCH_CHARS) {
      batches.push(curBatch);
      curBatch = [];
      curChars = 0;
    }
    curBatch.push(slot);
    curChars += add;
  }
  if (curBatch.length > 0) batches.push(curBatch);

  const answers = [];
  for (let i = 0; i < batches.length; i += 2) {
    const chunk = batches.slice(i, i + 2);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(chunk.map((b) => requestRomanizeBatch(b).catch(() => null)));
    answers.push(...results);
  }

  if (answers.some((a) => !a)) {
    return { status: 'unavailable', subLines: [] };
  }

  const romanizedTexts = answers.flatMap((a) => a.translations);
  const sourceLanguage = answers.find((a) => a?.sourceLanguage)?.sourceLanguage || '';
  if (romanizedTexts.length !== slots.length) {
    return { status: 'unavailable', subLines: [] };
  }

  const byIndex = new Map();
  slots.forEach((slot, idx) => {
    const rom = romanizedTexts[idx];
    byIndex.set(slot.lineIndex, slot.isHeader ? `[${rom}]` : rom);
  });

  let anyChanged = false;
  const subLines = lines.map((orig, idx) => {
    const sub = byIndex.get(idx);
    if (!sub) return null;
    if (normalizeComparableLyric(sub) === normalizeComparableLyric(orig)) return null;
    anyChanged = true;
    return sub;
  });

  if (!anyChanged) {
    return { status: 'unavailable', subLines: [] };
  }

  const out = { status: 'ok', sourceLanguage, subLines };
  putCachedRomanize(cacheKey, out);
  return out;
}

module.exports = {
  fetchArtistPage,
  fetchAlbumTracks,
  fetchWordSyncedLyrics,
  fetchBestPartSignals,
  fetchSponsorBlockSegments,
  romanizeLyricLines,
};
