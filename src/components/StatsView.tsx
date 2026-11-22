import React, { useMemo, useState } from 'react';
import { GlassButton, GlassCard } from '@zakisheriff/liquid-glass';
import {
  Award,
  BarChart3,
  Clock,
  Disc3,
  Download,
  Flame,
  Music2,
  Play,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ListeningStats, Track, TrackPlayStat } from '../types';

interface StatsViewProps {
  stats: ListeningStats;
  likedCount: number;
  playlistCount: number;
  downloadedCount: number;
  profileName: string;
  profileAvatar: string | null;
  accentHex: string;
  intensity: number;
  onPlayTrack: (track: Track, queue: Track[]) => void;
  onOpenArtist: (artistName: string) => void;
  onToast: (msg: string) => void;
}

type WrappedThemeId = 'aurora' | 'gold' | 'crimson' | 'mono';

interface WrappedThemeDef {
  id: WrappedThemeId;
  label: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  accent: string;
  text: string;
  muted: string;
  pillBg: string;
}

const WRAPPED_THEMES: WrappedThemeDef[] = [
  {
    id: 'aurora',
    label: 'Aurora Teal',
    bgStart: '#0B132B',
    bgMid: '#122938',
    bgEnd: '#071018',
    accent: '#2EE59D',
    text: '#F8FAFC',
    muted: 'rgba(226, 232, 240, 0.72)',
    pillBg: 'rgba(46, 229, 157, 0.14)',
  },
  {
    id: 'gold',
    label: 'Obsidian Gold',
    bgStart: '#14110B',
    bgMid: '#241B0D',
    bgEnd: '#0B0907',
    accent: '#F5C451',
    text: '#FFFBEB',
    muted: 'rgba(254, 243, 199, 0.72)',
    pillBg: 'rgba(245, 196, 81, 0.16)',
  },
  {
    id: 'crimson',
    label: 'Crimson Pulse',
    bgStart: '#1D0B14',
    bgMid: '#360F21',
    bgEnd: '#0E070B',
    accent: '#FF4F8B',
    text: '#FFF1F2',
    muted: 'rgba(255, 228, 230, 0.74)',
    pillBg: 'rgba(255, 79, 139, 0.16)',
  },
  {
    id: 'mono',
    label: 'Nothing Mono',
    bgStart: '#0D0D0F',
    bgMid: '#18181B',
    bgEnd: '#09090B',
    accent: '#FF2D3A',
    text: '#FAFAFA',
    muted: 'rgba(212, 212, 216, 0.7)',
    pillBg: 'rgba(255, 45, 58, 0.16)',
  },
];

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatHoursMinutes(totalSec: number): string {
  const mins = Math.max(0, Math.round(totalSec / 60));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function computeStreak(dailyPlays: Record<string, number>): { streak: number; activeDays: number } {
  const activeDays = Object.values(dailyPlays).filter((n) => n > 0).length;
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 90; i++) {
    const key = formatDateKey(cursor);
    const count = dailyPlays[key] ?? 0;
    if (count > 0) {
      streak += 1;
    } else if (i > 0) {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, activeDays };
}

function derivePersona(totalPlays: number, uniqueArtists: number): string {
  if (totalPlays === 0) return 'First Listen Ready';
  if (uniqueArtists >= 15 && totalPlays >= 40) return 'Genre Explorer';
  if (totalPlays >= 80) return 'Night-Shift Audiophile';
  if (totalPlays >= 25) return 'Daily Wave Rider';
  return 'Rising Listener';
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function tryLoadCorsBitmap(url?: string | null): Promise<ImageBitmap | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export const StatsView: React.FC<StatsViewProps> = ({
  stats,
  likedCount,
  playlistCount,
  downloadedCount,
  profileName,
  accentHex,
  intensity,
  onPlayTrack,
  onOpenArtist,
  onToast,
}) => {
  const [wrappedThemeId, setWrappedThemeId] = useState<WrappedThemeId>('aurora');
  const [exporting, setExporting] = useState(false);

  const dailyPlays = stats.dailyPlays ?? {};
  const dailyListenSec = stats.dailyListenSec ?? {};

  const topArtists = useMemo(() => {
    return Object.entries(stats.artistCounts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [stats.artistCounts]);

  const topTrackStats = useMemo<TrackPlayStat[]>(() => {
    return Object.values(stats.trackCounts || {})
      .filter((entry) => entry && entry.track && entry.count > 0)
      .sort((a, b) => b.count - a.count || b.lastPlayedAtMs - a.lastPlayedAtMs)
      .slice(0, 8);
  }, [stats.trackCounts]);

  const topTrackList = useMemo(() => topTrackStats.map((item) => item.track), [topTrackStats]);

  const last7Days = useMemo(() => {
    const out: Array<{ key: string; label: string; plays: number; minutes: number }> = [];
    const base = new Date();
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(base);
      d.setDate(base.getDate() - offset);
      const key = formatDateKey(d);
      out.push({
        key,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        plays: dailyPlays[key] ?? 0,
        minutes: Math.round((dailyListenSec[key] ?? 0) / 60),
      });
    }
    return out;
  }, [dailyPlays, dailyListenSec]);

  const maxDayPlays = useMemo(
    () => Math.max(1, ...last7Days.map((d) => d.plays)),
    [last7Days],
  );

  const uniqueArtistsCount = useMemo(
    () => Object.keys(stats.artistCounts || {}).length,
    [stats.artistCounts],
  );

  const { streak, activeDays } = useMemo(
    () => computeStreak(dailyPlays),
    [dailyPlays],
  );

  const wrappedTheme = useMemo(
    () => WRAPPED_THEMES.find((t) => t.id === wrappedThemeId) ?? WRAPPED_THEMES[0],
    [wrappedThemeId],
  );

  const listenerLabel = profileName.trim() || 'You';
  const persona = useMemo(
    () => derivePersona(stats.totalPlays, uniqueArtistsCount),
    [stats.totalPlays, uniqueArtistsCount],
  );
  const topArtistName = topArtists[0]?.[0] ?? 'Play music to unlock';
  const totalMinutes = Math.round((stats.totalListenSec || 0) / 60);
  const topArtistMax = topArtists[0]?.[1] || 1;

  const handleExportWrappedPng = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const W = 1080;
      const H = 1350;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');

      // Rich layered backdrop gradient
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, wrappedTheme.bgStart);
      bgGrad.addColorStop(0.52, wrappedTheme.bgMid);
      bgGrad.addColorStop(1, wrappedTheme.bgEnd);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Ambient accent glow circles
      const glow1 = ctx.createRadialGradient(W * 0.84, H * 0.16, 10, W * 0.84, H * 0.16, 460);
      glow1.addColorStop(0, `${wrappedTheme.accent}44`);
      glow1.addColorStop(1, 'transparent');
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, W, H);

      const glow2 = ctx.createRadialGradient(W * 0.18, H * 0.86, 10, W * 0.18, H * 0.86, 420);
      glow2.addColorStop(0, `${wrappedTheme.accent}28`);
      glow2.addColorStop(1, 'transparent');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, W, H);

      // Subtle card border inset
      ctx.strokeStyle = `${wrappedTheme.accent}45`;
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, 44, 44, W - 88, H - 88, 44);
      ctx.stroke();

      // Year & Brand header
      const year = new Date().getFullYear();
      ctx.fillStyle = wrappedTheme.pillBg;
      drawRoundedRect(ctx, 88, 92, 370, 52, 26);
      ctx.fill();
      ctx.fillStyle = wrappedTheme.accent;
      ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`CLAUDEWAVES WRAPPED ${year}`, 114, 126);

      // Listener + Persona
      ctx.fillStyle = wrappedTheme.text;
      ctx.font = '800 58px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`${listenerLabel}'s Year in Sound`, 88, 224, W - 176);

      ctx.fillStyle = wrappedTheme.accent;
      ctx.font = '700 28px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`Persona: ${persona}`, 88, 272, W - 176);

      // Cover crest / top track artwork block
      const coverBitmap = await tryLoadCorsBitmap(topTrackStats[0]?.track.thumbnailUrl);
      const heroY = 324;
      const artSize = 230;
      ctx.save();
      drawRoundedRect(ctx, 88, heroY, artSize, artSize, 28);
      ctx.clip();
      if (coverBitmap) {
        ctx.drawImage(coverBitmap, 88, heroY, artSize, artSize);
        coverBitmap.close();
      } else {
        const tileGrad = ctx.createLinearGradient(88, heroY, 88 + artSize, heroY + artSize);
        tileGrad.addColorStop(0, wrappedTheme.accent);
        tileGrad.addColorStop(1, wrappedTheme.bgStart);
        ctx.fillStyle = tileGrad;
        ctx.fillRect(88, heroY, artSize, artSize);
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 76px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('♪', 88 + 86, heroY + 142);
      }
      ctx.restore();

      // Big KPIs next to cover
      const kpiX = 356;
      ctx.fillStyle = wrappedTheme.muted;
      ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('MINUTES LISTENED', kpiX, heroY + 46);
      ctx.fillStyle = wrappedTheme.text;
      ctx.font = '800 78px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(totalMinutes.toLocaleString(), kpiX, heroY + 124);

      ctx.fillStyle = wrappedTheme.muted;
      ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(
        `${stats.totalPlays} plays • ${uniqueArtistsCount} artists`,
        kpiX,
        heroY + 178,
        W - kpiX - 88,
      );
      ctx.fillStyle = wrappedTheme.accent;
      ctx.font = '700 26px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`#1 Artist: ${topArtistName}`, kpiX, heroY + 220, W - kpiX - 88);

      // Top 5 Tracks Panel
      const listY = 610;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      drawRoundedRect(ctx, 88, listY, W - 176, 540, 32);
      ctx.fill();

      ctx.fillStyle = wrappedTheme.muted;
      ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('TOP TRACKS', 124, listY + 56);

      const top5 = topTrackStats.slice(0, 5);
      if (top5.length === 0) {
        ctx.fillStyle = wrappedTheme.muted;
        ctx.font = '600 28px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Play songs to populate your Top 5 Wrapped list.', 124, listY + 140);
      } else {
        top5.forEach((item, idx) => {
          const rowY = listY + 114 + idx * 84;
          ctx.fillStyle = wrappedTheme.accent;
          ctx.font = '800 32px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(`0${idx + 1}`, 124, rowY + 14);

          ctx.fillStyle = wrappedTheme.text;
          ctx.font = '700 29px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(item.track.title, 198, rowY + 4, W - 440);

          ctx.fillStyle = wrappedTheme.muted;
          ctx.font = '500 22px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(item.track.artist, 198, rowY + 34, W - 440);

          ctx.fillStyle = wrappedTheme.muted;
          ctx.font = '700 24px "Segoe UI", system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(`${item.count}x`, W - 124, rowY + 14);
          ctx.textAlign = 'left';
        });
      }

      // Footer
      ctx.fillStyle = wrappedTheme.muted;
      ctx.font = '600 22px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('ClaudeWaves Desktop • Native Audio Studio', 88, H - 96);
      ctx.fillStyle = wrappedTheme.accent;
      ctx.textAlign = 'right';
      ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`${likedCount} Liked • ${downloadedCount} Offline`, W - 88, H - 96);
      ctx.textAlign = 'left';

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `claudewaves-wrapped-${formatDateKey(new Date())}.png`;
      a.click();
      onToast('Listening Wrapped PNG exported!');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to export Wrapped PNG');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="cw-stats-page">
      <div className="cw-section-header">
        <div>
          <h1 className="cw-h1">Stats &amp; Listening Wrapped</h1>
          <div className="cw-muted">
            Personal playback insights • {likedCount} liked • {playlistCount} playlists • {downloadedCount} offline
          </div>
        </div>
        <GlassButton
          size="sm"
          variant="filled"
          tint={accentHex}
          intensity={intensity}
          icon={<Download size={14} />}
          disabled={exporting}
          onClick={handleExportWrappedPng}
        >
          {exporting ? 'Rendering PNG...' : 'Export Wrapped PNG'}
        </GlassButton>
      </div>

      {/* KPI Strip */}
      <div className="cw-stats-kpi-grid">
        <div className="cw-comic-frame">
          <GlassCard intensity={intensity} padding="16px 18px" radius="18px">
            <div className="cw-stats-kpi-top">
              <Music2 size={15} color="var(--cw-accent)" />
              <span className="cw-muted">Total Plays</span>
            </div>
            <div className="cw-stats-kpi-val">{stats.totalPlays}</div>
          </GlassCard>
        </div>

        <div className="cw-comic-frame">
          <GlassCard intensity={intensity} padding="16px 18px" radius="18px">
            <div className="cw-stats-kpi-top">
              <Clock size={15} color="var(--cw-accent)" />
              <span className="cw-muted">Listen Time</span>
            </div>
            <div className="cw-stats-kpi-val">{formatHoursMinutes(stats.totalListenSec || 0)}</div>
          </GlassCard>
        </div>

        <div className="cw-comic-frame">
          <GlassCard intensity={intensity} padding="16px 18px" radius="18px">
            <div className="cw-stats-kpi-top">
              <Users size={15} color="var(--cw-accent)" />
              <span className="cw-muted">Unique Artists</span>
            </div>
            <div className="cw-stats-kpi-val">{uniqueArtistsCount}</div>
          </GlassCard>
        </div>

        <div className="cw-comic-frame">
          <GlassCard intensity={intensity} padding="16px 18px" radius="18px">
            <div className="cw-stats-kpi-top">
              <Flame size={15} color="var(--cw-accent)" />
              <span className="cw-muted">Daily Streak</span>
            </div>
            <div className="cw-stats-kpi-val">
              {streak}d <span className="cw-stats-kpi-sub">({activeDays} active)</span>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* 7-Day Chart + Wrapped Studio */}
      <div className="cw-stats-top-split">
        <div className="cw-comic-frame">
          <GlassCard intensity={intensity} padding="18px 20px" radius="20px" style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BarChart3 size={16} color="var(--cw-accent)" />
                  <h2 className="cw-h2" style={{ fontSize: 16 }}>Last 7 Days</h2>
                </div>
                <span className="cw-muted" style={{ fontSize: 12 }}>
                  Peak: {maxDayPlays} {maxDayPlays === 1 ? 'play' : 'plays'}
                </span>
              </div>

              <div className="cw-stats-bars">
                {last7Days.map((day) => {
                  const pct = day.plays > 0 ? Math.max(12, Math.round((day.plays / maxDayPlays) * 100)) : 4;
                  return (
                    <div
                      key={day.key}
                      className="cw-stats-bar-col"
                      title={`${day.key}: ${day.plays} plays (${day.minutes}m)`}
                    >
                      <span className="cw-stats-bar-count">{day.plays > 0 ? day.plays : ''}</span>
                      <div className="cw-stats-bar-track">
                        <div
                          className="cw-stats-bar-fill"
                          data-empty={day.plays === 0}
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className="cw-stats-bar-day">{day.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Listening Wrapped Preview Card */}
        <div className="cw-comic-frame">
          <GlassCard intensity={intensity} padding="18px 20px" radius="20px" style={{ height: '100%' }}>
            <div className="cw-wrapped-studio">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color="var(--cw-accent)" />
                  <h2 className="cw-h2" style={{ fontSize: 16 }}>Listening Wrapped</h2>
                </div>
                <div className="cw-wrapped-theme-pills">
                  {WRAPPED_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="cw-wrapped-theme-dot"
                      data-active={wrappedThemeId === t.id}
                      title={t.label}
                      style={{ background: `linear-gradient(135deg, ${t.bgMid}, ${t.accent})` }}
                      onClick={() => setWrappedThemeId(t.id)}
                    />
                  ))}
                </div>
              </div>

              <div
                className="cw-wrapped-preview"
                style={{
                  background: `linear-gradient(145deg, ${wrappedTheme.bgStart}, ${wrappedTheme.bgMid}, ${wrappedTheme.bgEnd})`,
                  color: wrappedTheme.text,
                  borderColor: `${wrappedTheme.accent}55`,
                }}
              >
                <div className="cw-wrapped-pill" style={{ background: wrappedTheme.pillBg, color: wrappedTheme.accent }}>
                  CLAUDEWAVES WRAPPED {new Date().getFullYear()}
                </div>
                <div className="cw-wrapped-title">{listenerLabel}&apos;s Persona: {persona}</div>
                <div className="cw-wrapped-metrics">
                  <div>
                    <div className="cw-wrapped-big" style={{ color: wrappedTheme.accent }}>{totalMinutes}</div>
                    <div style={{ fontSize: 11, color: wrappedTheme.muted }}>Minutes Played</div>
                  </div>
                  <div>
                    <div className="cw-wrapped-big">{stats.totalPlays}</div>
                    <div style={{ fontSize: 11, color: wrappedTheme.muted }}>Total Tracks</div>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cw-ellipsis" style={{ fontWeight: 750, fontSize: 14, color: wrappedTheme.accent }}>
                      {topArtistName}
                    </div>
                    <div style={{ fontSize: 11, color: wrappedTheme.muted }}>#1 Top Artist</div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Top Artists & Top Tracks */}
      <div className="cw-stats-columns">
        <div className="cw-comic-frame">
          <GlassCard intensity={intensity} padding="18px 20px" radius="20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={16} color="var(--cw-accent)" />
                <h2 className="cw-h2" style={{ fontSize: 16 }}>Top Artists</h2>
              </div>
              {topArtists.length === 0 ? (
                <div className="cw-muted" style={{ fontSize: 13, padding: '12px 0' }}>
                  Play some music to build your artist leaderboard.
                </div>
              ) : (
                <div className="cw-stats-rank-list">
                  {topArtists.map(([artist, count], idx) => (
                    <button
                      key={artist}
                      type="button"
                      className="cw-stats-rank-row"
                      onClick={() => onOpenArtist(artist)}
                    >
                      <span className="cw-stats-rank-num">#{idx + 1}</span>
                      <div className="cw-stats-rank-body">
                        <div className="cw-stats-rank-head">
                          <span className="cw-ellipsis" style={{ fontWeight: 650 }}>{artist}</span>
                          <span className="cw-muted" style={{ fontSize: 12 }}>{count} plays</span>
                        </div>
                        <div className="cw-stats-progress-track">
                          <div
                            className="cw-stats-progress-fill"
                            style={{ width: `${Math.max(8, Math.round((count / topArtistMax) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        <div className="cw-comic-frame">
          <GlassCard intensity={intensity} padding="18px 20px" radius="20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Disc3 size={16} color="var(--cw-accent)" />
                <h2 className="cw-h2" style={{ fontSize: 16 }}>Most Played Tracks</h2>
              </div>
              {topTrackStats.length === 0 ? (
                <div className="cw-muted" style={{ fontSize: 13, padding: '12px 0' }}>
                  Tracks you play will rank here with play counts &amp; cover art.
                </div>
              ) : (
                <div className="cw-stats-rank-list">
                  {topTrackStats.map((entry, idx) => (
                    <button
                      key={entry.track.videoId}
                      type="button"
                      className="cw-stats-rank-row cw-stats-track-row"
                      onClick={() => onPlayTrack(entry.track, topTrackList)}
                    >
                      <span className="cw-stats-rank-num">#{idx + 1}</span>
                      {entry.track.thumbnailUrl ? (
                        <img className="cw-stats-track-art" src={entry.track.thumbnailUrl} alt="" />
                      ) : (
                        <div className="cw-stats-track-art cw-stats-track-art-empty">
                          <Play size={12} />
                        </div>
                      )}
                      <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                        <div className="cw-ellipsis" style={{ fontWeight: 650, fontSize: 13 }}>
                          {entry.track.title}
                        </div>
                        <div className="cw-muted cw-ellipsis" style={{ fontSize: 11.5 }}>
                          {entry.track.artist}
                        </div>
                      </div>
                      <span className="cw-offline-pill">{entry.count}x</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
