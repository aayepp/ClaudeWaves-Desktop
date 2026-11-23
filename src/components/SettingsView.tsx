import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GlassButton,
  GlassCard,
  GlassSegmented,
  GlassSheet,
  GlassSlider,
  GlassSwitch,
} from '@zakisheriff/liquid-glass';
import {
  BarChart3,
  Bug,
  Check,
  Code2,
  Copy,
  Disc3,
  Download,
  ExternalLink,
  HardDrive,
  History,
  Loader2,
  LogIn,
  LogOut,
  Mic2,
  Monitor,
  Moon,
  Radio,
  RefreshCw,
  Sliders,
  Sparkles,
  Subtitles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AuthStatus } from '../api/auth';
import {
  checkAppUpdates,
  connectLastFmApi,
  disconnectLastFmApi,
  downloadAndInstallUpdate,
  fetchDiscordStatus,
  fetchUpdateDownloadProgress,
  openReleaseUrl,
  type DiscordRpcStatus,
  type LastFmStatus,
  type UpdateCheckResult,
  type UpdateDownloadProgress,
} from '../api/social';
import {
  APP_VERSION,
  CLAUDEWAVES_REPO_URL,
  DESKTOP_CHANGELOG,
} from '../data/changelog';
import { AUTOEQ_PROFILES } from '../data/autoeq';
import { LAYOUT_SKIN_CARDS, SkinWireframePreview } from './SkinWireframePreview';
import {
  ACCENT_PRESETS,
  EQ_FREQUENCIES,
  EQ_PRESETS,
  formatDuration,
  type AppSettings,
  type GlassQualityMode,
  type ListeningStats,
  type LyricsDisplayMode,
  type LyricsFontSize,
  type ThemeMode,
  type ThemePreset,
} from '../types';

export type SettingsTab = 'accounts' | 'appearance' | 'audio' | 'about';

interface SettingsViewProps {
  activeTab: SettingsTab;
  settings: AppSettings;
  auth: AuthStatus;
  stats: ListeningStats;
  likedCount: number;
  playlistCount: number;
  accentHex: string;
  sleepRemainingSec: number | null;
  onTabChange: (tab: SettingsTab) => void;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onSetSleepTimer: (minutes: number | null) => void;
  onLoginYt: () => Promise<void>;
  onLogoutYt: () => Promise<void>;
  onLoginSpotify: () => Promise<void>;
  onLogoutSpotify: () => Promise<void>;
  onOpenImport: () => void;
  onReplayTutorial: () => void;
  onExportBackup: () => void;
  onImportBackup: (rawJson: string) => void;
  onClearCache: () => void;
  floatingLyricsOpen?: boolean;
  onToggleFloatingLyrics?: () => void;
  onOpenAmbientMode?: () => void;
  offlineCount?: number;
  offlineBytes?: number;
  onClearDownloads?: () => void;
  lastFmStatus?: LastFmStatus;
  onLastFmChanged?: (status: LastFmStatus) => void;
  updateInfo?: UpdateCheckResult | null;
  onUpdateInfoChanged?: (info: UpdateCheckResult) => void;
  onOpenStats?: () => void;
}

