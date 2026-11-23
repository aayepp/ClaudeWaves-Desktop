import React, { useEffect, useRef } from 'react';
import { GlassButton, GlassCard, GlassSwitch } from '@zakisheriff/liquid-glass';
import { Headphones, Repeat, RotateCcw, Sliders, Sparkles, X } from 'lucide-react';
import { AUTOEQ_PROFILES } from '../data/autoeq';
import type { AudioOutputDeviceInfo } from '../hooks/usePlayer';
import { EQ_FREQUENCIES, EQ_PRESETS, formatDuration, type AppSettings } from '../types';

interface QuickEqPopoverProps {
  open: boolean;
  settings: AppSettings;
  accentHex: string;
  intensity: number;
  abLoop?: { aMs: number | null; bMs: number | null };
  audioOutputDevices?: AudioOutputDeviceInfo[];
  onSetLoopA?: () => void;
  onSetLoopB?: () => void;
  onClearLoop?: () => void;
  onRefreshOutputs?: () => void;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

export const QuickEqPopover: React.FC<QuickEqPopoverProps> = ({
  open,
  settings,
  accentHex,
  intensity,
  abLoop = { aMs: null, bMs: null },
  audioOutputDevices = [],
  onSetLoopA,
  onSetLoopB,
  onClearLoop,
  onRefreshOutputs,
  onUpdate,
  onClose,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    onRefreshOutputs?.();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (target.closest('[data-eq-trigger="true"]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={wrapRef}
      className="cw-quick-eq-popover cw-comic-frame"
      role="dialog"
      aria-label="Quick Equalizer and DSP"
    >
      <GlassCard intensity={intensity} padding="16px 18px" radius="22px">
        <div className="cw-quick-eq-inner">
          {/* Header */}
          <div className="cw-quick-eq-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Sliders size={16} color="var(--cw-accent)" />
              <span className="cw-quick-eq-title">Equalizer &amp; DSP</span>
              <span className="cw-sidebar-widget-pill">
                {settings.eqPreset}
                {settings.autoEqProfile !== 'Off' ? ` + ${settings.autoEqProfile}` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <GlassButton
                size="sm"
                variant="glass"
                intensity={intensity}
                icon={<RotateCcw size={12} />}
                onClick={() =>
                  onUpdate({
                    eqPreset: 'Flat',
                    eqGains: [...EQ_PRESETS.Flat],
                    autoEqProfile: 'Off',
                  })
                }
              >
                Flat
              </GlassButton>
              <button
                type="button"
                className="cw-skin-icon-btn"
                aria-label="Close equalizer"
                onClick={onClose}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Preset Chips */}
          <div className="cw-chips">
            {Object.entries(EQ_PRESETS).map(([name, gains]) => (
              <button
                key={name}
                type="button"
                className="cw-mood-chip"
                style={{ padding: '4px 10px', fontSize: 11.5 }}
                data-active={settings.eqPreset === name}
                onClick={() => onUpdate({ eqPreset: name, eqGains: [...gains] })}
              >
                {name}
              </button>
            ))}
          </div>

          {/* 10-Band EQ Sliders */}
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
                      const next = [
                        ...(settings.eqGains.length === 10 ? settings.eqGains : EQ_PRESETS.Flat),
                      ];
                      next[idx] = Number(e.target.value);
                      onUpdate({ eqPreset: 'Custom', eqGains: next });
                    }}
                  />
                  <span className="cw-eq-freq">{label}</span>
                </div>
              );
            })}
          </div>

          {/* Compact DSP Row: AutoEQ + Normalizer + Spatial 3D */}
          <div className="cw-quick-eq-dsp">
            <label className="cw-quick-eq-autoeq">
              <span className="cw-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                AutoEQ:
              </span>
              <select
                className="cw-social-input cw-quick-eq-select"
                value={settings.autoEqProfile}
                onChange={(e) => onUpdate({ autoEqProfile: e.target.value })}
              >
                {Object.entries(AUTOEQ_PROFILES).map(([id, spec]) => (
                  <option key={id} value={id}>
                    {spec.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="cw-quick-eq-switches">
              <div className="cw-quick-eq-switch-item">
                <span style={{ fontSize: 12, fontWeight: 600 }}>Normalizer</span>
                <GlassSwitch
                  checked={settings.volumeNormalizer}
                  tint={accentHex}
                  intensity={intensity}
                  onChange={(v) => onUpdate({ volumeNormalizer: v })}
                />
              </div>
              <div className="cw-quick-eq-switch-item">
                <span style={{ fontSize: 12, fontWeight: 600 }}>Spatial 3D</span>
                <GlassSwitch
                  checked={settings.spatialAudio}
                  tint={accentHex}
                  intensity={intensity}
                  onChange={(v) => onUpdate({ spatialAudio: v })}
                />
              </div>
            </div>
          </div>

          {/* Pitch / Reverb / Slowed+Reverb + A-B Loop + Output Device */}
          <div className="cw-quick-eq-fx">
            <div className="cw-quick-eq-fx-row">
              <div className="cw-quick-eq-slider-group">
                <div className="cw-quick-eq-slider-head">
                  <span className="cw-muted">Pitch</span>
                  <span>{settings.pitchSemitones > 0 ? `+${settings.pitchSemitones}` : settings.pitchSemitones} st</span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={0.5}
                  value={settings.pitchSemitones}
                  className="cw-offset-slider"
                  aria-label="Pitch semitones"
                  onChange={(e) => onUpdate({ pitchSemitones: Number(e.target.value) })}
                />
              </div>

              <div className="cw-quick-eq-slider-group">
                <div className="cw-quick-eq-slider-head">
                  <span className="cw-muted">Hall Reverb</span>
                  <span>{Math.round((settings.reverbMix || 0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.reverbMix}
                  className="cw-offset-slider"
                  aria-label="Reverb mix"
                  onChange={(e) => onUpdate({ reverbMix: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="cw-quick-eq-fx-actions">
              <button
                type="button"
                className="cw-mood-chip"
                style={{ padding: '4px 10px', fontSize: 11.5 }}
                data-active={settings.pitchSemitones === -2 && settings.reverbMix >= 0.4}
                onClick={() => {
                  const active = settings.pitchSemitones === -2 && settings.reverbMix >= 0.4;
                  onUpdate(
                    active
                      ? { playbackRate: 1, pitchSemitones: 0, reverbMix: 0 }
                      : { playbackRate: 0.85, pitchSemitones: -2, reverbMix: 0.45 },
                  );
                }}
              >
                <Sparkles size={11} style={{ marginRight: 4 }} />
                Slowed + Reverb
              </button>

              {(settings.pitchSemitones !== 0 || settings.reverbMix !== 0 || settings.playbackRate !== 1) && (
                <button
                  type="button"
                  className="cw-offset-btn"
                  onClick={() => onUpdate({ playbackRate: 1, pitchSemitones: 0, reverbMix: 0 })}
                >
                  Reset FX
                </button>
              )}

              {onSetLoopA && onSetLoopB && (
                <div className="cw-ab-loop-bar">
                  <Repeat size={12} color="var(--cw-accent)" />
                  <button
                    type="button"
                    className="cw-offset-btn"
                    data-active={abLoop.aMs !== null}
                    onClick={onSetLoopA}
                  >
                    {abLoop.aMs !== null ? `A ${formatDuration(abLoop.aMs)}` : 'Set A'}
                  </button>
                  <button
                    type="button"
                    className="cw-offset-btn"
                    data-active={abLoop.bMs !== null}
                    onClick={onSetLoopB}
                  >
                    {abLoop.bMs !== null ? `B ${formatDuration(abLoop.bMs)}` : 'Set B'}
                  </button>
                  {(abLoop.aMs !== null || abLoop.bMs !== null) && onClearLoop && (
                    <button type="button" className="cw-offset-btn" onClick={onClearLoop}>
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            <label className="cw-quick-eq-autoeq" style={{ width: '100%' }}>
              <Headphones size={13} color="var(--cw-accent)" />
              <span className="cw-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                Output:
              </span>
              <select
                className="cw-social-input cw-quick-eq-select"
                style={{ flex: 1 }}
                value={settings.audioOutputDeviceId}
                onChange={(e) => onUpdate({ audioOutputDeviceId: e.target.value })}
              >
                <option value="">System Default Output</option>
                {audioOutputDevices.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
