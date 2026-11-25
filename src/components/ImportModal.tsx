import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GlassButton, GlassCard, GlassInput, GlassSegmented } from '@zakisheriff/liquid-glass';
import { CheckSquare, Download, FileSpreadsheet, Heart, Loader2, Square, Upload, X } from 'lucide-react';
import {
  fetchMySpotifyPlaylists,
  fetchMyYtPlaylists,
  importPlaylistByUrl,
  importPlaylistFromCsv,
  importSpotifyLikedSongs,
  type AuthStatus,
  type RemotePlaylistItem,
} from '../api/auth';
import type { Track } from '../types';

interface ImportModalProps {
  open: boolean;
  initialTab?: number; // 0 Paste Link, 1 YouTube Music, 2 Spotify
  auth: AuthStatus;
  accentHex: string;
  intensity: number;
  onClose: () => void;
  onImportedPlaylist: (
    title: string,
    tracks: Track[],
    openNow?: boolean,
    meta?: { source?: 'youtube' | 'spotify'; sourceId?: string },
  ) => void;
  onSyncedLiked: (tracks: Track[]) => void;
  onOpenSettings: () => void;
}

/**
 * Centered stable Import Modal (replaces drag-capturing GlassSheet so 1-by-1 playlist checkboxes
 * click and toggle reliably with zero pointer-capture interference).
 */
