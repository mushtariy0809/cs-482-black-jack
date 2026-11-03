import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { scoreHand } from '../blackjack.js';
import { play } from '../sound/SoundManager.js';
import './table.css';

// Table animations and their sounds. Only transform/opacity are animated.

const DEAL_GAP = 0.18;      // seconds between cards in the opening deal
const DEALER_DRAW_GAP = 0.45;
// Where the card shoe sits on the table artwork, as a fraction of the table size
const SHOE = { x: 0.86, y: 0.14 };

// When each card should arrive. Opening deal alternates player/dealer;
// cards drawn later (hits, dealer draws) come one after another.
export function dealDelay(hand, index) {
  if (index < 2) return (index * 2 + (hand === 'dealer' ? 1 : 0)) * DEAL_GAP;
  return hand === 'dealer' ? DEALER_DRAW_GAP + (index - 2) * DEALER_DRAW_GAP : 0;
}

// A card that flies from the shoe in an arc, lands face down, then flips up.
// front/back are the rendered card faces. hidden keeps it face down (dealer hole card).
export function DealtCard({ front, back, hidden = false, delay = 0 }) {
  const reduceMotion = useReducedMotion();
  const ref = useRef(null);
  const deal = useAnimationControls();
  const [landed, setLanded] = useState(false);
  const wasHidden = useRef(hidden);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => play('cardDeal'), delay * 1000);

    if (reduceMotion) {
      deal.start({ opacity: 1, transition: { duration: 0.2, delay } }).then(() => !cancelled && setLanded(true));
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // Measure from this card to the shoe so the flight path fits any screen size
    const card = ref.current.getBoundingClientRect();
    const table = ref.current.closest('.game-table')?.getBoundingClientRect();
    const dx = table ? table.left + table.width * SHOE.x - (card.left + card.width / 2) : 300;
    const dy = table ? table.top + table.height * SHOE.y - (card.top + card.height / 2) : -250;

    deal.set({ x: dx, y: dy, rotate: -28, scale: 0.7, opacity: 0 });
    deal
      .start({
        x: [dx, dx * 0.45, 0],
        y: [dy, dy * 0.45 - 50, 0],
        rotate: [-28, -10, 0],
        scale: [0.7, 1.06, 1],
        opacity: [0, 1, 1],
        transition: { duration: 0.55, delay, ease: 'easeOut', times: [0, 0.55, 1] }
      })
      .then(() => !cancelled && setLanded(true));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Dealer's hole card turning over
  useEffect(() => {
    if (wasHidden.current && !hidden) play('cardFlip');
    wasHidden.current = hidden;
  }, [hidden]);

  const faceDown = hidden || !landed;

  return (
    <motion.div ref={ref} className="dealt-card" initial={{ opacity: 0 }} animate={deal}>
      <motion.div
        className="dealt-flip"
        initial={{ rotateY: 180 }}
        animate={{ rotateY: faceDown ? 180 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="dealt-face">{front}</div>
        <div className="dealt-face dealt-back">{back}</div>
      </motion.div>
    </motion.div>
  );
}

// Score pill that pops whenever its text changes
export function ScorePill({ children }) {
  const text = React.Children.toArray(children).join('');
  return (
    <motion.span
      key={text}
      className="pill"
      initial={{ scale: 1.18 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 18 }}
    >
      {children}
    </motion.span>
  );
}

const CHIP_VALUES = [100, 50, 25, 10, 5];
const MAX_CHIPS = 8;

function chipsFor(amount) {
  const chips = [];
  let left = amount;
  for (const value of CHIP_VALUES) {
    while (left >= value && chips.length < MAX_CHIPS) {
      chips.push(value);
      left -= value;
    }
  }
  return chips;
}

function Chip({ value, style }) {
  return <span className={`chip chip-${value}`} style={style} aria-hidden="true" />;
}

// How long the cards take to finish moving before showing the result
function resultDelay(game) {
  const p = scoreHand(game.player);
  if (p.bust) return 0.7;
  const openingDeal = game.player.length === 2 && game.dealer.length === 2;
  if (openingDeal && (p.blackjack || scoreHand(game.dealer).blackjack)) return 1.2;
  return 0.6 + Math.max(0, game.dealer.length - 2) * DEALER_DRAW_GAP + 0.3;
}

function resultKind(game) {
  if (game.phase !== 'finished' || !game.result) return null;
  if (game.result === 'player') return scoreHand(game.player).blackjack ? 'blackjack' : 'win';
  return game.result === 'dealer' ? 'lose' : 'push';
}

function ChipShower({ count }) {
  const chips = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: 8 + Math.random() * 84,
        delay: Math.random() * 0.5,
        spin: (Math.random() - 0.5) * 720,
        value: CHIP_VALUES[i % CHIP_VALUES.length]
      })),
    [count]
  );
  return (
    <div className="chip-shower" aria-hidden="true">
      {chips.map(chip => (
        <motion.span
          key={chip.id}
          className={`chip chip-${chip.value}`}
          style={{ left: `${chip.left}%` }}
          initial={{ y: -60, rotate: 0, opacity: 0 }}
          animate={{ y: 700, rotate: chip.spin, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.6, delay: chip.delay, ease: [0.45, 0, 0.9, 0.6] }}
        />
      ))}
    </div>
  );
}

