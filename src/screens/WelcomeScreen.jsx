import React from 'react';
import Card, { WELCOME_CARDS } from '../components/Card.jsx';

export default function WelcomeScreen({ onStart, onGuest, onTutorial }) {
  return (
    <>
      <h1>A good hand. Better company.</h1>
      <div className="layout">
        <section className="table welcome-table">
          <div className="cards">
            <Card card={WELCOME_CARDS[0]} />
            <Card card={WELCOME_CARDS[1]} />
          </div>
        </section>

        <aside className="panel">
          <span className="eyebrow">WELCOME TO 21 CLUB</span>
          <h2>Your next hand starts here.</h2>
          <p>
            Get closer to 21 than the dealer, without going over.
            Start a fresh game or learn the rules at your own pace.
          </p>

          <button className="primary wide" onClick={onStart}>
            Start the game
          </button>

          <button className="wide" onClick={onGuest}>
            Continue as Guest
          </button>

          <button className="wide" onClick={onTutorial}>
            How to play
          </button>
        </aside>
      </div>
    </>
  );
}
