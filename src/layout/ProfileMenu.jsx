import React, { useState } from 'react';

function ProfilePicture({ player, imageClass, placeholder: Placeholder, placeholderClass }) {
  if (player.profilePicture) {
    return <img src={player.profilePicture} alt="Profile" className={imageClass} />;
  }
  return <Placeholder className={placeholderClass}>{player.name.charAt(0).toUpperCase()}</Placeholder>;
}

// Avatar button in the header with My Profile / View Friends / Log Out
export default function ProfileMenu({ player, onProfile, onFriends, onLogOut }) {
  const [open, setOpen] = useState(false);

  // Close the menu, then do what was picked
  const pick = action => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="profile-menu-container">
      <button
        className="profile-button"
        onClick={() => setOpen(!open)}
        aria-label="Open profile menu"
        aria-expanded={open}
        title="My Profile"
      >
        <ProfilePicture player={player} imageClass="header-profile-picture" placeholder="span" placeholderClass="profile-placeholder" />
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-info">
            <ProfilePicture player={player} imageClass="dropdown-profile-picture" placeholder="div" placeholderClass="dropdown-profile-placeholder" />
            <h3>{player.name}</h3>
            <p>{player.email}</p>
          </div>

          <div className="profile-dropdown-divider"></div>

          <button onClick={pick(onProfile)}>
            <span>👤</span>
            My Profile
          </button>

          <button onClick={pick(onFriends)}>
            <span>👥</span>
            View Friends
          </button>

          <button onClick={pick(onLogOut)}>
            <span>🚪</span>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
