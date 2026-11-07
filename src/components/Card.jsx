import React from 'react';

export const ASSETS = '/assets/';

// Ace + king shown on the welcome and login screens
export const WELCOME_CARDS = [
  { rank: 'A', suit: 'spades' },
  { rank: 'K', suit: 'hearts' },
];

const SYMBOLS = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };

// Spades and hearts use the Figma suit artwork; clubs and diamonds use text symbols
const SUIT_ART = {
  spades: ['imgSuitS1.svg', 'imgSuitS2.svg', 'imgSuitS3.svg'],
  hearts: ['imgSuitH.svg', 'imgSuitH1.svg', 'imgSuitH2.svg'],
};

function SuitMarks({ suit }) {
  const art = SUIT_ART[suit];

  if (art) {
    return (
      <>
        <img className="top-suit" src={ASSETS + art[0]} alt="" />
        <img className="bottom-suit" src={ASSETS + art[1]} alt="" />
        <img className="center-suit" src={ASSETS + art[2]} alt="" />
      </>
    );
  }

  return (
    <>
      <span className="top-suit">{SYMBOLS[suit]}</span>
      <span className="center-suit">{SYMBOLS[suit]}</span>
      <span className="bottom-suit">{SYMBOLS[suit]}</span>
    </>
  );
}

export default function Card({ card, hidden = false }) {
  if (hidden) {
    return (
      <div className="card back" aria-label="Face-down card">
        21
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className={'card ' + (isRed ? 'red' : '')} aria-label={`${card.rank} of ${card.suit}`}>
      <span className="top-rank">{card.rank}</span>
      <SuitMarks suit={card.suit} />
      <span className="bottom-rank">{card.rank}</span>
    </div>
  );
}
