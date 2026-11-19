import React from 'react';
import { ASSETS } from '../components/Card.jsx';
import ConnectionPill from '../realtime/ConnectionPill.jsx';
import SoundButton from '../sound/SoundButton.jsx';
import ProfileMenu from './ProfileMenu.jsx';
import '../feedback/feedback.css';

// Logo, main navigation, profile menu, connection/sound controls and the chip count.
// adButton: the "Watch ad for chips" button (U21), shown next to the chip count.
export default function AppHeader({
  screen, player, chips, onHome, onNavigate, onLogOut,
  notificationCount = 0, friendRequestCount = 0, onFeedback, adButton = null
}) {
  const registered = player?.type === 'registered';

  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <a
        className="brand"
        href="#"
        onClick={e => {
          e.preventDefault();
          onHome();
        }}
      >
        <img src={ASSETS + 'imgSuitS.svg'} alt="" />
        21 CLUB
      </a>

      <nav aria-label="Main navigation">
        <button className={screen !== 'tutorial' && screen !== 'history' ? 'active' : ''} onClick={onHome}>
          Play
        </button>
        <button className={screen === 'tutorial' ? 'active' : ''} onClick={() => onNavigate('tutorial')}>
          How to play
        </button>

        {registered && (
          <button className={screen === 'history' ? 'active' : ''} onClick={() => onNavigate('history')}>
            History
          </button>
        )}

        {registered && (
          <ProfileMenu
            player={player}
            notificationCount={notificationCount}
            friendRequestCount={friendRequestCount}
            onProfile={() => onNavigate('profile')}
            onFriends={() => onNavigate('friends')}
            onLogOut={onLogOut}
          />
        )}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
        <ConnectionPill />
        <SoundButton compact />
        {registered && player.role !== 'admin' && (
          <button
            className="feedback-support-button"
            type="button"
            onClick={onFeedback}
            aria-label="Send feedback"
            title="Send feedback"
          >
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <g transform="translate(-4 0)">
                <path d="M5 58v-5c0-8 6-14 14-14h6c2 5.5 6.5 9 12.5 9h3c6 0 9.5 4.5 9.5 10v0" />
                <path d="M18 22h26v7c0 8-5 13-13 13s-13-5-13-13v-7Z" fill="#0b251b" />
                <path d="M14 23v-5c0-8 7-13.5 17.5-13.5S49 10 49 18v5" />
                <rect x="10" y="18" width="7" height="13" rx="3.5" />
                <rect x="45" y="18" width="7" height="13" rx="3.5" />
                <circle cx="25" cy="28" r="2" fill="currentColor" stroke="none" />
                <circle cx="35" cy="28" r="2" fill="currentColor" stroke="none" />
                <circle cx="30" cy="34" r="1.2" fill="currentColor" stroke="none" />
                <path d="M13 29v4c0 4 3 7 7 7h5" />
                <circle cx="25" cy="40" r="1.7" fill="currentColor" stroke="none" />
              </g>
              <circle cx="49" cy="47" r="12" fill="#0b251b" strokeWidth="3" />
              <path d="M49 40v7" strokeWidth="3.5" />
              <circle cx="49" cy="52" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}
        {player && adButton}
        {player ? (
          <span className="chips-counter">{chips.toLocaleString()} chips</span>
        ) : (
          <span className="practice-tag">Practice mode</span>
        )}
      </div>
    </header>
  );
}
