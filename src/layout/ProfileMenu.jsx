import React, { useState } from 'react';

function ProfilePicture({ player, imageClass, placeholder: Placeholder, placeholderClass }) {
  if (player.profilePicture) {
    return <img src={player.profilePicture} alt="Profile" className={imageClass} />;
  }
  return <Placeholder className={placeholderClass}>{player.name.charAt(0).toUpperCase()}</Placeholder>;
}

// Avatar button in the header with My Profile / View Friends / Log Out
export default function ProfileMenu({
  player, notificationCount = 0, friendRequestCount = 0,
  onProfile, onFriends, onLogOut
}) {
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
        aria-label={notificationCount > 0
          ? `Open profile menu, ${notificationCount} ${notificationCount === 1 ? 'notification' : 'notifications'}`
          : 'Open profile menu'}
        aria-expanded={open}
        title="My Profile"
      >
        <ProfilePicture player={player} imageClass="header-profile-picture" placeholder="span" placeholderClass="profile-placeholder" />
        {notificationCount > 0 && (
          <span className="profile-notification-badge" aria-hidden="true">
            {notificationCount > 99 ? '99+' : notificationCount}
          </span>
        )}
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-info">
            <ProfilePicture player={player} imageClass="dropdown-profile-picture" placeholder="div" placeholderClass="dropdown-profile-placeholder" />
            <h3>{player.name}</h3>
            <p>{player.email}</p>
            {player.role === 'admin' && <p>Administrator</p>}
          </div>

          <div className="profile-dropdown-divider"></div>

          <button onClick={pick(onProfile)}>
            <span className="profile-menu-icon">👤</span>
            <span className="profile-menu-label">My Profile</span>
          </button>

          <button
            aria-label={notificationCount > 0
              ? `View Friends, ${notificationCount} notifications, including ${friendRequestCount} friend requests`
              : 'View Friends'}
            onClick={pick(onFriends)}
          >
            <span className="profile-menu-icon">👥</span>
            <span className="profile-menu-label">View Friends</span>
            {notificationCount > 0 && (
              <span className="profile-menu-count">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>

          <button onClick={pick(onLogOut)}>
            <span className="profile-menu-icon">🚪</span>
            <span className="profile-menu-label">Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