export const ImportModal: React.FC<ImportModalProps> = ({
  open,
  initialTab = 0,
  auth,
  accentHex,
  intensity,
  onClose,
  onImportedPlaylist,
  onSyncedLiked,
  onOpenSettings,
}) => {
  const [tab, setTab] = useState(initialTab);
  const [urlInput, setUrlInput] = useState('');
  const [filterText, setFilterText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [ytPlaylists, setYtPlaylists] = useState<RemotePlaylistItem[]>([]);
  const [spPlaylists, setSpPlaylists] = useState<RemotePlaylistItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingLists, setLoadingLists] = useState(false);

  const [csvFileName, setCsvFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvTitle, setCsvTitle] = useState('');
  const [csvDragOver, setCsvDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setFilterText('');
    setSelectedIds(new Set());
    setErrorMsg(null);
    setStatusMsg(null);
    setProgress(null);
    setCsvDragOver(false);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setErrorMsg(null);
    if (tab === 1 && auth.yt.connected) {
      setLoadingLists(true);
      fetchMyYtPlaylists()
        .then(setYtPlaylists)
        .catch((e) => setErrorMsg(e instanceof Error ? e.message : 'Failed to load YouTube playlists'))
        .finally(() => setLoadingLists(false));
    }
    if (tab === 2 && auth.spotify.connected) {
      setLoadingLists(true);
      fetchMySpotifyPlaylists()
        .then(setSpPlaylists)
        .catch((e) => setErrorMsg(e instanceof Error ? e.message : 'Failed to load Spotify playlists'))
        .finally(() => setLoadingLists(false));
    }
  }, [open, tab, auth.yt.connected, auth.spotify.connected]);

  const activeList = tab === 1 ? ytPlaylists : tab === 2 ? spPlaylists : [];
  const filteredList = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter(
      (p) => p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q),
    );
  }, [activeList, filterText]);

  if (!open) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredList.length && filteredList.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((p) => p.id)));
    }
  };

  const handleImportSingleUrl = async (targetUrl: string, syncAsLiked = false) => {
    const clean = targetUrl.trim();
    if (!clean) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(
      clean.includes('spotify')
        ? 'Fetching Spotify playlist & matching tracks on YouTube Music...'
        : 'Fetching playlist tracks from YouTube Music...',
    );
    try {
      const res = await importPlaylistByUrl(clean);
      if (syncAsLiked) {
        onSyncedLiked(res.tracks);
        setStatusMsg(`Synced ${res.tracks.length} liked songs!`);
      } else {
        onImportedPlaylist(res.title, res.tracks, true, { source: res.source, sourceId: clean });
        setUrlInput('');
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  };

  const handleBatchImport = async (items: RemotePlaylistItem[]) => {
    if (items.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    let importedCount = 0;
    let lastErr: string | null = null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setProgress({ done: i, total: items.length, label: item.title });
      try {
        const target = item.url || item.id;
        const res = await importPlaylistByUrl(target);
        onImportedPlaylist(res.title || item.title, res.tracks, items.length === 1, {
          source: res.source,
          sourceId: target,
        });
        importedCount++;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : 'Import failed';
      }
    }

    setProgress({ done: items.length, total: items.length, label: 'Done' });
    setBusy(false);
    setSelectedIds(new Set());
    if (importedCount === 0 && lastErr) {
      setErrorMsg(lastErr);
    } else {
      setStatusMsg(`Imported ${importedCount} / ${items.length} playlists!`);
    }
    if (importedCount > 0 && items.length === 1) {
      onClose();
    }
  };

  const handleSyncSpotifyLiked = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg('Fetching Spotify Liked Songs & matching on YouTube Music...');
    try {
      const res = await importSpotifyLikedSongs();
      onSyncedLiked(res.tracks);
      const total = res.totalSourceTracks ?? res.tracks.length;
      setStatusMsg(`Synced ${res.tracks.length} / ${total} Spotify Liked Songs!`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sync Spotify Liked Songs');
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  };

  const loadCsvFile = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    try {
      const text = await file.text();
      setCsvFileName(file.name);
      setCsvText(text);
      const suggested =
        file.name
          .replace(/\.(csv|txt)$/i, '')
          .replace(/[_-]+/g, ' ')
          .trim() || 'Imported CSV Playlist';
      setCsvTitle(suggested);
    } catch {
      setErrorMsg('Could not read selected CSV file.');
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg('Parsing CSV & matching tracks on YouTube Music...');
    try {
      const res = await importPlaylistFromCsv(csvText, csvFileName || undefined, csvTitle.trim() || undefined);
      onImportedPlaylist(res.title, res.tracks, true, { source: 'spotify' });
      setCsvFileName('');
      setCsvText('');
      setCsvTitle('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CSV import failed');
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  };

  const renderAccountPicker = (connected: boolean, serviceName: string, showSyncLiked: boolean) => {
    if (!connected) {
      return (
        <div className="cw-content-card" style={{ padding: 20, textAlign: 'center' }}>
          <div className="cw-muted" style={{ marginBottom: 12 }}>
            Sign in to {serviceName} in Settings to browse, multi-select, and 1-click import your playlists.
          </div>
          <GlassButton
            variant="filled"
            tint={accentHex}
            intensity={intensity}
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
          >
            Connect {serviceName}
          </GlassButton>
        </div>
      );
    }

    const selectedItems = filteredList.filter((p) => selectedIds.has(p.id));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <GlassInput
              type="search"
              value={filterText}
              tint={accentHex}
              intensity={intensity}
              placeholder={`Filter your ${serviceName} playlists...`}
              onChange={(e) => setFilterText(e.target.value)}
              onClear={() => setFilterText('')}
            />
          </div>
          {showSyncLiked && (
            <GlassButton
              size="sm"
              variant="tinted"
              tint={accentHex}
              intensity={intensity}
              disabled={busy}
              icon={<Heart size={14} />}
              onClick={() => (tab === 2 ? handleSyncSpotifyLiked() : handleImportSingleUrl('VLLM', true))}
            >
              Sync Liked
            </GlassButton>
          )}
        </div>

        {filteredList.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="cw-offset-toggle-pill"
              onClick={toggleSelectAll}
              disabled={busy}
            >
              {selectedIds.size === filteredList.length ? <CheckSquare size={13} /> : <Square size={13} />}
              <span>
                {selectedIds.size === filteredList.length ? 'Unselect All' : `Select All (${filteredList.length})`}
              </span>
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              {selectedItems.length > 0 && (
                <GlassButton
                  size="sm"
                  variant="filled"
                  tint={accentHex}
                  intensity={intensity}
                  disabled={busy}
                  icon={busy ? <Loader2 size={13} className="cw-spin" /> : <Download size={13} />}
                  onClick={() => handleBatchImport(selectedItems)}
                >
                  Import Selected ({selectedItems.length})
                </GlassButton>
              )}
              <GlassButton
                size="sm"
                variant="glass"
                intensity={intensity}
                disabled={busy}
                onClick={() => handleBatchImport(filteredList)}
              >
                Import All ({filteredList.length})
              </GlassButton>
            </div>
          </div>
        )}

        {progress && (
          <div className="cw-import-progress">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span className="cw-ellipsis">Importing: {progress.label}</span>
              <span>
                {progress.done} / {progress.total}
              </span>
            </div>
            <div className="cw-import-bar-track">
              <div
                className="cw-import-bar-fill"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="cw-import-list">
          {loadingLists && <div className="cw-muted" style={{ padding: 12 }}>Loading your {serviceName} playlists...</div>}
          {!loadingLists && filteredList.length === 0 && (
            <div className="cw-muted" style={{ padding: 16, textAlign: 'center' }}>
              No playlists found on your {serviceName} account.
            </div>
          )}
          {filteredList.map((pl) => {
            const checked = selectedIds.has(pl.id);
            return (
              <div key={pl.id} className="cw-import-row-wrap" data-active={checked}>
                <button
                  type="button"
                  className="cw-import-select-btn"
                  disabled={busy}
                  onClick={() => toggleSelect(pl.id)}
                  aria-pressed={checked}
                >
                  <span style={{ color: checked ? 'var(--cw-accent)' : 'var(--cw-text-muted)', display: 'inline-flex', flexShrink: 0 }}>
                    {checked ? <CheckSquare size={17} /> : <Square size={17} />}
                  </span>
                  {pl.thumbnailUrl && <img className="cw-row-thumb" src={pl.thumbnailUrl} alt={pl.title} />}
                  <div className="cw-row-meta" style={{ textAlign: 'left' }}>
                    <div className="cw-track-title cw-ellipsis">{pl.title}</div>
                    <div className="cw-track-artist cw-ellipsis">{pl.subtitle}</div>
                  </div>
                </button>
                <GlassButton
                  size="sm"
                  variant="glass"
                  intensity={intensity}
                  disabled={busy}
                  onClick={() => handleBatchImport([pl])}
                >
                  Import
                </GlassButton>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="cw-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Import Playlist"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="cw-modal-dialog cw-comic-frame">
        <GlassCard intensity={intensity} padding="20px 22px" radius="22px" variant="regular">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 className="cw-h2">Import Playlists</h2>
                <div className="cw-muted" style={{ marginTop: 2 }}>
                  Paste any link, or tick playlists 1-by-1 from YouTube Music &amp; Spotify
                </div>
              </div>
              <GlassButton
                size="sm"
                variant="clear"
                intensity={intensity}
                aria-label="Close"
                disabled={busy}
                icon={<X size={16} />}
                onClick={onClose}
              />
            </div>

            <GlassSegmented
              size="sm"
              options={['Paste Link', 'YouTube Music', 'Spotify', 'CSV / Exportify']}
              value={tab}
              intensity={intensity}
              onChange={setTab}
            />

            {tab === 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleImportSingleUrl(urlInput);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <GlassInput
                  value={urlInput}
                  tint={accentHex}
                  intensity={intensity}
                  placeholder="Paste Spotify or YouTube Music playlist URL..."
                  onChange={(e) => setUrlInput(e.target.value)}
                  onClear={() => setUrlInput('')}
                />
                <div className="cw-muted" style={{ fontSize: 12 }}>
                  Supports <code>open.spotify.com/playlist/...</code>, <code>spotify.link/...</code>, and{' '}
                  <code>music.youtube.com/playlist?list=...</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <GlassButton type="button" variant="glass" intensity={intensity} onClick={onClose}>
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="filled"
                    tint={accentHex}
                    intensity={intensity}
                    disabled={busy || !urlInput.trim()}
                    icon={busy ? <Loader2 size={15} className="cw-spin" /> : <Download size={15} />}
                  >
                    {busy ? 'Importing...' : 'Import'}
                  </GlassButton>
                </div>
              </form>
            )}

            {tab === 1 && renderAccountPicker(auth.yt.connected, 'YouTube Music', true)}
            {tab === 2 && renderAccountPicker(auth.spotify.connected, 'Spotify', true)}
            {tab === 3 && (
              <form onSubmit={handleImportCsv} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    loadCsvFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <div
                  className="cw-csv-dropzone"
                  data-dragover={csvDragOver}
                  onClick={() => !busy && fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!busy) setCsvDragOver(true);
                  }}
                  onDragLeave={() => setCsvDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setCsvDragOver(false);
                    if (!busy) loadCsvFile(e.dataTransfer.files?.[0]);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !busy) {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  {csvText ? <FileSpreadsheet size={24} /> : <Upload size={24} />}
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {csvFileName ? csvFileName : 'Drop Exportify / Spotify .csv here or click to browse'}
                  </div>
                  <div className="cw-muted" style={{ fontSize: 12 }}>
                    {csvText
                      ? `~${Math.max(0, csvText.trim().split(/\r?\n/).length - 1)} lines (${Math.max(1, Math.round(csvText.length / 1024))} KB)`
                      : 'Supports Exportify, Soundiiz, TuneMyMusic, and Track Name / Artist Name(s) CSVs'}
                  </div>
                </div>

                {csvText && (
                  <GlassInput
                    value={csvTitle}
                    tint={accentHex}
                    intensity={intensity}
                    placeholder="Playlist name..."
                    onChange={(e) => setCsvTitle(e.target.value)}
                    onClear={() => setCsvTitle('')}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <GlassButton type="button" variant="glass" intensity={intensity} onClick={onClose} disabled={busy}>
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="filled"
                    tint={accentHex}
                    intensity={intensity}
                    disabled={busy || !csvText.trim()}
                    icon={busy ? <Loader2 size={15} className="cw-spin" /> : <Download size={15} />}
                  >
                    {busy ? 'Importing...' : 'Import CSV'}
                  </GlassButton>
                </div>
              </form>
            )}

            {statusMsg && <div style={{ fontSize: 13, color: 'var(--cw-accent)', fontWeight: 650 }}>{statusMsg}</div>}
            {errorMsg && <div style={{ fontSize: 13, color: '#ff5c5c' }}>{errorMsg}</div>}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
