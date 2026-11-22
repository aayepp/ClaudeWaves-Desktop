import React, { useEffect, useRef } from 'react';
import { GlassButton, GlassCard, GlassSwitch } from '@zakisheriff/liquid-glass';
import { RotateCcw, Sliders, X } from 'lucide-react';
import { AUTOEQ_PROFILES } from '../data/autoeq';
import { EQ_FREQUENCIES, EQ_PRESETS, type AppSettings } from '../types';

interface QuickEqPopoverProps {
  open: boolean;
  settings: AppSettings;
  accentHex: string;
  intensity: number;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

export const QuickEqPopover: React.FC<QuickEqPopoverProps> = ({
  open,
  settings,
  accentHex,
  intensity,
  onUpdate,
  onClose,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
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
        </div>
      </GlassCard>
    </div>
  );
};
