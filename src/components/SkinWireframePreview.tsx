import React from 'react';
import type { LayoutSkin } from '../types';

export interface LayoutSkinCardSpec {
  id: LayoutSkin;
  name: string;
  subtitle: string;
  accent: string;
}

export const LAYOUT_SKIN_CARDS: LayoutSkinCardSpec[] = [
  { id: 'default', name: 'ClaudeWaves', subtitle: 'Floating dock & 3D deck', accent: '#259d8a' },
  { id: 'spotify', name: 'Spotify', subtitle: 'Obsidian 2x4 & flat bar', accent: '#1ed760' },
  { id: 'ytmusic', name: 'YouTube Music', subtitle: 'Quick picks & edge bar', accent: '#ff0033' },
  { id: 'apple', name: 'Apple Music', subtitle: 'Top LCD & tall cards', accent: '#fa2d48' },
  { id: 'tidal', name: 'Tidal HiFi', subtitle: 'Obsidian MAX & razor bar', accent: '#00e5ff' },
  { id: 'soundcloud', name: 'SoundCloud', subtitle: 'Orange 48-bar wave dock', accent: '#ff5500' },
  { id: 'nothing', name: 'Nothing OS', subtitle: 'Dot-matrix monochrome', accent: '#d71921' },
];

export const SkinWireframePreview: React.FC<{ skinId: LayoutSkin }> = React.memo(({ skinId }) => {
  if (skinId === 'apple') {
    return (
      <div className="cw-skin-thumb cw-skin-thumb--apple" aria-hidden="true">
        <div className="cw-sk-top">
          <span className="cw-sk-dots" />
          <span className="cw-sk-lcd" />
          <span className="cw-sk-dots" />
        </div>
        <div className="cw-sk-body">
          <div className="cw-sk-rail" />
          <div className="cw-sk-main">
            <div className="cw-sk-cards cw-sk-cards--tall">
              <span /><span /><span /><span />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`cw-skin-thumb cw-skin-thumb--${skinId}`} aria-hidden="true">
      <div className="cw-sk-body">
        <div className="cw-sk-rail" />
        <div className="cw-sk-main">
          <div className="cw-sk-bar" />
          {skinId === 'spotify' ? (
            <div className="cw-sk-grid-2x4">
              <span /><span /><span /><span />
              <span /><span /><span /><span />
            </div>
          ) : skinId === 'ytmusic' ? (
            <div className="cw-sk-grid-qp">
              <span /><span /><span />
              <span /><span /><span />
              <span /><span /><span />
            </div>
          ) : skinId === 'tidal' ? (
            <div className="cw-sk-tidal-hero">
              <span className="cw-sk-tidal-badge" />
              <div className="cw-sk-tidal-cards">
                <span /><span />
              </div>
            </div>
          ) : skinId === 'soundcloud' ? (
            <div className="cw-sk-sc-stream">
              <span /><span /><span />
            </div>
          ) : skinId === 'nothing' ? (
            <div className="cw-sk-nothing-grid">
              <span /><span /><span /><span />
            </div>
          ) : (
            <div className="cw-sk-deck">
              <span /><span className="is-mid" /><span />
            </div>
          )}
        </div>
      </div>
      <div className="cw-sk-dock">
        {skinId === 'ytmusic' && <span className="cw-sk-edge-accent" />}
        {skinId === 'soundcloud' && (
          <div className="cw-sk-wave-strip">
            <span /><span /><span /><span /><span /><span /><span /><span />
          </div>
        )}
        <span className="cw-sk-play-pill" />
      </div>
    </div>
  );
});
