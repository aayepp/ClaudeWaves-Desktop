import React, { useEffect, useState } from 'react';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSegmented,
  GlassSlider,
  GlassSwitch,
} from '@zakisheriff/liquid-glass';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CheckSquare,
  Download,
  Heart,
  Keyboard,
  Loader2,
  LogIn,
  Mic2,
  Palette,
  Pause,
  Play,
  Sparkles,
  Square,
  User,
  Volume2,
} from 'lucide-react';
import {
  fetchMySpotifyPlaylists,
  fetchMyYtPlaylists,
  importPlaylistByUrl,
  type AuthStatus,
  type RemotePlaylistItem,
} from '../api/auth';
import {
  ACCENT_PRESETS,
  type AppSettings,
  type ThemeMode,
  type ThemePreset,
  type Track,
} from '../types';
import { LAYOUT_SKIN_CARDS, SkinWireframePreview } from './SkinWireframePreview';

const PRESETS: ThemePreset[] = ['neutral', 'dynamic', 'comic', 'rhythmo'];
const PRESET_LABELS = ['Neutral', 'Accent', 'Comic Pop', 'Rhythmo'];
const MODES: ThemeMode[] = ['dark', 'light', 'system'];
const MODE_LABELS = ['Dark', 'Light', 'System'];

interface OnboardingWizardProps {
  open: boolean;
  isRepeat: boolean;
  settings: AppSettings;
  auth: AuthStatus;
  accentHex: string;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onLoginYt: () => Promise<void>;
  onLoginSpotify: () => Promise<void>;
  onImportedPlaylist?: (
    title: string,
    tracks: Track[],
    meta?: { source?: 'youtube' | 'spotify'; sourceId?: string },
  ) => void;
  onSyncedLiked?: (tracks: Track[]) => void;
  onComplete: () => void;
}