// Everything layered on top of the felt: bet chips, shuffle notice, result effects
export default function TableFx({ game, bet }) {
  const reduceMotion = useReducedMotion();
  const layer = useRef(null);
  const placed = game.phase !== 'ready';
  const stake = placed ? game.hands?.reduce((sum, hand) => sum + hand.bet, 0) || game.bet : bet;
  const kind = resultKind(game);
  const [showResult, setShowResult] = useState(null);
  const [toDealer, setToDealer] = useState({ x: 0, y: -250 });

  // Bet chips: a soft stack shuffle when the bet changes, a toss when the hand is dealt
  const firstStake = useRef(true);
  useEffect(() => {
    if (firstStake.current) {
      firstStake.current = false;
      return;
    }
    if (!placed) play('chipStack');
  }, [stake]);
  useEffect(() => {
    if (placed) play('chipPlace');
  }, [placed, game.roundId]);

  // New deck every round (README rule): shuffle sound + notice
  const [shuffling, setShuffling] = useState(false);
  useEffect(() => {
    setShuffling(true);
    play('shuffle');
    const timer = setTimeout(() => setShuffling(false), 1800);
    return () => clearTimeout(timer);
  }, [game.roundId]);

  // Result effects wait until the cards have finished moving
  useEffect(() => {
    setShowResult(null);
    if (!kind) return undefined;

    const box = layer.current?.getBoundingClientRect();
    if (box) setToDealer({ x: box.width * 0.18, y: -box.height * 0.55 });

    const timer = setTimeout(() => {
      setShowResult(kind);
      play(kind === 'push' ? 'chipStack' : kind);
    }, resultDelay(game) * 1000);
    return () => clearTimeout(timer);
  }, [kind, game.roundId]);

  const chips = chipsFor(showResult === 'win' || showResult === 'blackjack' ? stake * 2 : stake);

  return (
    <div className="table-fx" ref={layer} aria-hidden="true">
      {/* Bet chips on the betting spot */}
      <AnimatePresence>
        {stake > 0 && (
          <motion.div
            key={`${game.roundId}-${placed}`}
            className="bet-stack"
            initial={placed && !reduceMotion ? { y: 160, scale: 1.25, opacity: 0 } : { opacity: 0 }}
            animate={
              showResult === 'lose' && !reduceMotion
                ? { x: toDealer.x, y: toDealer.y, scale: 0.6, opacity: 0, transition: { duration: 0.8, ease: 'easeIn' } }
                : { x: 0, y: 0, scale: 1, opacity: 1 }
            }
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 14 }}
          >
            {chips.map((value, i) => (
              <motion.span
                key={`${stake}-${showResult}-${i}`}
                className={`chip chip-${value}`}
                style={{ bottom: i * 5 }}
                initial={reduceMotion ? false : { y: -14, rotate: (i % 2 ? 1 : -1) * 12, opacity: 0 }}
                animate={{ y: 0, rotate: 0, opacity: 1 }}
                transition={{ delay: i * 0.035, type: 'spring', stiffness: 500, damping: 20 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Deck reshuffled" next to the shoe */}
      <AnimatePresence>
        {shuffling && (
          <motion.div
            className="shuffle-notice"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="shuffle-cards">
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  className="mini-card"
                  animate={reduceMotion ? {} : { x: [0, (i - 1) * 10, 0], rotate: [0, (i - 1) * 14, 0] }}
                  transition={{ duration: 0.5, repeat: 2, delay: i * 0.05 }}
                />
              ))}
            </span>
            Deck reshuffled
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result effects */}
      <AnimatePresence>
        {showResult === 'lose' && (
          <motion.div
            key="dim"
            className="fx-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        )}
        {(showResult === 'win' || showResult === 'blackjack') && (
          <motion.div
            key="glow"
            className={'fx-glow' + (showResult === 'blackjack' ? ' is-big' : '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.45] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
          />
        )}
        {showResult === 'push' && !reduceMotion && (
          <motion.div
            key="shimmer"
            className="fx-shimmer"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeInOut' }}
          />
        )}
        {showResult === 'blackjack' && (
          <motion.div
            key="bj"
            className="fx-blackjack"
            // Pops in, holds, then floats off so the cards stay readable
            initial={{ scale: reduceMotion ? 1 : 0.4, opacity: 0 }}
            animate={{ scale: reduceMotion ? 1 : [0.4, 1.08, 1, 1.15], opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.2, times: [0, 0.18, 0.75, 1], ease: 'easeOut' }}
          >
            Blackjack!
          </motion.div>
        )}
      </AnimatePresence>
      {!reduceMotion && (showResult === 'win' || showResult === 'blackjack') && (
        <ChipShower key={game.roundId} count={showResult === 'blackjack' ? 28 : 14} />
      )}
    </div>
  );
}
