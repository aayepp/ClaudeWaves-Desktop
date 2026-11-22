import React, { useRef, useState } from 'react';
import { GlassButton, GlassInput, GlassSheet } from '@zakisheriff/liquid-glass';
import { Camera, Trash2, User } from 'lucide-react';
import { resizeProfileImage } from '../api/extras';

interface ProfileModalProps {
  open: boolean;
  name: string;
  avatar: string | null;
  accentHex: string;
  intensity: number;
  onClose: () => void;
  onSave: (name: string, avatar: string | null) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  name,
  avatar,
  accentHex,
  intensity,
  onClose,
  onSave,
}) => {
  const [draftName, setDraftName] = useState(name);
  const [draftAvatar, setDraftAvatar] = useState<string | null>(avatar);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraftName(name);
      setDraftAvatar(avatar);
      setErr(null);
    }
  }, [open, name, avatar]);

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const dataUrl = await resizeProfileImage(file);
      setDraftAvatar(dataUrl);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to load image');
    }
  };

  return (
    <GlassSheet open={open} onClose={onClose} intensity={intensity} aria-label="Edit Profile">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draftName.trim(), draftAvatar);
          onClose();
        }}
        style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}
      >
        <h2 className="cw-h2">Your Profile</h2>

        <div className="cw-profile-upload-wrap" onClick={() => fileRef.current?.click()}>
          {draftAvatar ? (
            <img className="cw-profile-avatar-lg" src={draftAvatar} alt="Profile" />
          ) : (
            <div className="cw-profile-avatar-lg cw-profile-avatar-empty">
              <User size={34} />
            </div>
          )}
          <span className="cw-profile-cam-badge">
            <Camera size={14} />
          </span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFilePick}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <GlassButton
            type="button"
            size="sm"
            variant="glass"
            intensity={intensity}
            icon={<Camera size={14} />}
            onClick={() => fileRef.current?.click()}
          >
            Upload Photo
          </GlassButton>
          {draftAvatar && (
            <GlassButton
              type="button"
              size="sm"
              variant="clear"
              destructive
              intensity={intensity}
              icon={<Trash2 size={14} />}
              onClick={() => setDraftAvatar(null)}
            >
              Remove
            </GlassButton>
          )}
        </div>

        <div style={{ width: '100%' }}>
          <GlassInput
            value={draftName}
            tint={accentHex}
            intensity={intensity}
            placeholder="Your display name..."
            onChange={(e) => setDraftName(e.target.value)}
            onClear={() => setDraftName('')}
          />
        </div>

        {err && <div style={{ color: '#ff5c5c', fontSize: 12.5 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <GlassButton type="button" variant="glass" intensity={intensity} onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton type="submit" variant="filled" tint={accentHex} intensity={intensity}>
            Save Profile
          </GlassButton>
        </div>
      </form>
    </GlassSheet>
  );
};
