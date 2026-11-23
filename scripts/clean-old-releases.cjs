const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const curVersion = String(pkg.version || '').trim();
const releaseDir = path.join(rootDir, 'release');

if (!curVersion || !fs.existsSync(releaseDir)) {
  process.exit(0);
}

const escapedVer = curVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const curVersionRe = new RegExp(`(?:^|[\\s_-])${escapedVer}(?=\\.|__|$)`);

const removed = [];
for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
  const name = entry.name;
  const fullPath = path.join(releaseDir, name);
  const lower = name.toLowerCase();

  try {
    if (name === 'win-unpacked' || name === 'builder-debug.yml') {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed.push(name);
      continue;
    }

    if ((lower.endsWith('.exe') || lower.endsWith('.blockmap')) && !curVersionRe.test(name)) {
      fs.rmSync(fullPath, { force: true });
      removed.push(name);
    }
  } catch (err) {
    console.warn(`[clean-old-releases] skipped ${name}: ${err?.message || err}`);
  }
}

console.log(
  removed.length > 0
    ? `[clean-old-releases] kept v${curVersion}; removed ${removed.length} item(s): ${removed.join(', ')}`
    : `[clean-old-releases] kept v${curVersion}; nothing old to remove.`,
);
