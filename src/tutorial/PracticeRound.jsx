import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { dealRound, hit, stand, scoreHand } from '../blackjack.js';
import TableFx, { DealtCard, ScorePill, dealDelay } from '../table/TableFx.jsx';
import { startTutorialGame } from './riggedDeck.js';
import './tutorial.css';

// Figma "Tutorial" (3:586). A guided, scripted hand vs. the dealer instead of a video.
// The coach highlights one control at a time and only that control works.
// It uses a private practice game: the player's real chips never change.

const CHIPS = [5, 10, 25];

// Steps, in order. "target" is the one control that's allowed.
const STEPS = {
  intro: { target: 'start' },
  chip: { target: 'chip', coach: 'Every hand starts with a bet. Pick a chip — these are practice chips.' },
  place: { target: 'place', coach: 'Good. Now press Place bet to deal the cards.' },
  dealing: { target: null, coach: 'You and the dealer each get two cards. One of the dealer’s stays face down.' },
  hit: { target: 'hit', coach: 'You have 12 and the dealer shows 10. 12 is far from 21, so take another card: press Hit.' },
  hitting: { target: null, coach: 'Here comes your card…' },
  stand: { target: 'stand', coach: '19! That’s close to 21 without going over. Keep it: press Stand.' },
  dealer: { target: null, coach: 'Now the dealer flips the hidden card. Below 17, the dealer must draw.' },
  result: { target: 'continue', coach: 'The dealer stops at 18. Your 19 is higher, so you win the hand!' },
  done: { target: 'finish' }
};

// Which of the panel's three tips each step has completed
function tipsDone(step) {
  const order = Object.keys(STEPS);
  const at = order.indexOf(step);
  return [at >= order.indexOf('stand'), at >= order.indexOf('dealer'), at >= order.indexOf('result')];
}

const TIPS = [
  { title: 'Get close to 21', text: 'Without going over.' },
  { title: 'Hit or stand', text: 'Take a card or keep your hand.' },
  { title: 'Beat the dealer', text: 'Your chips update after each hand.' }
];

