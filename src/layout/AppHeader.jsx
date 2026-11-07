import React from 'react';
import { ASSETS } from '../components/Card.jsx';
import ConnectionPill from '../realtime/ConnectionPill.jsx';
import SoundButton from '../sound/SoundButton.jsx';
import ProfileMenu from './ProfileMenu.jsx';

// Logo, main navigation, profile menu, connection/sound controls and the chip count
export default function AppHeader({ screen, player, chips, onHome, onNavigate, onLogOut }) {
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
            onProfile={() => onNavigate('profile')}
            onFriends={() => onNavigate('friends')}
            onLogOut={onLogOut}
          />
        )}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
        <ConnectionPill />
        <SoundButton compact />
        {player ? (
          <span className="chips-counter">{chips.toLocaleString()} chips</span>
        ) : (
          <span className="practice-tag">Practice mode</span>
        )}
      </div>
    </header>
  );
}
