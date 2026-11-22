const fs = require('node:fs');
const path = require('node:path');

const REPO_OWNER = 'aayepp';
const REPO_NAME = 'ClaudeWaves-Desktop';
const RELEASES_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const ALLOWED_DOWNLOAD_PREFIXES = [
  `https://github.com/${REPO_OWNER}/${REPO_NAME}/`,
  'https://objects.githubusercontent.com/',
  'https://release-assets.githubusercontent.com/',
  'https://github-releases.githubusercontent.com/',
];

let downloadProgress = {
  downloading: false,
  percent: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  filePath: '',
  error: null,
};

function parseSemver(raw) {
  const clean = String(raw || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function selectWindowsAsset(assets = []) {
  const exeAssets = assets.filter(
    (a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.exe'),
  );
  return (
    exeAssets.find((a) => a.name.toLowerCase().includes('setup')) ||
    exeAssets[0] ||
    null
  );
}

async function checkForUpdates(currentVersion) {
  try {
    const res = await fetch(RELEASES_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `ClaudeWaves-Desktop/${currentVersion}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) {
      return {
        ok: true,
        currentVersion,
        latestVersion: currentVersion,
        hasUpdate: false,
        releaseName: `v${currentVersion}`,
        notes: '',
        publishedAt: '',
        htmlUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
        downloadUrl: '',
        assetName: '',
        assetSize: 0,
        message: 'No GitHub release published yet.',
      };
    }

    if (!res.ok) {
      throw new Error(`GitHub API returned HTTP ${res.status}`);
    }

    const release = await res.json();
    const latestVersion = String(release.tag_name || release.name || currentVersion).replace(/^v/i, '');
    const asset = selectWindowsAsset(Array.isArray(release.assets) ? release.assets : []);

    return {
      ok: true,
      currentVersion,
      latestVersion,
      hasUpdate: compareSemver(latestVersion, currentVersion) > 0,
      releaseName: release.name || `v${latestVersion}`,
      notes: String(release.body || ''),
      publishedAt: String(release.published_at || ''),
      htmlUrl: String(release.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`),
      downloadUrl: asset?.browser_download_url ? String(asset.browser_download_url) : '',
      assetName: asset?.name ? String(asset.name) : '',
      assetSize: Number(asset?.size || 0),
    };
  } catch (err) {
    return {
      ok: false,
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false,
      releaseName: '',
      notes: '',
      publishedAt: '',
      htmlUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
      downloadUrl: '',
      assetName: '',
      assetSize: 0,
      error: err?.message || 'Unable to check GitHub updates',
    };
  }
}

function getUpdateDownloadProgress() {
  return { ...downloadProgress };
}

function isAllowedDownloadUrl(url) {
  return typeof url === 'string' && ALLOWED_DOWNLOAD_PREFIXES.some((p) => url.startsWith(p));
}

async function downloadUpdateAsset(downloadUrl, assetName, downloadsDir) {
  if (downloadProgress.downloading) {
    throw new Error('Update download is already in progress.');
  }
  if (!isAllowedDownloadUrl(downloadUrl)) {
    throw new Error('Blocked untrusted update download origin.');
  }

  const rawBase = path.basename(String(assetName || '').trim() || 'ClaudeWaves-Desktop-Setup.exe');
  const safeName = rawBase.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || 'ClaudeWaves-Desktop-Setup.exe';
  const targetPath = path.join(downloadsDir, safeName);
  const tmpPath = `${targetPath}.part`;

  downloadProgress = {
    downloading: true,
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    filePath: '',
    error: null,
  };

  try {
    fs.mkdirSync(downloadsDir, { recursive: true });
    const res = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': `ClaudeWaves-Desktop`,
      },
    });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download update (HTTP ${res.status})`);
    }
    if (!isAllowedDownloadUrl(res.url)) {
      throw new Error('Redirected update URL failed origin verification.');
    }

    const totalBytes = Number(res.headers.get('content-length') || 0);
    downloadProgress.totalBytes = totalBytes;

    const writer = fs.createWriteStream(tmpPath);
    const reader = res.body.getReader();
    let downloadedBytes = 0;

    try {
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          downloadedBytes += value.byteLength;
          if (!writer.write(Buffer.from(value))) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => writer.once('drain', r));
          }
          downloadProgress.downloadedBytes = downloadedBytes;
          downloadProgress.percent =
            totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        }
      }
      await new Promise((r, rej) => {
        writer.once('error', rej);
        writer.end(r);
      });
    } catch (streamErr) {
      try {
        writer.destroy();
      } catch {
        // ignore
      }
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      throw streamErr;
    }

    fs.renameSync(tmpPath, targetPath);
    downloadProgress = {
      downloading: false,
      percent: 100,
      downloadedBytes,
      totalBytes: totalBytes || downloadedBytes,
      filePath: targetPath,
      error: null,
    };
    return { ok: true, filePath: targetPath };
  } catch (err) {
    downloadProgress = {
      ...downloadProgress,
      downloading: false,
      error: err?.message || 'Update download failed',
    };
    throw err;
  }
}

module.exports = {
  REPO_OWNER,
  REPO_NAME,
  compareSemver,
  checkForUpdates,
  getUpdateDownloadProgress,
  downloadUpdateAsset,
};