const SETTINGS_TABS: SettingsTab[] = ['accounts', 'appearance', 'audio', 'about'];
const SETTINGS_TAB_LABELS = ['Accounts & Stats', 'Appearance', 'Audio & Lyrics', 'Backup & About'];
const PRESETS: ThemePreset[] = ['neutral', 'dynamic', 'comic', 'rhythmo'];
const PRESET_LABELS = ['Neutral', 'Accent', 'Comic Pop', 'Rhythmo'];
const MODES: ThemeMode[] = ['dark', 'light', 'system'];
const MODE_LABELS = ['Dark', 'Light', 'System'];
const QUALITIES: GlassQualityMode[] = ['low', 'auto', 'high'];
const QUALITY_LABELS = ['240Hz', 'Auto', 'Max'];
const LYRIC_SIZES: LyricsFontSize[] = ['compact', 'normal', 'large'];
const LYRIC_SIZE_LABELS = ['Compact', 'Normal', 'Large'];
const LYRIC_MODES: LyricsDisplayMode[] = ['sentence', 'word'];
const LYRIC_MODE_LABELS = ['Sentence', 'Word Sweep'];
const CROSSFADES = [0, 3, 5, 8];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEP_OPTIONS: Array<{ label: string; min: number | null }> = [
  { label: 'Off', min: null },
  { label: '15m', min: 15 },
  { label: '30m', min: 30 },
  { label: '45m', min: 45 },
  { label: '60m', min: 60 },
];
const AMBIENT_IDLE_OPTIONS: Array<{ label: string; min: number }> = [
  { label: 'Off', min: 0 },
  { label: '1m', min: 1 },
  { label: '3m', min: 3 },
  { label: '5m', min: 5 },
  { label: '10m', min: 10 },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  activeTab,
  settings,
  auth,
  stats,
  likedCount,
  playlistCount,
  accentHex,
  sleepRemainingSec,
  onTabChange,
  onUpdate,
  onSetSleepTimer,
  onLoginYt,
  onLogoutYt,
  onLoginSpotify,
  onLogoutSpotify,
  onOpenImport,
  onReplayTutorial,
  onExportBackup,
  onImportBackup,
  onClearCache,
  floatingLyricsOpen = false,
  onToggleFloatingLyrics,
  onOpenAmbientMode,
  offlineCount = 0,
  offlineBytes = 0,
  onClearDownloads,
  lastFmStatus = { connected: false, username: '', scrobbledCount: 0 },
  onLastFmChanged,
  updateInfo = null,
  onUpdateInfoChanged,
  onOpenStats,
}) => {
  const [authBusy, setAuthBusy] = useState<'yt' | 'sp' | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [copiedDebug, setCopiedDebug] = useState(false);
  const [draftIntensity, setDraftIntensity] = useState(settings.glassIntensity);
  const [discordStatus, setDiscordStatus] = useState<DiscordRpcStatus | null>(null);
  const [showDiscordAppId, setShowDiscordAppId] = useState(false);
  const [lfmApiKey, setLfmApiKey] = useState('');
  const [lfmApiSecret, setLfmApiSecret] = useState('');
  const [lfmUsername, setLfmUsername] = useState('');
  const [lfmPassword, setLfmPassword] = useState('');
  const [lfmBusy, setLfmBusy] = useState(false);
  const [lfmError, setLfmError] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const intensityTimerRef = useRef<number | null>(null);
  const backupFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (activeTab !== 'accounts') return;
    fetchDiscordStatus().then((st) => {
      if (st) setDiscordStatus(st);
    });
  }, [activeTab, settings.discordRpcEnabled, settings.discordClientId]);

  useEffect(() => {
    if (!downloadingUpdate) return;
    const id = window.setInterval(() => {
      fetchUpdateDownloadProgress().then((p) => {
        if (p) setUpdateProgress(p);
      });
    }, 350);
    return () => window.clearInterval(id);
  }, [downloadingUpdate]);

  useEffect(() => {
    setDraftIntensity(settings.glassIntensity);
  }, [settings.glassIntensity]);

  useEffect(() => {
    return () => {
      if (intensityTimerRef.current) window.clearTimeout(intensityTimerRef.current);
    };
  }, []);

  const handleDraftIntensity = (raw: number) => {
    const next = Math.max(1, Math.min(10, Math.round(raw)));
    setDraftIntensity(next);
    if (intensityTimerRef.current) window.clearTimeout(intensityTimerRef.current);
    intensityTimerRef.current = window.setTimeout(() => {
      onUpdate({ glassIntensity: next });
    }, 140);
  };

  const topArtist = useMemo(() => {
    let best = '—';
    let max = 0;
    for (const [artist, count] of Object.entries(stats.artistCounts || {})) {
      if (count > max) {
        max = count;
        best = artist;
      }
    }
    return best;
  }, [stats.artistCounts]);

  const listenMinutes = Math.round((stats.totalListenSec || 0) / 60);

  const debugSummary = useMemo(
    () =>
      [
        `ClaudeWaves Desktop v${APP_VERSION}`,
        `Platform: ${navigator.platform || 'Windows'}`,
        `Theme: ${settings.themePreset} (${settings.themeMode}${settings.amoled ? ', AMOLED' : ''})`,
        `Glass: ${settings.glassQuality} (${settings.glassIntensity}/10)`,
        `UA: ${navigator.userAgent}`,
      ].join('\n'),
    [settings.themePreset, settings.themeMode, settings.amoled, settings.glassQuality, settings.glassIntensity],
  );

  const runAuth = async (kind: 'yt' | 'sp', fn: () => Promise<void>) => {
    setAuthBusy(kind);
    setAuthErr(null);
    try {
      await fn();
    } catch (e) {
      setAuthErr(e instanceof Error ? e.message : 'Auth action failed');
    } finally {
      setAuthBusy(null);
    }
  };

  const handleCopyDebug = async () => {
    try {
      await navigator.clipboard?.writeText(debugSummary);
      setCopiedDebug(true);
      window.setTimeout(() => setCopiedDebug(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="cw-settings-wrap">
      <div className="cw-section-header" style={{ marginBottom: 12 }}>
        <div>
          <h1 className="cw-h1">Settings</h1>
          <div className="cw-muted">
            Desktop Studio • Clean 4-Tab Workspace
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="cw-about-version-pill"
            onClick={() => setChangelogOpen(true)}
            title="View What's New & Changelog"
          >
            Version {APP_VERSION}
          </button>
          <GlassButton
            size="sm"
            variant="glass"
            intensity={settings.glassIntensity}
            icon={<Sparkles size={14} />}
            onClick={onReplayTutorial}
          >
            Replay Tutorial
          </GlassButton>
        </div>
      </div>

      {/* Category Switcher */}
      <div className="cw-settings-tabs">
        <GlassSegmented
          size="sm"
          options={SETTINGS_TAB_LABELS}
          value={Math.max(0, SETTINGS_TABS.indexOf(activeTab))}
          intensity={settings.glassIntensity}
          onChange={(idx) => onTabChange(SETTINGS_TABS[idx] ?? 'accounts')}
        />
      </div>

      {/* TAB 1: ACCOUNTS & STATS */}
      {activeTab === 'accounts' && (
        <div className="cw-settings-bento">
          <div className="cw-comic-frame">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={17} color="var(--cw-accent)" />
                    <h2 className="cw-h2" style={{ fontSize: 17 }}>Listening Stats</h2>
                  </div>
                  {onOpenStats && (
                    <GlassButton
                      size="sm"
                      variant="tinted"
                      tint={accentHex}
                      intensity={settings.glassIntensity}
                      icon={<Sparkles size={13} />}
                      onClick={onOpenStats}
                    >
                      Stats &amp; Wrapped
                    </GlassButton>
                  )}
                </div>
                <div className="cw-stats-grid">
                  <div className="cw-stat-box">
                    <div className="cw-stat-num">{stats.totalPlays}</div>
                    <div className="cw-stat-label">Songs Played</div>
                  </div>
                  <div className="cw-stat-box">
                    <div className="cw-stat-num">{listenMinutes}m</div>
                    <div className="cw-stat-label">Listen Time</div>
                  </div>
                  <div className="cw-stat-box">
                    <div className="cw-stat-num cw-ellipsis" style={{ fontSize: 15 }}>{topArtist}</div>
                    <div className="cw-stat-label">Top Artist</div>
                  </div>
                  <div className="cw-stat-box">
                    <div className="cw-stat-num">{likedCount} / {playlistCount}</div>
                    <div className="cw-stat-label">Liked / Lists</div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="cw-comic-frame">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <h2 className="cw-h2" style={{ fontSize: 17 }}>Accounts &amp; Import</h2>
                  <GlassButton
                    size="sm"
                    variant="tinted"
                    tint={accentHex}
                    intensity={settings.glassIntensity}
                    icon={<Download size={13} />}
                    onClick={onOpenImport}
                  >
                    Import
                  </GlassButton>
                </div>

                <div className="cw-setting-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {auth.yt.photoUrl && (
                      <img className="cw-account-avatar" src={auth.yt.photoUrl} alt="YT Music" />
                    )}
                    <div className="cw-row-meta">
                      <div style={{ fontWeight: 650, fontSize: 13.5 }} className="cw-ellipsis">
                        YouTube Music {auth.yt.connected ? `• ${auth.yt.accountName}` : ''}
                      </div>
                      <div className="cw-muted cw-ellipsis" style={{ fontSize: 12 }}>
                        {auth.yt.connected ? 'Synced Feed, Liked & Playlists' : 'Personalize Feed & sync Liked'}
                      </div>
                    </div>
                  </div>
                  {auth.yt.connected ? (
                    <GlassButton
                      size="sm"
                      variant="glass"
                      destructive
                      intensity={settings.glassIntensity}
                      disabled={authBusy === 'yt'}
                      icon={<LogOut size={13} />}
                      onClick={() => runAuth('yt', onLogoutYt)}
                    >
                      Out
                    </GlassButton>
                  ) : (
                    <GlassButton
                      size="sm"
                      variant="filled"
                      tint="#FF0033"
                      className="cw-brand-cta"
                      intensity={settings.glassIntensity}
                      disabled={authBusy === 'yt'}
                      icon={authBusy === 'yt' ? <Loader2 size={13} className="cw-spin" /> : <LogIn size={13} />}
                      onClick={() => runAuth('yt', onLoginYt)}
                    >
                      YT Music
                    </GlassButton>
                  )}
                </div>

                <div className="cw-setting-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {auth.spotify.photoUrl && (
                      <img className="cw-account-avatar" src={auth.spotify.photoUrl} alt="Spotify" />
                    )}
                    <div className="cw-row-meta">
                      <div style={{ fontWeight: 650, fontSize: 13.5 }} className="cw-ellipsis">
                        Spotify {auth.spotify.connected ? `• ${auth.spotify.displayName}` : ''}
                      </div>
                      <div className="cw-muted cw-ellipsis" style={{ fontSize: 12 }}>
                        {auth.spotify.connected ? 'Browse & 1-click import playlists' : 'Connect to import playlists'}
                      </div>
                    </div>
                  </div>
                  {auth.spotify.connected ? (
                    <GlassButton
                      size="sm"
                      variant="glass"
                      destructive
                      intensity={settings.glassIntensity}
                      disabled={authBusy === 'sp'}
                      icon={<LogOut size={13} />}
                      onClick={() => runAuth('sp', onLogoutSpotify)}
                    >
                      Out
                    </GlassButton>
                  ) : (
                    <GlassButton
                      size="sm"
                      variant="filled"
                      tint="#1DB954"
                      className="cw-brand-cta"
                      intensity={settings.glassIntensity}
                      disabled={authBusy === 'sp'}
                      icon={authBusy === 'sp' ? <Loader2 size={13} className="cw-spin" /> : <LogIn size={13} />}
                      onClick={() => runAuth('sp', onLoginSpotify)}
                    >
                      Spotify
                    </GlassButton>
                  )}
                </div>
                {authErr && <div style={{ color: '#ff5c5c', fontSize: 12 }}>{authErr}</div>}
              </div>
            </GlassCard>
          </div>

          {/* Discord Rich Presence */}
          <div className="cw-comic-frame">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Disc3 size={17} color="var(--cw-accent)" />
                    <h2 className="cw-h2" style={{ fontSize: 17 }}>Discord Rich Presence</h2>
                  </div>
                  <span
                    className="cw-social-status-pill"
                    data-state={
                      !settings.discordRpcEnabled
                        ? 'off'
                        : discordStatus?.connected
                          ? 'connected'
                          : 'waiting'
                    }
                  >
                    {!settings.discordRpcEnabled
                      ? 'Disabled'
                      : discordStatus?.connected
                        ? 'Connected'
                        : 'Waiting for Discord'}
                  </span>
                </div>

                <div className="cw-setting-row">
                  <div className="cw-row-meta">
                    <div style={{ fontWeight: 650, fontSize: 13.5 }}>Broadcast Now Playing</div>
                    <div className="cw-muted" style={{ fontSize: 12 }}>
                      Shows live song, artist, album art &amp; time bar on your Discord profile
                    </div>
                  </div>
                  <GlassSwitch
                    checked={settings.discordRpcEnabled}
                    tint={accentHex}
                    intensity={settings.glassIntensity}
                    onChange={(v) => onUpdate({ discordRpcEnabled: v })}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <button
                    type="button"
                    className="cw-reset-layout-btn"
                    onClick={() => setShowDiscordAppId((v) => !v)}
                  >
                    {showDiscordAppId ? 'Hide Custom App ID' : 'Custom Discord App ID (Optional)'}
                  </button>
                  <button
                    type="button"
                    className="cw-reset-layout-btn"
                    onClick={() => fetchDiscordStatus().then((st) => st && setDiscordStatus(st))}
                  >
                    Refresh Status
                  </button>
                </div>

                {showDiscordAppId && (
                  <input
                    type="text"
                    className="cw-social-input"
                    value={settings.discordClientId}
                    placeholder="Default ClaudeWaves App ID (1552563991426105414)"
                    onChange={(e) => onUpdate({ discordClientId: e.target.value })}
                  />
                )}
              </div>
            </GlassCard>
          </div>

          {/* Last.fm Scrobbling */}
          <div className="cw-comic-frame">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Radio size={17} color="var(--cw-accent)" />
                    <h2 className="cw-h2" style={{ fontSize: 17 }}>Last.fm Scrobbling</h2>
                  </div>
                  <span
                    className="cw-social-status-pill"
                    data-state={lastFmStatus.connected ? 'connected' : 'off'}
                  >
                    {lastFmStatus.connected ? `@${lastFmStatus.username}` : 'Not Connected'}
                  </span>
                </div>

                {lastFmStatus.connected ? (
                  <>
                    <div className="cw-setting-row">
                      <div className="cw-row-meta">
                        <div style={{ fontWeight: 650, fontSize: 13.5 }}>Auto-Scrobble Plays</div>
                        <div className="cw-muted" style={{ fontSize: 12 }}>
                          Sends Now Playing + scrobble after 50% or 4 min ({lastFmStatus.scrobbledCount} this session)
                        </div>
                      </div>
                      <GlassSwitch
                        checked={settings.lastFmEnabled}
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        onChange={(v) => onUpdate({ lastFmEnabled: v })}
                      />
                    </div>
                    {lastFmStatus.lastScrobble && (
                      <div className="cw-muted cw-ellipsis" style={{ fontSize: 11.5 }}>
                        Last scrobbled: {lastFmStatus.lastScrobble}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <GlassButton
                        size="sm"
                        variant="glass"
                        destructive
                        intensity={settings.glassIntensity}
                        icon={<LogOut size={13} />}
                        disabled={lfmBusy}
                        onClick={async () => {
                          setLfmBusy(true);
                          setLfmError(null);
                          try {
                            const next = await disconnectLastFmApi();
                            onLastFmChanged?.(next);
                          } finally {
                            setLfmBusy(false);
                          }
                        }}
                      >
                        Disconnect Last.fm
                      </GlassButton>
                    </div>
                  </>
                ) : (
                  <form
                    className="cw-lastfm-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setLfmBusy(true);
                      setLfmError(null);
                      try {
                        const next = await connectLastFmApi({
                          apiKey: lfmApiKey,
                          apiSecret: lfmApiSecret,
                          username: lfmUsername,
                          password: lfmPassword,
                        });
                        setLfmPassword('');
                        onLastFmChanged?.(next);
                      } catch (err) {
                        setLfmError(err instanceof Error ? err.message : 'Connection failed');
                      } finally {
                        setLfmBusy(false);
                      }
                    }}
                  >
                    <div className="cw-muted" style={{ fontSize: 11.5 }}>
                      Create an API account at{' '}
                      <a
                        href="https://www.last.fm/api/account/create"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--cw-accent)', textDecoration: 'underline' }}
                      >
                        last.fm/api/account/create
                      </a>
                      {' '}and enter your credentials below (keys stay local).
                    </div>
                    <div className="cw-lastfm-grid">
                      <input
                        type="text"
                        className="cw-social-input"
                        placeholder="Last.fm API Key (32 hex)"
                        value={lfmApiKey}
                        onChange={(e) => setLfmApiKey(e.target.value)}
                        required
                      />
                      <input
                        type="password"
                        className="cw-social-input"
                        placeholder="Shared Secret (32 hex)"
                        value={lfmApiSecret}
                        onChange={(e) => setLfmApiSecret(e.target.value)}
                        required
                      />
                      <input
                        type="text"
                        className="cw-social-input"
                        placeholder="Last.fm Username"
                        value={lfmUsername}
                        onChange={(e) => setLfmUsername(e.target.value)}
                        required
                      />
                      <input
                        type="password"
                        className="cw-social-input"
                        placeholder="Last.fm Password"
                        value={lfmPassword}
                        onChange={(e) => setLfmPassword(e.target.value)}
                        required
                      />
                    </div>
                    {lfmError && <div style={{ color: '#ff5c5c', fontSize: 12 }}>{lfmError}</div>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <GlassButton
                        type="submit"
                        size="sm"
                        variant="filled"
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        disabled={lfmBusy}
                        icon={lfmBusy ? <Loader2 size={13} className="cw-spin" /> : <LogIn size={13} />}
                      >
                        {lfmBusy ? 'Connecting...' : 'Connect Last.fm'}
                      </GlassButton>
                    </div>
                  </form>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* TAB 2: APPEARANCE */}
      {activeTab === 'appearance' && (
        <div className="cw-settings-bento">
          <div className="cw-comic-frame cw-bento-wide">
            <GlassCard intensity={settings.glassIntensity} padding="20px 22px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <h2 className="cw-h2" style={{ fontSize: 17 }}>App Layout Skin</h2>
                  <span className="cw-muted" style={{ fontSize: 11.5 }}>
                    Restructures sidebar, search, Home cards &amp; player dock live
                  </span>
                </div>

                <div className="cw-skin-picker-grid" role="radiogroup" aria-label="App Layout Skin">
                  {LAYOUT_SKIN_CARDS.map((skin) => {
                    const selected = settings.layoutSkin === skin.id;
                    return (
                      <button
                        key={skin.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="cw-skin-card"
                        data-skin-id={skin.id}
                        data-selected={selected}
                        style={{ '--skin-preview-accent': skin.accent } as React.CSSProperties}
                        onClick={() => onUpdate({ layoutSkin: skin.id })}
                      >
                        <SkinWireframePreview skinId={skin.id} />

                        <div className="cw-skin-card-meta">
                          <div className="cw-skin-card-name">
                            <span>{skin.name}</span>
                            {selected && <Check size={14} className="cw-skin-check" />}
                          </div>
                          <div className="cw-skin-card-sub">{skin.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ height: 1, background: 'var(--cw-border-subtle)', opacity: 0.45 }} />

                <h2 className="cw-h2" style={{ fontSize: 17 }}>Theme &amp; 12 Accents Studio</h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 22 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>
                          Style{settings.layoutSkin !== 'default' ? ' (resets skin)' : ''}
                        </div>
                        <GlassSegmented
                          size="sm"
                          options={PRESET_LABELS}
                          value={Math.max(0, PRESETS.indexOf(settings.themePreset))}
                          intensity={settings.glassIntensity}
                          onChange={(idx) =>
                            onUpdate({
                              themePreset: PRESETS[idx] ?? 'neutral',
                              layoutSkin: 'default',
                            })
                          }
                        />
                      </div>
                      <div>
                        <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>Mode</div>
                        <GlassSegmented
                          size="sm"
                          options={MODE_LABELS}
                          value={Math.max(0, MODES.indexOf(settings.themeMode))}
                          intensity={settings.glassIntensity}
                          onChange={(idx) => onUpdate({ themeMode: MODES[idx] ?? 'dark' })}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="cw-muted" style={{ marginBottom: 8, fontSize: 11.5 }}>
                        Accent Swatches (12)
                      </div>
                      <div className="cw-swatch-row">
                        {ACCENT_PRESETS.map((swatch) => {
                          const isNeutral = swatch.hex === 'neutral';
                          const isStyledPreset =
                            settings.layoutSkin !== 'default' ||
                            settings.themePreset === 'comic' ||
                            settings.themePreset === 'rhythmo';
                          const selected = isStyledPreset
                            ? (isNeutral && !settings.accentHex.startsWith('#')) ||
                              (!isNeutral && settings.accentHex.toLowerCase() === swatch.hex.toLowerCase())
                            : (isNeutral && settings.themePreset === 'neutral') ||
                              (!isNeutral &&
                                settings.themePreset === 'dynamic' &&
                                settings.accentHex.toLowerCase() === swatch.hex.toLowerCase());
                          const skinLabelMap: Record<string, string> = {
                            spotify: 'Spotify Default',
                            ytmusic: 'YT Music Default',
                            apple: 'Apple Music Default',
                            tidal: 'Tidal Cyan Default',
                            soundcloud: 'SoundCloud Orange Default',
                            nothing: 'Nothing Red Default',
                          };
                          const label = isNeutral
                            ? skinLabelMap[settings.layoutSkin] ??
                              (settings.themePreset === 'comic'
                                ? 'Comic Pop Default'
                                : settings.themePreset === 'rhythmo'
                                  ? 'Rhythmo Default'
                                  : swatch.name)
                            : swatch.name;
                          return (
                            <button
                              key={swatch.hex}
                              type="button"
                              className="cw-swatch"
                              title={label}
                              aria-label={label}
                              data-selected={selected}
                              style={{
                                background: isNeutral
                                  ? 'linear-gradient(135deg, #ffffff 50%, #111111 50%)'
                                  : swatch.hex,
                              }}
                              onClick={() => {
                                if (isStyledPreset) {
                                  onUpdate({ accentHex: isNeutral ? 'neutral' : swatch.hex });
                                } else {
                                  onUpdate(
                                    isNeutral
                                      ? { themePreset: 'neutral', accentHex: 'neutral' }
                                      : { themePreset: 'dynamic', accentHex: swatch.hex },
                                  );
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Auto-Follow Cover Art Accent</span>
                      <GlassSwitch
                        checked={settings.followCoverAccent}
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        onChange={(checked) => onUpdate({ followCoverAccent: checked })}
                      />
                    </div>

                    <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Pure Black (AMOLED)</span>
                      <GlassSwitch
                        checked={settings.amoled}
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        onChange={(checked) => onUpdate({ amoled: checked })}
                      />
                    </div>

                    <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Artwork Blur Backdrop</span>
                      <GlassSwitch
                        checked={settings.artworkBackdrop}
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        onChange={(checked) => onUpdate({ artworkBackdrop: checked })}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center', paddingTop: 4 }}>
                      <div>
                        <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>Glass Quality</div>
                        <GlassSegmented
                          size="sm"
                          options={QUALITY_LABELS}
                          value={Math.max(0, QUALITIES.indexOf(settings.glassQuality))}
                          intensity={settings.glassIntensity}
                          onChange={(idx) => onUpdate({ glassQuality: QUALITIES[idx] ?? 'low' })}
                        />
                      </div>
                      <div>
                        <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>
                          Refraction ({draftIntensity}/10)
                        </div>
                        <GlassSlider
                          min={1}
                          max={10}
                          step={1}
                          value={draftIntensity}
                          tint={accentHex}
                          intensity={settings.glassIntensity}
                          onChange={handleDraftIntensity}
                          aria-label="Glass refraction intensity"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIO & LYRICS */}
      {activeTab === 'audio' && (
        <div className="cw-settings-bento">
          <div className="cw-comic-frame cw-bento-wide">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mic2 size={17} color="var(--cw-accent)" />
                  <h2 className="cw-h2" style={{ fontSize: 17 }}>Lyrics &amp; Playback</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>Lyrics Font Size</div>
                        <GlassSegmented
                          size="sm"
                          options={LYRIC_SIZE_LABELS}
                          value={Math.max(0, LYRIC_SIZES.indexOf(settings.lyricsFontSize))}
                          intensity={settings.glassIntensity}
                          onChange={(idx) => onUpdate({ lyricsFontSize: LYRIC_SIZES[idx] ?? 'normal' })}
                        />
                      </div>
                      <div>
                        <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>Lyrics Mode</div>
                        <GlassSegmented
                          size="sm"
                          options={LYRIC_MODE_LABELS}
                          value={Math.max(0, LYRIC_MODES.indexOf(settings.lyricsDisplayMode))}
                          intensity={settings.glassIntensity}
                          onChange={(idx) => onUpdate({ lyricsDisplayMode: LYRIC_MODES[idx] ?? 'sentence' })}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>
                        Crossfade Transition ({settings.crossfadeSec === 0 ? 'Off' : `${settings.crossfadeSec}s`})
                      </div>
                      <div className="cw-chips">
                        {CROSSFADES.map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            className="cw-mood-chip"
                            style={{ padding: '5px 12px', fontSize: 12 }}
                            data-active={settings.crossfadeSec === sec}
                            onClick={() => onUpdate({ crossfadeSec: sec })}
                          >
                            {sec === 0 ? 'Off' : `${sec}s`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>
                        Playback Speed ({settings.playbackRate}×)
                      </div>
                      <div className="cw-chips">
                        {SPEEDS.map((spd) => (
                          <button
                            key={spd}
                            type="button"
                            className="cw-mood-chip"
                            style={{ padding: '5px 11px', fontSize: 12 }}
                            data-active={settings.playbackRate === spd}
                            onClick={() => onUpdate({ playbackRate: spd })}
                          >
                            {spd}×
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Moon size={13} color="var(--cw-accent)" />
                        <span className="cw-muted" style={{ fontSize: 11.5 }}>
                          Sleep Timer {sleepRemainingSec !== null ? `• ${formatDuration(sleepRemainingSec * 1000)}` : ''}
                        </span>
                      </div>
                      <div className="cw-chips">
                        {SLEEP_OPTIONS.map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            className="cw-mood-chip"
                            style={{ padding: '5px 11px', fontSize: 12 }}
                            data-active={opt.min === null ? sleepRemainingSec === null : false}
                            onClick={() => onSetSleepTimer(opt.min)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Auto-Radio Up-Next</span>
                      <GlassSwitch
                        checked={settings.autoRadio}
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        onChange={(checked) => onUpdate({ autoRadio: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--cw-border-subtle)', opacity: 0.45 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontWeight: 750, fontSize: 13.5 }}>Desktop Native &amp; Visualizer Modes</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                    <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Close to System Tray</div>
                        <div className="cw-muted" style={{ fontSize: 11.5 }}>Keep music playing when closing window</div>
                      </div>
                      <GlassSwitch
                        checked={settings.closeToTray}
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        onChange={(checked) => onUpdate({ closeToTray: checked })}
                      />
                    </div>

                    <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Global Media Hotkeys</div>
                        <div className="cw-muted" style={{ fontSize: 11.5 }}>Keyboard Play/Pause &amp; Next while in games</div>
                      </div>
                      <GlassSwitch
                        checked={settings.globalMediaKeys}
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        onChange={(checked) => onUpdate({ globalMediaKeys: checked })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="cw-muted" style={{ fontSize: 11.5 }}>
                      Ambient Screensaver (Auto-Idle: {settings.ambientIdleMinutes > 0 ? `${settings.ambientIdleMinutes}m` : 'Off'})
                    </div>
                    <div className="cw-muted" style={{ fontSize: 11.5 }}>
                      Auto-switches to Ambient Visualizer inside the window after inactivity while playing (Esc to exit)
                    </div>
                    <div className="cw-chips">
                      {AMBIENT_IDLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          className="cw-mood-chip"
                          style={{ padding: '5px 11px', fontSize: 12 }}
                          data-active={(settings.ambientIdleMinutes ?? 3) === opt.min}
                          onClick={() => onUpdate({ ambientIdleMinutes: opt.min })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 2 }}>
                    {onToggleFloatingLyrics && (
                      <GlassButton
                        size="sm"
                        variant={floatingLyricsOpen ? 'tinted' : 'glass'}
                        tint={accentHex}
                        intensity={settings.glassIntensity}
                        icon={<Subtitles size={14} />}
                        onClick={onToggleFloatingLyrics}
                      >
                        {floatingLyricsOpen ? 'Hide Floating Lyrics' : 'Floating Desktop Lyrics'}
                      </GlassButton>
                    )}
                    {onOpenAmbientMode && (
                      <GlassButton
                        size="sm"
                        variant="glass"
                        intensity={settings.glassIntensity}
                        icon={<Monitor size={14} />}
                        onClick={onOpenAmbientMode}
                      >
                        Ambient Fullscreen Mode (F11)
                      </GlassButton>
                    )}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="cw-comic-frame cw-bento-wide">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={17} color="var(--cw-accent)" />
                    <h2 className="cw-h2" style={{ fontSize: 17 }}>Audiophile DSP, AutoEQ &amp; Offline</h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="cw-offline-pill">
                      <HardDrive size={12} />
                      <span>{offlineCount} saved • {(offlineBytes / 1048576).toFixed(1)} MB</span>
                    </span>
                    {onClearDownloads && offlineCount > 0 && (
                      <GlassButton
                        size="sm"
                        variant="glass"
                        destructive
                        intensity={settings.glassIntensity}
                        icon={<Trash2 size={13} />}
                        onClick={onClearDownloads}
                      >
                        Clear Offline
                      </GlassButton>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                  <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>Volume Normalizer</div>
                      <div className="cw-muted" style={{ fontSize: 11.5 }}>Balance loudness across tracks + safety limiter</div>
                    </div>
                    <GlassSwitch
                      checked={settings.volumeNormalizer}
                      tint={accentHex}
                      intensity={settings.glassIntensity}
                      onChange={(checked) => onUpdate({ volumeNormalizer: checked })}
                    />
                  </div>

                  <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>Spatial 3D Soundstage</div>
                      <div className="cw-muted" style={{ fontSize: 11.5 }}>Cross-feed acoustic width for headphones</div>
                    </div>
                    <GlassSwitch
                      checked={settings.spatialAudio}
                      tint={accentHex}
                      intensity={settings.glassIntensity}
                      onChange={(checked) => onUpdate({ spatialAudio: checked })}
                    />
                  </div>

                  <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>SponsorBlock Auto-Skip</div>
                      <div className="cw-muted" style={{ fontSize: 11.5 }}>Auto-skip non-music intros, outros &amp; sponsors</div>
                    </div>
                    <GlassSwitch
                      checked={settings.sponsorBlockEnabled}
                      tint={accentHex}
                      intensity={settings.glassIntensity}
                      onChange={(checked) => onUpdate({ sponsorBlockEnabled: checked })}
                    />
                  </div>

                  <div className="cw-setting-row" style={{ padding: '2px 0' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>Offline Mode</div>
                      <div className="cw-muted" style={{ fontSize: 11.5 }}>Play downloaded local songs without internet</div>
                    </div>
                    <GlassSwitch
                      checked={settings.offlineMode}
                      tint={accentHex}
                      intensity={settings.glassIntensity}
                      onChange={(checked) => onUpdate({ offlineMode: checked })}
                    />
                  </div>
                </div>

                <div>
                  <div className="cw-muted" style={{ marginBottom: 6, fontSize: 11.5 }}>
                    AutoEQ Headphone Profile ({settings.autoEqProfile})
                  </div>
                  <div className="cw-chips">
                    {Object.entries(AUTOEQ_PROFILES).map(([id, spec]) => (
                      <button
                        key={id}
                        type="button"
                        className="cw-mood-chip"
                        style={{ padding: '5px 11px', fontSize: 12 }}
                        data-active={settings.autoEqProfile === id}
                        onClick={() => onUpdate({ autoEqProfile: id })}
                      >
                        {spec.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="cw-comic-frame cw-bento-wide">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sliders size={17} color="var(--cw-accent)" />
                    <h2 className="cw-h2" style={{ fontSize: 17 }}>10-Band Audio Equalizer</h2>
                  </div>
                  <div className="cw-chips">
                    {Object.entries(EQ_PRESETS).map(([name, gains]) => (
                      <button
                        key={name}
                        type="button"
                        className="cw-mood-chip"
                        style={{ padding: '5px 11px', fontSize: 12 }}
                        data-active={settings.eqPreset === name}
                        onClick={() => onUpdate({ eqPreset: name, eqGains: [...gains] })}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cw-eq-grid">
                  {EQ_FREQUENCIES.map((freq, idx) => {
                    const gain = settings.eqGains[idx] ?? 0;
                    const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
                    return (
                      <div key={freq} className="cw-eq-band">
                        <span className="cw-eq-val">{gain > 0 ? `+${gain}` : gain}</span>
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          step={1}
                          value={gain}
                          className="cw-eq-range"
                          aria-label={`${label} Hz gain`}
                          onChange={(e) => {
                            const next = [...(settings.eqGains.length === 10 ? settings.eqGains : EQ_PRESETS.Flat)];
                            next[idx] = Number(e.target.value);
                            onUpdate({ eqPreset: 'Custom', eqGains: next });
                          }}
                        />
                        <span className="cw-eq-freq">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* TAB 4: BACKUP & ABOUT */}
      {activeTab === 'about' && (
        <div className="cw-settings-bento">
          {/* Android-matched About Hero Card */}
          <div className="cw-comic-frame">
            <GlassCard intensity={settings.glassIntensity} padding="24px 20px" radius="22px">
              <div className="cw-about-hero">
                <img className="cw-about-logo" src="/app_icon.png" alt="ClaudeWaves" />
                <div className="cw-about-name">
                  Claude<span className="cw-about-waves-grad">Waves</span>
                </div>
                <button
                  type="button"
                  className="cw-about-version-pill"
                  onClick={() => setChangelogOpen(true)}
                >
                  Version {APP_VERSION}
                </button>
                <div className="cw-about-credit">
                  Maintained by <strong>aayepp</strong> • Licensed under GPL v3
                </div>
                <div className="cw-muted" style={{ fontSize: 11.5 }}>
                  ClaudeWaves Desktop • Native Electron + Liquid Glass
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Actions, Changelog & Links */}
          <div className="cw-comic-frame">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 className="cw-h2" style={{ fontSize: 17, marginBottom: 4 }}>About, Changelog &amp; Links</h2>

                <div className="cw-updater-box">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div className="cw-row-meta">
                      <div style={{ fontWeight: 650, fontSize: 13.5 }}>
                        App Updates {updateInfo?.hasUpdate ? `• v${updateInfo.latestVersion} ready` : `(v${APP_VERSION})`}
                      </div>
                      <div className="cw-muted" style={{ fontSize: 11.5 }}>
                        {updateMessage ||
                          updateInfo?.message ||
                          updateInfo?.error ||
                          (updateInfo?.hasUpdate
                            ? `${updateInfo.releaseName || `v${updateInfo.latestVersion}`} available on GitHub`
                            : 'Checks aayepp/ClaudeWaves-Desktop GitHub Releases')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <GlassButton
                        size="sm"
                        variant="glass"
                        intensity={settings.glassIntensity}
                        disabled={checkingUpdate || downloadingUpdate}
                        icon={checkingUpdate ? <Loader2 size={13} className="cw-spin" /> : <RefreshCw size={13} />}
                        onClick={async () => {
                          setCheckingUpdate(true);
                          setUpdateMessage(null);
                          try {
                            const info = await checkAppUpdates();
                            if (info) {
                              onUpdateInfoChanged?.(info);
                              if (!info.ok) setUpdateMessage(info.error || 'Update check failed');
                              else if (info.hasUpdate) setUpdateMessage(`v${info.latestVersion} available!`);
                              else setUpdateMessage(info.message || `Up to date (v${APP_VERSION})`);
                            }
                          } finally {
                            setCheckingUpdate(false);
                          }
                        }}
                      >
                        {checkingUpdate ? 'Checking...' : 'Check Updates'}
                      </GlassButton>
                      {updateInfo?.hasUpdate && (
                        <GlassButton
                          size="sm"
                          variant="filled"
                          tint={accentHex}
                          intensity={settings.glassIntensity}
                          disabled={downloadingUpdate}
                          icon={downloadingUpdate ? <Loader2 size={13} className="cw-spin" /> : <Download size={13} />}
                          onClick={async () => {
                            if (!updateInfo.downloadUrl) {
                              openReleaseUrl(updateInfo.htmlUrl);
                              return;
                            }
                            setDownloadingUpdate(true);
                            setUpdateMessage('Downloading Windows installer...');
                            try {
                              await downloadAndInstallUpdate(updateInfo.downloadUrl, updateInfo.assetName, true);
                              setUpdateMessage('Installer launched! Follow the setup window.');
                            } catch (err) {
                              setUpdateMessage(err instanceof Error ? err.message : 'Download failed');
                            } finally {
                              setDownloadingUpdate(false);
                            }
                          }}
                        >
                          {downloadingUpdate
                            ? `${updateProgress?.percent ?? 0}%`
                            : 'Download & Install'}
                        </GlassButton>
                      )}
                    </div>
                  </div>
                  {downloadingUpdate && (
                    <div className="cw-update-progress-track">
                      <div
                        className="cw-update-progress-fill"
                        style={{ width: `${Math.max(8, updateProgress?.percent ?? 0)}%` }}
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="cw-about-action-row"
                  onClick={() => setChangelogOpen(true)}
                >
                  <History size={16} color="var(--cw-accent)" />
                  <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 650, fontSize: 13.5 }}>What&apos;s New &amp; Changelog</div>
                    <div className="cw-muted" style={{ fontSize: 11.5 }}>
                      Release notes &amp; recent updates for v{APP_VERSION}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="cw-about-action-row"
                  onClick={onReplayTutorial}
                >
                  <Sparkles size={16} className="cw-ic-sparkle" />
                  <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 650, fontSize: 13.5 }}>Startup Tutorial &amp; Setup</div>
                    <div className="cw-muted" style={{ fontSize: 11.5 }}>
                      Repeat profile setup, accounts, theme &amp; playlist import tour
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="cw-about-action-row"
                  onClick={() => window.open(CLAUDEWAVES_REPO_URL, '_blank', 'noopener')}
                >
                  <Code2 size={16} className="cw-ic-home" />
                  <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 650, fontSize: 13.5 }}>GitHub Repository</div>
                    <div className="cw-muted" style={{ fontSize: 11.5 }}>
                      Source code, releases &amp; roadmap by aayepp
                    </div>
                  </div>
                  <ExternalLink size={13} className="cw-muted" />
                </button>

                <button
                  type="button"
                  className="cw-about-action-row"
                  onClick={() => {
                    const body = encodeURIComponent(`## Issue / Suggestion\n\n\n---\n### Desktop Info\n\`\`\`\n${debugSummary}\n\`\`\``);
                    window.open(`${CLAUDEWAVES_REPO_URL}/issues/new?body=${body}`, '_blank', 'noopener');
                  }}
                >
                  <Bug size={16} className="cw-ic-video" />
                  <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 650, fontSize: 13.5 }}>Report a Bug / Request Feature</div>
                    <div className="cw-muted" style={{ fontSize: 11.5 }}>
                      Opens GitHub Issues with desktop version info pre-filled
                    </div>
                  </div>
                  <ExternalLink size={13} className="cw-muted" />
                </button>

                <button
                  type="button"
                  className="cw-about-action-row"
                  onClick={handleCopyDebug}
                >
                  {copiedDebug ? <Check size={16} className="cw-ic-playlist" /> : <Copy size={16} className="cw-ic-search" />}
                  <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 650, fontSize: 13.5 }}>
                      {copiedDebug ? 'Debug Info Copied!' : 'Copy Debug Info'}
                    </div>
                    <div className="cw-muted" style={{ fontSize: 11.5 }}>
                      v{APP_VERSION} • {settings.themePreset} ({settings.themeMode}) • Glass {settings.glassQuality}
                    </div>
                  </div>
                </button>
              </div>
            </GlassCard>
          </div>

          {/* Backup, Storage & Shortcuts */}
          <div className="cw-comic-frame cw-bento-wide">
            <GlassCard intensity={settings.glassIntensity} padding="18px 20px" radius="22px">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HardDrive size={17} color="var(--cw-accent)" />
                    <h2 className="cw-h2" style={{ fontSize: 17 }}>Backup &amp; Storage</h2>
                  </div>
                  <div className="cw-muted" style={{ fontSize: 12.5 }}>
                    Export your Liked Songs, Playlists, Profile &amp; Settings as JSON, or restore anytime.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <GlassButton
                      size="sm"
                      variant="filled"
                      tint={accentHex}
                      intensity={settings.glassIntensity}
                      icon={<Download size={14} />}
                      onClick={() => {
                        onExportBackup();
                        setBackupMsg('Backup JSON downloaded.');
                      }}
                    >
                      Export Backup
                    </GlassButton>
                    <GlassButton
                      size="sm"
                      variant="glass"
                      intensity={settings.glassIntensity}
                      icon={<Upload size={14} />}
                      onClick={() => backupFileRef.current?.click()}
                    >
                      Restore JSON
                    </GlassButton>
                    <GlassButton
                      size="sm"
                      variant="glass"
                      destructive
                      intensity={settings.glassIntensity}
                      icon={<Trash2 size={14} />}
                      onClick={() => {
                        onClearCache();
                        setBackupMsg('Recent history cache cleared.');
                      }}
                    >
                      Clear Cache
                    </GlassButton>
                  </div>
                  <input
                    ref={backupFileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        const text = await f.text();
                        onImportBackup(text);
                        setBackupMsg('Backup restored successfully!');
                      } catch {
                        setBackupMsg('Invalid backup JSON file.');
                      }
                    }}
                  />
                  {backupMsg && <div style={{ fontSize: 12, color: 'var(--cw-accent)' }}>{backupMsg}</div>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h2 className="cw-h2" style={{ fontSize: 17, marginBottom: 4 }}>Shortcuts &amp; Touch</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 5, fontSize: 12.5 }}>
                    {[
                      ['Play / Pause', 'Space'],
                      ['Search / Best Part', 'Ctrl+K / B'],
                      ['Lyrics / Queue', 'L / Q'],
                      ['Swipe Left / Right (Dock)', 'Next / Prev'],
                      ['Swipe Up (Dock) / Down (Full)', 'Expand / Close'],
                    ].map(([k, v]) => (
                      <React.Fragment key={k}>
                        <span className="cw-muted">{k}</span>
                        <span style={{ fontWeight: 700, color: 'var(--cw-accent)' }}>{v}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* What's New & Changelog Modal */}
      <GlassSheet
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        intensity={settings.glassIntensity}
        aria-label="What's New and Changelog"
      >
        <div style={{ maxWidth: 660, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 className="cw-h2" style={{ fontSize: 20 }}>What&apos;s New &amp; Changelog</h2>
              <div className="cw-muted" style={{ fontSize: 12.5 }}>
                ClaudeWaves Desktop by aayepp • Release History
              </div>
            </div>
            <GlassButton
              size="sm"
              variant="clear"
              intensity={settings.glassIntensity}
              aria-label="Close changelog"
              icon={<X size={16} />}
              onClick={() => setChangelogOpen(false)}
            />
          </div>

          <div className="cw-changelog-list">
            {DESKTOP_CHANGELOG.map((rel) => (
              <div key={rel.version} className="cw-changelog-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span className="cw-about-version-pill">v{rel.version}</span>
                  <span className="cw-muted" style={{ fontSize: 11.5 }}>{rel.date}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{rel.summary}</div>

                {rel.added && rel.added.length > 0 && (
                  <div className="cw-changelog-group">
                    <span className="cw-changelog-badge" data-kind="added">Added</span>
                    <ul>
                      {rel.added.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {rel.changed && rel.changed.length > 0 && (
                  <div className="cw-changelog-group">
                    <span className="cw-changelog-badge" data-kind="changed">Changed</span>
                    <ul>
                      {rel.changed.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {rel.fixed && rel.fixed.length > 0 && (
                  <div className="cw-changelog-group">
                    <span className="cw-changelog-badge" data-kind="fixed">Fixed</span>
                    <ul>
                      {rel.fixed.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </GlassSheet>
    </div>
  );
};
