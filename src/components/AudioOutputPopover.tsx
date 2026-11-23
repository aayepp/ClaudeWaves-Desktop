import React, { useEffect, useRef } from 'react';
import { GlassCard } from '@zakisheriff/liquid-glass';
import { Check, Headphones, RefreshCw, Volume2, X } from 'lucide-react';
import type { AudioOutputDeviceInfo } from '../hooks/usePlayer';

interface AudioOutputPopoverProps {
  open: boolean;
  selectedDeviceId: string;
  devices: AudioOutputDeviceInfo[];
  intensity: number;
  onSelect: (deviceId: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export const AudioOutputPopover: React.FC<AudioOutputPopoverProps> = ({
  open,
  selectedDeviceId,
  devices,
  intensity,
  onSelect,
  onRefresh,
  onClose,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    onRefresh();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (target.closest('[data-output-trigger="true"]')) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, onRefresh]);

  if (!open) return null;

  return (
    <div
      ref={wrapRef}
      className="cw-output-popover cw-comic-frame"
      role="dialog"
      aria-label="Audio Output Device Switcher"
    >
      <GlassCard intensity={intensity} padding="14px 16px" radius="20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Headphones size={15} color="var(--cw-accent)" />
              <span style={{ fontWeight: 750, fontSize: 13.5 }}>Audio Output Device</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                className="cw-skin-icon-btn"
                title="Refresh output devices"
                aria-label="Refresh output devices"
                onClick={onRefresh}
              >
                <RefreshCw size={13} />
              </button>
              <button
                type="button"
                className="cw-skin-icon-btn"
                aria-label="Close audio output switcher"
                onClick={onClose}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="cw-output-list">
            <button
              type="button"
              className="cw-output-row"
              data-active={!selectedDeviceId}
              onClick={() => {
                onSelect('');
                onClose();
              }}
            >
              <Volume2 size={14} />
              <span className="cw-ellipsis" style={{ flex: 1, textAlign: 'left' }}>
                System Default Output
              </span>
              {!selectedDeviceId && <Check size={14} color="var(--cw-accent)" />}
            </button>

            {devices.length === 0 ? (
              <div className="cw-muted" style={{ fontSize: 11.5, padding: '8px 6px' }}>
                No extra audio outputs detected. Click refresh after plugging in headphones or DAC.
              </div>
            ) : (
              devices.map((dev) => {
                const active = selectedDeviceId === dev.deviceId;
                return (
                  <button
                    key={dev.deviceId}
                    type="button"
                    className="cw-output-row"
                    data-active={active}
                    onClick={() => {
                      onSelect(dev.deviceId);
                      onClose();
                    }}
                  >
                    <Headphones size={14} />
                    <span className="cw-ellipsis" style={{ flex: 1, textAlign: 'left' }}>
                      {dev.label}
                    </span>
                    {active && <Check size={14} color="var(--cw-accent)" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