const TOTAL_STEPS = 5;

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  open,
  isRepeat,
  settings,
  auth,
  accentHex,
  onUpdateSettings,
  onLoginYt,
  onLoginSpotify,
  onImportedPlaylist,
  onSyncedLiked,
  onComplete,
}) => {
  const [step, setStep] = useState(0);
  const [stepDir, setStepDir] = useState<'forward' | 'back'>('forward');
  const [vibePulseKey, setVibePulseKey] = useState(0);
  const [authBusy, setAuthBusy] = useState<'yt' | 'sp' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Step 3 inline 1-by-1 playlist selector state
  const [obSource, setObSource] = useState<'yt' | 'sp'>('yt');
  const [obYtLists, setObYtLists] = useState<RemotePlaylistItem[]>([]);
  const [obSpLists, setObSpLists] = useState<RemotePlaylistItem[]>([]);
  const [obLoadingLists, setObLoadingLists] = useState(false);
  const [obSelectedIds, setObSelectedIds] = useState<Set<string>>(new Set());
  const [obImporting, setObImporting] = useState(false);
  const [obStatus, setObStatus] = useState<string | null>(null);

  // Step 5 interactive playground state
  const [demoPlaying, setDemoPlaying] = useState(true);
  const [demoLiked, setDemoLiked] = useState(false);
  const [demoVol, setDemoVol] = useState(75);

  const goToStep = (next: number) => {
    const clamped = Math.max(0, Math.min(TOTAL_STEPS - 1, next));
    setStepDir(clamped < step ? 'back' : 'forward');
    setStep(clamped);
  };

  useEffect(() => {
    if (open) {
      setStep(0);
      setStepDir('forward');
      setAuthError(null);
      setObSelectedIds(new Set());
      setObStatus(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || step !== 3) return;
    if (obSource === 'yt' && !auth.yt.connected && auth.spotify.connected) {
      setObSource('sp');
      return;
    }
    if (obSource === 'yt' && auth.yt.connected && obYtLists.length === 0) {
      setObLoadingLists(true);
      fetchMyYtPlaylists()
        .then(setObYtLists)
        .catch(() => {})
        .finally(() => setObLoadingLists(false));
    }
    if (obSource === 'sp' && auth.spotify.connected && obSpLists.length === 0) {
      setObLoadingLists(true);
      fetchMySpotifyPlaylists()
        .then(setObSpLists)
        .catch(() => {})
        .finally(() => setObLoadingLists(false));
    }
  }, [open, step, obSource, auth.yt.connected, auth.spotify.connected, obYtLists.length, obSpLists.length]);

  if (!open) return null;

  const intensity = settings.glassIntensity;

  const runLogin = async (kind: 'yt' | 'sp', fn: () => Promise<void>) => {
    setAuthBusy(kind);
    setAuthError(null);
    try {
      await fn();
      setObSource(kind);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setAuthBusy(null);
    }
  };

  const obActiveLists = obSource === 'yt' ? obYtLists : obSpLists;
  const toggleObSelect = (id: string) => {
    setObSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleObSelectAll = () => {
    if (obSelectedIds.size === obActiveLists.length && obActiveLists.length > 0) {
      setObSelectedIds(new Set());
    } else {
      setObSelectedIds(new Set(obActiveLists.map((p) => p.id)));
    }
  };

  const importObSelected = async () => {
    const picked = obActiveLists.filter((p) => obSelectedIds.has(p.id));
    if (picked.length === 0) return;
    setObImporting(true);
    setAuthError(null);
    let count = 0;
    for (const pl of picked) {
      setObStatus(`Importing "${pl.title}" (${count + 1}/${picked.length})...`);
      try {
        const target = pl.url || pl.id;
        const res = await importPlaylistByUrl(target);
        onImportedPlaylist?.(res.title || pl.title, res.tracks, {
          source: res.source,
          sourceId: target,
        });
        count++;
      } catch {
        // Keep importing remaining selected playlists
      }
    }
    setObImporting(false);
    setObSelectedIds(new Set());
    setObStatus(`Imported ${count} playlist${count === 1 ? '' : 's'}!`);
  };

  const syncObLiked = async () => {
    setObImporting(true);
    setAuthError(null);
    setObStatus('Syncing YouTube Liked Songs...');
    try {
      const res = await importPlaylistByUrl('VLLM');
      onSyncedLiked?.(res.tracks);
      setObStatus(`Synced ${res.tracks.length} liked songs!`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not sync Liked Songs');
      setObStatus(null);
    } finally {
      setObImporting(false);
    }
  };

  return (
    <div className="cw-onboard-backdrop" role="dialog" aria-label="ClaudeWaves Welcome Setup">
      <div className="cw-onboard-container cw-comic-frame">
        <GlassCard intensity={intensity} padding="28px 32px" radius="30px" variant="regular">
          {/* Header: Back + Elastic Step Dots + Skip */}
          <div className="cw-onboard-top">
            <div style={{ width: 76 }}>
              {step > 0 && (
                <GlassButton
                  size="sm"
                  variant="clear"
                  intensity={intensity}
                  icon={<ArrowLeft size={16} />}
                  onClick={() => goToStep(step - 1)}
                >
                  Back
                </GlassButton>
              )}
            </div>

            <div className="cw-step-dots" aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}>
              {Array.from({ length: TOTAL_STEPS }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="cw-step-dot"
                  data-active={idx === step}
                  aria-label={`Go to step ${idx + 1}`}
                  onClick={() => goToStep(idx)}
                />
              ))}
            </div>

            <div style={{ width: 76, display: 'flex', justifyContent: 'flex-end' }}>
              <GlassButton
                size="sm"
                variant="clear"
                intensity={intensity}
                onClick={onComplete}
              >
                {isRepeat ? 'Close' : 'Skip'}
              </GlassButton>
            </div>
          </div>

          {/* Step Body with Per-Page Motion & Directional Enter */}
          <div
            key={step}
            className={`cw-onboard-stage cw-onboard-stage--step-${step}`}
            data-dir={stepDir}
          >
            {/* STEP 0: WELCOME SPOTLIGHT */}
            {step === 0 && (
              <div className="cw-onboard-step">
                <div className="cw-ob-logo-orbit">
                  <span className="cw-ob-logo-ring" aria-hidden="true" />
                  <img className="cw-onboard-logo-img" src="/app_icon.png" alt="ClaudeWaves" />
                </div>
                <h1 className="cw-onboard-title">Welcome to ClaudeWaves Desktop</h1>
                <p className="cw-onboard-desc">
                  Your YouTube Music experience on desktop — crafted with real Apple-style Liquid Glass, 240Hz spring motion, synced lyrics, and instant playlist imports.
                </p>

                <div className="cw-feature-grid">
                  <div
                    className="cw-content-card cw-feature-pill cw-ob-stagger"
                    style={{ '--ob-i': 0 } as React.CSSProperties}
                  >
                    <Sparkles size={18} color="var(--cw-accent)" />
                    <div>
                      <div className="cw-feature-head">240Hz Liquid Glass</div>
                      <div className="cw-muted">Refracting macOS Tahoe chrome &amp; Comic Pop themes</div>
                    </div>
                  </div>
                  <div
                    className="cw-content-card cw-feature-pill cw-ob-stagger"
                    style={{ '--ob-i': 1 } as React.CSSProperties}
                  >
                    <Mic2 size={18} color="var(--cw-accent)" />
                    <div>
                      <div className="cw-feature-head">Live Synced Lyrics</div>
                      <div className="cw-muted">Side-by-side panel &amp; full-bleed lyrics with tap-to-seek</div>
                    </div>
                  </div>
                  <div
                    className="cw-content-card cw-feature-pill cw-ob-stagger"
                    style={{ '--ob-i': 2 } as React.CSSProperties}
                  >
                    <Download size={18} color="var(--cw-accent)" />
                    <div>
                      <div className="cw-feature-head">Spotify &amp; YT Import</div>
                      <div className="cw-muted">Bring your playlists &amp; Liked Songs in seconds</div>
                    </div>
                  </div>
                  <div
                    className="cw-content-card cw-feature-pill cw-ob-stagger"
                    style={{ '--ob-i': 3 } as React.CSSProperties}
                  >
                    <Keyboard size={18} color="var(--cw-accent)" />
                    <div>
                      <div className="cw-feature-head">Desktop Native</div>
                      <div className="cw-muted">Global shortcuts, Windows media keys &amp; fast streaming</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: LIVE THEME & ANIMATED SKIN PICKER */}
            {step === 1 && (() => {
              const activeSkinObj =
                LAYOUT_SKIN_CARDS.find((s) => s.id === settings.layoutSkin) ?? LAYOUT_SKIN_CARDS[0];
              const activePresetLabel =
                settings.layoutSkin === 'default'
                  ? PRESET_LABELS[Math.max(0, PRESETS.indexOf(settings.themePreset))]
                  : activeSkinObj.name;
              const activeModeLabel =
                MODE_LABELS[Math.max(0, MODES.indexOf(settings.themeMode))];
              return (
                <div className="cw-onboard-step cw-onboard-step--vibe">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="cw-onboard-hero-icon cw-ob-icon-palette">
                      <Palette size={26} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <h1 className="cw-onboard-title" style={{ fontSize: 23 }}>Pick Your Vibe</h1>
                      <div key={vibePulseKey} className="cw-ob-vibe-chip">
                        <span>{activePresetLabel}</span>
                        <span>·</span>
                        <span>{activeModeLabel}</span>
                        {settings.amoled && <span>· AMOLED</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <div className="cw-muted" style={{ marginBottom: 6, fontSize: 12 }}>App Layout Skin</div>
                      <div className="cw-onboard-skin-grid" role="radiogroup" aria-label="App Layout Skin">
                        {LAYOUT_SKIN_CARDS.map((skin, skinIdx) => {
                          const selected = settings.layoutSkin === skin.id;
                          return (
                            <button
                              key={skin.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              className="cw-skin-card cw-ob-stagger"
                              data-skin-id={skin.id}
                              data-selected={selected}
                              style={
                                {
                                  '--skin-preview-accent': skin.accent,
                                  '--ob-i': skinIdx,
                                } as React.CSSProperties
                              }
                              onClick={() => {
                                onUpdateSettings({ layoutSkin: skin.id });
                                setVibePulseKey((k) => k + 1);
                              }}
                            >
                              <SkinWireframePreview skinId={skin.id} />
                              <div className="cw-skin-card-meta">
                                <div className="cw-skin-card-name">
                                  <span>{skin.name}</span>
                                  {selected && <Check size={13} className="cw-skin-check" />}
                                </div>
                                <div className="cw-skin-card-sub">{skin.subtitle}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div className="cw-muted" style={{ marginBottom: 5, fontSize: 12 }}>Theme Style</div>
                        <GlassSegmented
                          size="sm"
                          options={PRESET_LABELS}
                          value={Math.max(0, PRESETS.indexOf(settings.themePreset))}
                          intensity={intensity}
                          onChange={(idx) => {
                            onUpdateSettings({
                              themePreset: PRESETS[idx] ?? 'neutral',
                              layoutSkin: 'default',
                            });
                            setVibePulseKey((k) => k + 1);
                          }}
                        />
                      </div>

                      <div>
                        <div className="cw-muted" style={{ marginBottom: 5, fontSize: 12 }}>Appearance</div>
                        <GlassSegmented
                          size="sm"
                          options={MODE_LABELS}
                          value={Math.max(0, MODES.indexOf(settings.themeMode))}
                          intensity={intensity}
                          onChange={(idx) => {
                            onUpdateSettings({ themeMode: MODES[idx] ?? 'dark' });
                            setVibePulseKey((k) => k + 1);
                          }}
                        />
                      </div>
                    </div>

                    <div className="cw-swatch-row cw-ob-swatch-row" style={{ justifyContent: 'center' }}>
                      {ACCENT_PRESETS.map((s, swIdx) => {
                        const isNeutral = s.hex === 'neutral';
                        const isStyledPreset =
                          settings.layoutSkin !== 'default' ||
                          settings.themePreset === 'comic' ||
                          settings.themePreset === 'rhythmo';
                        const selected = isStyledPreset
                          ? (isNeutral && !settings.accentHex.startsWith('#')) ||
                            (!isNeutral && settings.accentHex.toLowerCase() === s.hex.toLowerCase())
                          : (isNeutral && settings.themePreset === 'neutral') ||
                            (!isNeutral &&
                              settings.themePreset === 'dynamic' &&
                              settings.accentHex.toLowerCase() === s.hex.toLowerCase());
                        const label =
                          isNeutral && settings.layoutSkin !== 'default'
                            ? 'Skin Default Accent'
                            : isNeutral && settings.themePreset === 'comic'
                              ? 'Comic Pop Default'
                              : isNeutral && settings.themePreset === 'rhythmo'
                                ? 'Rhythmo Default'
                                : s.name;
                        return (
                          <button
                            key={s.hex}
                            type="button"
                            className="cw-swatch"
                            title={label}
                            aria-label={label}
                            data-selected={selected}
                            style={
                              {
                                '--ob-i': swIdx,
                                background: isNeutral
                                  ? 'linear-gradient(135deg, #ffffff 50%, #111111 50%)'
                                  : s.hex,
                              } as React.CSSProperties
                            }
                            onClick={() => {
                              if (isStyledPreset) {
                                onUpdateSettings({ accentHex: isNeutral ? 'neutral' : s.hex });
                              } else {
                                onUpdateSettings(
                                  isNeutral
                                    ? { themePreset: 'neutral', accentHex: 'neutral' }
                                    : { themePreset: 'dynamic', accentHex: s.hex },
                                );
                              }
                            }}
                          />
                        );
                      })}
                    </div>

                    <div className="cw-setting-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>Pure Black (AMOLED)</div>
                        <div className="cw-muted" style={{ fontSize: 12 }}>Deep #000000 backdrop for OLED displays</div>
                      </div>
                      <GlassSwitch
                        checked={settings.amoled}
                        tint={accentHex}
                        intensity={intensity}
                        onChange={(amoled) => {
                          onUpdateSettings({ amoled });
                          setVibePulseKey((k) => k + 1);
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* STEP 2: PROFILE NAME */}
            {step === 2 && (
              <div className="cw-onboard-step">
                <div className="cw-onboard-hero-icon cw-ob-icon-user">
                  <User size={30} />
                </div>
                <h1 className="cw-onboard-title">What should we call you?</h1>
                <p className="cw-onboard-desc">
                  Personalize your desktop greeting on the Home screen.
                </p>

                <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <GlassInput
                    value={settings.profileName}
                    tint={accentHex}
                    intensity={intensity}
                    placeholder="Enter your name (e.g. Ayep)..."
                    onChange={(e) => onUpdateSettings({ profileName: e.target.value })}
                    onClear={() => onUpdateSettings({ profileName: '' })}
                  />
                  <div className="cw-content-card cw-ob-greeting-card" style={{ padding: '14px 18px', textAlign: 'center' }}>
                    <div className="cw-muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Home Preview
                    </div>
                    <div
                      key={settings.profileName || 'default'}
                      className="cw-ob-greeting-text"
                      style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}
                    >
                      Good afternoon{settings.profileName.trim() ? `, ${settings.profileName.trim()}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: CONNECT ACCOUNTS */}
            {step === 3 && (
              <div className="cw-onboard-step">
                <div className="cw-onboard-hero-icon cw-ob-icon-connect">
                  <LogIn size={30} />
                </div>
                <h1 className="cw-onboard-title">Connect Your Music</h1>
                <p className="cw-onboard-desc">
                  Sign in to personalize your Home feed and import your Liked Songs &amp; Playlists — or skip and browse anonymously.
                </p>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div
                    className="cw-content-card cw-setting-row cw-ob-stagger"
                    style={{ padding: '14px 18px', '--ob-i': 0 } as React.CSSProperties}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>YouTube Music</div>
                      <div className="cw-muted">
                        {auth.yt.connected
                          ? `Connected as ${auth.yt.accountName}`
                          : 'Personalized Home feed, Liked Songs & YT Playlists'}
                      </div>
                    </div>
                    {auth.yt.connected ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cw-accent)', fontWeight: 700, fontSize: 13 }}>
                        <CheckCircle2 size={18} /> Connected
                      </span>
                    ) : (
                      <GlassButton
                        size="sm"
                        variant="filled"
                        tint="#FF0033"
                        className="cw-brand-cta"
                        intensity={intensity}
                        disabled={authBusy === 'yt'}
                        icon={authBusy === 'yt' ? <Loader2 size={14} className="cw-spin" /> : <LogIn size={14} />}
                        onClick={() => runLogin('yt', onLoginYt)}
                      >
                        {authBusy === 'yt' ? 'Opening...' : 'Sign in'}
                      </GlassButton>
                    )}
                  </div>

                  <div
                    className="cw-content-card cw-setting-row cw-ob-stagger"
                    style={{ padding: '14px 18px', '--ob-i': 1 } as React.CSSProperties}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Spotify</div>
                      <div className="cw-muted">
                        {auth.spotify.connected
                          ? `Connected as ${auth.spotify.displayName}`
                          : '1-click import your personal & saved Spotify playlists'}
                      </div>
                    </div>
                    {auth.spotify.connected ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cw-accent)', fontWeight: 700, fontSize: 13 }}>
                        <CheckCircle2 size={18} /> Connected
                      </span>
                    ) : (
                      <GlassButton
                        size="sm"
                        variant="filled"
                        tint="#1DB954"
                        className="cw-brand-cta"
                        intensity={intensity}
                        disabled={authBusy === 'sp'}
                        icon={authBusy === 'sp' ? <Loader2 size={14} className="cw-spin" /> : <LogIn size={14} />}
                        onClick={() => runLogin('sp', onLoginSpotify)}
                      >
                        {authBusy === 'sp' ? 'Opening...' : 'Sign in'}
                      </GlassButton>
                    )}
                  </div>

                  {authError && <div style={{ color: '#ff5c5c', fontSize: 12.5 }}>{authError}</div>}

                  {(auth.yt.connected || auth.spotify.connected) && (
                    <div className="cw-content-card" style={{ padding: '12px 14px', textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          Select Playlists to Import ({obActiveLists.length})
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {auth.yt.connected && auth.spotify.connected && (
                            <GlassSegmented
                              size="sm"
                              options={['YT Music', 'Spotify']}
                              value={obSource === 'yt' ? 0 : 1}
                              intensity={intensity}
                              onChange={(i) => {
                                setObSource(i === 0 ? 'yt' : 'sp');
                                setObSelectedIds(new Set());
                              }}
                            />
                          )}
                          {obSource === 'yt' && auth.yt.connected && (
                            <button
                              type="button"
                              className="cw-offset-toggle-pill"
                              disabled={obImporting}
                              onClick={syncObLiked}
                            >
                              <Heart size={11} /> Sync Liked
                            </button>
                          )}
                          {obActiveLists.length > 0 && (
                            <button
                              type="button"
                              className="cw-offset-toggle-pill"
                              disabled={obImporting}
                              onClick={toggleObSelectAll}
                            >
                              {obSelectedIds.size === obActiveLists.length ? 'Unselect All' : 'Select All'}
                            </button>
                          )}
                        </div>
                      </div>

                      {obLoadingLists ? (
                        <div className="cw-muted" style={{ padding: 8 }}>Loading playlists...</div>
                      ) : obActiveLists.length === 0 ? (
                        <div className="cw-muted" style={{ padding: 8 }}>No playlists found yet.</div>
                      ) : (
                        <div className="cw-onboard-pl-box">
                          {obActiveLists.map((pl) => {
                            const checked = obSelectedIds.has(pl.id);
                            return (
                              <div key={pl.id} className="cw-import-row-wrap" data-active={checked}>
                                <button
                                  type="button"
                                  className="cw-import-select-btn"
                                  disabled={obImporting}
                                  onClick={() => toggleObSelect(pl.id)}
                                  aria-pressed={checked}
                                >
                                  <span style={{ color: checked ? 'var(--cw-accent)' : 'var(--cw-text-muted)', display: 'inline-flex', flexShrink: 0 }}>
                                    {checked ? <CheckSquare size={15} /> : <Square size={15} />}
                                  </span>
                                  {pl.thumbnailUrl && (
                                    <img className="cw-recent-thumb" src={pl.thumbnailUrl} alt={pl.title} />
                                  )}
                                  <div className="cw-row-meta">
                                    <div className="cw-track-title cw-ellipsis">{pl.title}</div>
                                    <div className="cw-track-artist cw-ellipsis">{pl.subtitle}</div>
                                  </div>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--cw-accent)', fontWeight: 650 }}>
                          {obStatus ?? (obSelectedIds.size > 0 ? `${obSelectedIds.size} selected` : 'Tap playlists 1-by-1')}
                        </span>
                        {obSelectedIds.size > 0 && (
                          <GlassButton
                            size="sm"
                            variant="filled"
                            tint={accentHex}
                            intensity={intensity}
                            disabled={obImporting}
                            icon={obImporting ? <Loader2 size={13} className="cw-spin" /> : <Download size={13} />}
                            onClick={importObSelected}
                          >
                            Import ({obSelectedIds.size})
                          </GlassButton>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4: INTERACTIVE PLAYGROUND & SHORTCUTS */}
            {step === 4 && (
              <div className="cw-onboard-step">
                <div className="cw-onboard-hero-icon cw-ob-icon-spark">
                  <Sparkles size={30} />
                </div>
                <h1 className="cw-onboard-title">Feel the Flow</h1>
                <p className="cw-onboard-desc">
                  Try the spring controls below, then use keyboard shortcuts anytime to fly around your library.
                </p>

                <div className="cw-content-card" style={{ width: '100%', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        className="cw-ob-demo-waves"
                        data-playing={demoPlaying}
                        style={{ '--vol-scale': Math.max(0.25, demoVol / 100) } as React.CSSProperties}
                      >
                        <span /><span /><span /><span /><span />
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14.5 }}>Interactive Liquid Controls</div>
                        <div className="cw-muted">Tap Play, burst the Heart, or slide Volume</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <GlassButton
                        size="sm"
                        variant={demoLiked ? 'tinted' : 'glass'}
                        tint={accentHex}
                        intensity={intensity}
                        className={demoLiked ? 'cw-heart-burst' : ''}
                        icon={<Heart size={16} fill={demoLiked ? 'currentColor' : 'none'} />}
                        onClick={() => setDemoLiked((v) => !v)}
                      />
                      <GlassButton
                        size="sm"
                        variant="filled"
                        tint={accentHex}
                        intensity={intensity}
                        icon={demoPlaying ? <Pause size={16} /> : <Play size={16} />}
                        onClick={() => setDemoPlaying((v) => !v)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Volume2 size={16} color="var(--cw-accent)" />
                    <div style={{ flex: 1 }}>
                      <GlassSlider
                        min={0}
                        max={100}
                        value={demoVol}
                        tint={accentHex}
                        intensity={intensity}
                        onChange={(v) => setDemoVol(Math.round(v))}
                        aria-label="Demo volume"
                      />
                    </div>
                    <span className="cw-time-label">{demoVol}%</span>
                  </div>
                </div>

                <div className="cw-shortcut-chips">
                  <span className="cw-ob-keycap" style={{ '--ob-i': 0 } as React.CSSProperties}><b>Space</b> Play/Pause</span>
                  <span className="cw-ob-keycap" style={{ '--ob-i': 1 } as React.CSSProperties}><b>Ctrl+K</b> Quick Search</span>
                  <span className="cw-ob-keycap" style={{ '--ob-i': 2 } as React.CSSProperties}><b>L</b> Lyrics Panel</span>
                  <span className="cw-ob-keycap" style={{ '--ob-i': 3 } as React.CSSProperties}><b>Q</b> Queue Panel</span>
                  <span className="cw-ob-keycap" style={{ '--ob-i': 4 } as React.CSSProperties}><b>← / →</b> Seek 5s</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer CTA */}
          <div className="cw-onboard-footer">
            {step < TOTAL_STEPS - 1 ? (
              <GlassButton
                size="md"
                variant="filled"
                tint={accentHex}
                intensity={intensity}
                icon={<ArrowRight size={17} />}
                onClick={() => goToStep(step + 1)}
              >
                Continue
              </GlassButton>
            ) : (
              <GlassButton
                size="lg"
                variant="filled"
                tint={accentHex}
                intensity={intensity}
                icon={<Play size={17} />}
                onClick={onComplete}
              >
                Start Listening
              </GlassButton>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