// Card: the app's card component (passed in so the tutorial looks exactly like the table)
export default function PracticeRound({ Card, onSkip, onPractice, onFindTable }) {
  const [step, setStep] = useState('intro');
  const [game, setGame] = useState(null);
  const [bet, setBet] = useState(0);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Move on by itself once the animations for this step have finished
  function after(seconds, next) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStep(next), seconds * 1000);
  }

  const target = STEPS[step].target;
  const allowed = name => target === name;
  const done = tipsDone(step);
  const current = done.indexOf(false);
  const coach = STEPS[step].coach;

  function start() {
    setGame(startTutorialGame());
    setStep('chip');
  }

  function pickChip(value) {
    setBet(value);
    setStep('place');
  }

  function placeBet() {
    setGame(dealRound(game, bet));
    setStep('dealing');
    after(1.5, 'hit');
  }

  function takeCard() {
    setGame(hit(game));
    setStep('hitting');
    after(0.9, 'stand');
  }

  function keepHand() {
    setGame(stand(game));
    setStep('dealer');
    after(2.2, 'result');
  }

  const finished = game?.phase === 'finished';
  const p = game ? scoreHand(game.player) : null;
  // The dealer's total stays a mystery until the dealer's cards have finished landing
  const revealDealer = finished && (step === 'result' || step === 'done');
  let dealerShown = '';
  if (game?.dealer.length) {
    dealerShown = revealDealer ? scoreHand(game.dealer).total : `${scoreHand(game.dealer.slice(0, 1)).total} + ?`;
  }

  return (
    <>
      <h1>Your first hand.</h1>
      <div className="layout">
        <section className="table game-table tutorial-round" aria-label="Practice round">
          {game && <TableFx game={game} bet={bet} />}

          {!game ? (
            <div className="tutorial-intro">
              <div className="cards">
                <Card card={{ rank: 'A', suit: 'spades' }} />
                <Card card={{ rank: 'K', suit: 'hearts' }} />
              </div>
              <button className="primary watch coach-target" onClick={start}>▶ Play a practice round</button>
              <span className="pill">One guided hand · No chips at stake</span>
            </div>
          ) : (
            <>
              <div className="hand">
                <ScorePill>Dealer{dealerShown !== '' ? ` · ${dealerShown}` : ''}</ScorePill>
                <div className="cards">
                  {game.dealer.map((c, i) => (
                    <DealtCard key={c.id} front={<Card card={c} />} back={<Card hidden />} hidden={!finished && i === 1} delay={dealDelay('dealer', i)} />
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {coach && (
                  <motion.p
                    key={step}
                    className="coach-bubble"
                    role="status"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <span className="coach-label">Coach</span>
                    {coach}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="hand">
                <div className="cards">
                  {game.player.map((c, i) => (
                    <DealtCard key={c.id} front={<Card card={c} />} back={<Card hidden />} delay={dealDelay('player', i)} />
                  ))}
                </div>
                {game.player.length > 0 && <ScorePill>Your hand · {p.total}</ScorePill>}
              </div>

              {/* Chips and cards make their own sounds, so no generic click here */}
              <div className="coach-controls" data-sound="none">
                {step === 'chip' || step === 'place' ? (
                  <>
                    <div className={'coach-chips' + (allowed('chip') ? ' coach-target' : '')} role="group" aria-label="Choose a bet">
                      {CHIPS.map(value => (
                        <button
                          key={value}
                          className={`chip-button chip-${value}` + (bet === value ? ' is-picked' : '')}
                          disabled={!allowed('chip')}
                          onClick={() => pickChip(value)}
                          aria-label={`Bet ${value}`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                    <button className={'primary' + (allowed('place') ? ' coach-target' : '')} disabled={!allowed('place')} onClick={placeBet}>
                      Place bet{bet ? ` (${bet})` : ''}
                    </button>
                  </>
                ) : step === 'result' ? (
                  <button className="primary coach-target" onClick={() => setStep('done')}>Continue →</button>
                ) : step !== 'done' ? (
                  <>
                    <button className={'primary' + (allowed('hit') ? ' coach-target' : '')} disabled={!allowed('hit')} onClick={takeCard}>Hit</button>
                    <button className={allowed('stand') ? 'primary coach-target' : ''} disabled={!allowed('stand')} onClick={keepHand}>Stand</button>
                  </>
                ) : null}
              </div>
            </>
          )}

          <AnimatePresence>
            {step === 'done' && (
              <motion.div
                className="tutorial-done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                <motion.div
                  className="tutorial-done-card"
                  initial={{ scale: 0.92, y: 16 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <h2>You’re ready.</h2>
                  <p>You know the moves. Try a few hands against the bot dealer, or find a table with people.</p>
                  <div className="tutorial-done-actions">
                    <button className="primary" onClick={onPractice}>Practice with bots</button>
                    <button onClick={onFindTable}>Find a table</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="panel tutorial-panel">
          <h2>Three things to know</h2>
          <ol className="tips">
            {TIPS.map((tip, i) => (
              <li key={tip.title} className={done[i] ? 'is-done' : i === current && game ? 'is-current' : ''}>
                <div>
                  <motion.span
                    className="number"
                    animate={done[i] ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {done[i] ? '✓' : `0${i + 1}`}
                  </motion.span>
                  <h3>{tip.title}</h3>
                </div>
                <p>{tip.text}</p>
              </li>
            ))}
          </ol>
          <button className="primary wide" disabled={step !== 'done'} onClick={onPractice}>Practice with bots</button>
        </aside>
      </div>
      <footer>
        <span>Practice round · No chips are won or lost</span>
        <button onClick={onSkip}>Skip tutorial</button>
      </footer>
    </>
  );
}
