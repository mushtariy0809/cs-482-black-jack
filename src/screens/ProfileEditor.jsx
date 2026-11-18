import React, { useState } from 'react';
import { ASSETS } from '../components/Card.jsx';

export default function ProfileEditor({ player, onSave, onCancel }) {
  const [username, setUsername] = useState(player.name);
  const [profilePicture, setProfilePicture] = useState(
    player.profilePicture || ''
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const avatars = [
    'avatar1.jpg',
    'avatar2.jpg',
    'avatar3.jpg',
    'avatar4.jpg',
    'avatar5.jpg',
    'avatar6.jpg'
  ];

  function handleImageUpload(event) {
    const file = event.target.files[0];

    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        setError('Choose an image smaller than 4 MB.');
        return;
      }

      setError('');
      const reader = new FileReader();

      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setProfilePicture(reader.result);
        } else {
          setError('Unable to read selected image.');
        }
      };
      reader.onerror = () => setError('Unable to read selected image.');

      reader.readAsDataURL(file);
    }
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await onSave({ name: username, profilePicture });
    } catch (saveError) {
      setError(saveError.message || 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-editor">
      <h2>My Profile</h2>

      <label>
        Username
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>

      <p>Choose a profile picture</p>

      <div className="avatar-options">
        {avatars.map((avatar) => (
          <button
            key={avatar}
            type="button"
            onClick={() => setProfilePicture(`${ASSETS}${avatar}`)}
          >
            <img src={`${ASSETS}${avatar}`} alt="Avatar option" />
          </button>
        ))}
      </div>

      <label>
        Or upload a picture from your computer
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
        />
      </label>

      {profilePicture && (
        <div className="profile-preview">
          <p>Preview</p>
          <img src={profilePicture} alt="Profile preview" />
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="profile-editor-actions">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
