import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { scoreHand } from '../blackjack.js';
import { placeBet, playAction } from '../realtime/useTables.js';
import TableFx, { DealtCard, ScorePill, dealDelay } from './TableFx.jsx';
import TableAds from './TableAds.jsx';
import './multiplayer.css';

// A multiplayer table. The server runs the round (deck, turns, dealer, payouts)
// and sends everyone the same tableState; this screen only shows it and sends
// bets and actions. Practice (solo) tables still use the local Game in App.jsx.

const CHIP_AMOUNTS = [5, 10, 25, 50, 100];
const RESULT_TEXT = { player: 'Win', dealer: 'Lose', push: 'Push' };

// Seconds left on the server's timer, counted down locally
function useSecondsLeft(tableState) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (tableState?.msLeft == null) return undefined;
    const timer = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(timer);
  }, [tableState?.msLeft, tableState?.receivedAt]);

  if (tableState?.msLeft == null) return null;
  const left = tableState.msLeft - (Date.now() - tableState.receivedAt);
  return Math.max(0, Math.ceil(left / 1000));
}

function handLabel(hand) {
  const score = scoreHand(hand.cards);
  if (hand.forfeited) return 'Left';
  if (score.blackjack && hand.cards.length === 2) return `${score.total} · Blackjack`;
  if (score.bust) return `${score.total} · Bust`;
  return `${score.total}${score.soft ? ' · Soft' : ''}`;
}

function resultLabel(hand) {
  if (!hand.result) return null;
  if (hand.forfeited) return 'Forfeit';
  if (hand.result === 'player' && scoreHand(hand.cards).blackjack) return 'Blackjack';
  return RESULT_TEXT[hand.result];
}

// What TableFx (bet chips, shuffle notice, win/lose effects) needs, for this player's seat
function fxGame(tableState, mine) {
  const hands = mine?.hands ?? [];
  const inRound = hands.length > 0;
  const phase = !inRound || tableState.phase === 'betting' ? 'ready' : tableState.phase === 'settled' ? 'finished' : 'player';
  return {
    roundId: `${tableState.tableId}-${tableState.round}`,
    phase,
    hands,
    player: hands[0]?.cards ?? [],
    dealer: phase === 'finished' ? tableState.dealer : [],
    bet: mine?.bet ?? 0,
    result: phase === 'finished' ? hands[0]?.result : null
  };
}

function statusText(tableState, mine, turnSeat, myTurn) {
  const myHands = mine?.hands ?? [];
  switch (tableState.phase) {
    case 'betting':
      if (mine?.bet) return 'Bet placed · waiting for the others';
      return 'Place your bet';
    case 'playing':
      if (myTurn) return 'Your turn';
      if (!myHands.length) return `${turnSeat?.name ?? 'A player'} is playing · you're in next hand`;
      return `${turnSeat?.name ?? 'A player'}'s turn`;
    case 'dealer':
      return "Dealer's turn";
    case 'settled': {
      if (!myHands.length) return 'Hand over';
      const results = myHands.map(resultLabel).filter(Boolean);
      return results.length ? results.join(' · ') : 'Hand over';
    }
    default:
      return '';
  }
}

function timerText(phase, seconds) {
  if (seconds == null) return null;
  if (phase === 'betting') return `Dealing in ${seconds}s`;
  if (phase === 'settled') return `Next hand in ${seconds}s`;
  if (phase === 'playing') return `${seconds}s`;
  return null;
}

// Another player's seat: small cards, name, chips, bet and result
function Seat({ seat, index, isMe, isTurn, turnHand, seconds, Card }) {
  if (!seat) {
    return (
      <div className="mp-seat is-empty">
        <div className="mp-seat-box">
          <span className="mp-seat-number">Seat {index + 1}</span>
          <span className="mp-seat-empty">Empty</span>
        </div>
      </div>
    );
  }

  const stake = seat.hands.reduce((sum, hand) => sum + hand.bet, 0) || seat.bet;

  return (
    <div className={'mp-seat' + (isTurn ? ' is-turn' : '') + (isMe ? ' is-me' : '') + (seat.away ? ' is-away' : '')}>
      {!isMe && seat.hands.length > 0 && (
        <div className="mp-seat-hands">
          {seat.hands.map((hand, h) => (
            <div key={h} className={'mp-mini-hand' + (isTurn && turnHand === h ? ' is-active' : '')}>
              <div className="mp-mini-cards">
                {hand.cards.map(c => <Card key={c.id} card={c} />)}
              </div>
              <span className="mp-mini-total">
                {handLabel(hand)}
                {resultLabel(hand) && <strong className={`mp-result mp-result-${hand.result}`}>{resultLabel(hand)}</strong>}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mp-seat-box">
        <div className="mp-seat-header">
          <span className="mp-seat-number">Seat {index + 1}</span>
          {isTurn && seconds != null && <span className={'mp-seat-timer' + (seconds <= 5 ? ' is-low' : '')}>{seconds}s</span>}
        </div>
        <div className="mp-seat-name">{isMe ? `${seat.name} (you)` : seat.name}</div>
        <div className="mp-seat-chips">
          {seat.chips.toLocaleString()} chips{stake ? ` · bet ${stake}` : ''}
        </div>
        {seat.away && <div className="mp-seat-away">Away</div>}
      </div>
    </div>
  );
}

export default function MultiplayerGame({ tableState, mySeatIndex, maxSeats = 5, toolbar, onChangeTable, Card, onRoundSettled }) {
  const reduceMotion = useReducedMotion();
  const [pick, setPick] = useState(tableState.minBet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seconds = useSecondsLeft(tableState);

  const seatsByIndex = Array.from({ length: maxSeats }, (_, i) => tableState.seats.find(s => s.index === i) ?? null);
  const mine = seatsByIndex[mySeatIndex] ?? null;
  const myHands = mine?.hands ?? [];
  const turn = tableState.turn;
  const turnSeat = turn ? seatsByIndex[turn.seat] : null;
  const myTurn = tableState.phase === 'playing' && turn?.seat === mySeatIndex;
  const activeHand = myTurn ? myHands[turn.hand] : null;
  const reveal = tableState.phase === 'dealer' || tableState.phase === 'settled';

  // Keep the chip picker inside what this player can bet
  const chips = mine?.chips ?? 0;
  const pickable = CHIP_AMOUNTS.filter(a => a >= tableState.minBet && a <= tableState.maxBet);
  useEffect(() => {
    if (pick > chips || pick < tableState.minBet) setPick(pickable.find(a => a <= chips) ?? tableState.minBet);
  }, [chips, tableState.minBet]);

  // Errors are about the last thing tried; clear them when the round moves on
  useEffect(() => setError(''), [tableState.phase, tableState.round, turn?.seat, turn?.hand]);

  // Tell the app once per hand that this seat's hands were settled (history, chips)
  const reported = useRef(null);
  useEffect(() => {
    if (tableState.phase !== 'settled' || !myHands.length) return;
    const key = `${tableState.tableId}-${tableState.round}`;
    if (reported.current === key) return;
    reported.current = key;
    onRoundSettled?.({ key, hands: myHands, dealer: tableState.dealer });
  }, [tableState.phase, tableState.round]);

  async function send(action) {
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.message || 'That did not go through.');
  }

  const timer = timerText(tableState.phase, seconds);
  const canDouble = activeHand && activeHand.cards.length === 2 && chips >= activeHand.bet;
  const canSplit = activeHand && activeHand.cards.length === 2 && activeHand.cards[0].rank === activeHand.cards[1].rank && chips >= activeHand.bet;
  const activeScore = activeHand ? scoreHand(activeHand.cards) : null;

  return (
    <>
      {toolbar}
      <div className="game-layout">
        <motion.div
          className="game-stage"
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.82 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <section className="table game-table mp-table" aria-label="Blackjack table">
            <TableFx game={fxGame(tableState, mine)} bet={tableState.phase === 'betting' ? mine?.bet || pick : 0} />

            {/* Dealer (always a bot). The hole card flips when the dealer plays. */}
            <div className="hand">
              <ScorePill>
                Dealer{tableState.dealer.length ? ` · ${reveal ? tableState.dealerTotal : `${tableState.dealerTotal} + ?`}` : ''}
              </ScorePill>
              <div className="cards">
                {tableState.dealer.map((c, i) => (
                  <DealtCard
                    key={i === 1 ? `hole-${tableState.round}` : c.id}
                    front={c.hidden ? <Card hidden /> : <Card card={c} />}
                    back={<Card hidden />}
                    hidden={Boolean(c.hidden)}
                    delay={dealDelay('dealer', i)}
                  />
                ))}
              </div>
            </div>

            <div className="table-message mp-message" role="status">
              <span>{statusText(tableState, mine, turnSeat, myTurn)}</span>
              {timer && <span className={'mp-timer' + (seconds <= 5 && tableState.phase === 'playing' ? ' is-low' : '')}>{timer}</span>}
            </div>

            {/* This player's own hand(s), full size */}
            {myHands.length > 0 && (
              <div className="mp-my-hands">
                {myHands.map((hand, h) => (
                  <div key={h} className={'hand' + (myTurn && turn.hand === h && myHands.length > 1 ? ' mp-active-hand' : '')}>
                    <div className="cards">
                      {hand.cards.map((c, i) => (
                        <DealtCard key={c.id} front={<Card card={c} />} back={<Card hidden />} delay={dealDelay('player', i)} />
                      ))}
                    </div>
                    <ScorePill>
                      {myHands.length > 1 ? `Hand ${h + 1}` : 'Your hand'} · {handLabel(hand)}
                      {resultLabel(hand) ? ` · ${resultLabel(hand)}` : ''}
                    </ScorePill>
                  </div>
                ))}
              </div>
            )}

            {/* Every seat at the table, in turn order */}
            <div className="mp-seats">
              {seatsByIndex.map((seat, i) => (
                <Seat
                  key={i}
                  seat={seat}
                  index={i}
                  isMe={i === mySeatIndex}
                  isTurn={tableState.phase === 'playing' && turn?.seat === i}
                  turnHand={turn?.hand}
                  seconds={seconds}
                  Card={Card}
                />
              ))}
            </div>

            <div className="game-controls practice-controls">
              {tableState.phase === 'betting' && mine ? (
                <>
                  <div className="controls-bet">
                    <span className="controls-label">BET</span>
                    <strong>{mine.bet ? `${mine.bet} chips placed` : `${pick} chips`}</strong>
                    <span className="controls-balance">Balance {chips.toLocaleString()}</span>
                  </div>
                  <div className="controls-chips" role="group" aria-label="Select bet">
                    {pickable.map(amount => (
                      <button
                        key={amount}
                        className={`chip-button chip-${amount}` + (pick === amount ? ' is-picked' : '')}
                        aria-pressed={pick === amount}
                        aria-label={`Bet ${amount}`}
                        onClick={() => setPick(amount)}
                        disabled={amount > chips}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                  <button
                    className="primary controls-main"
                    onClick={() => send(() => placeBet(pick))}
                    disabled={busy || pick > chips || mine.bet === pick}
                  >
                    {mine.bet ? `Change bet (${pick})` : `Bet ${pick}`}
                  </button>
                </>
              ) : myTurn ? (
                <>
                  <button disabled={busy || !canDouble} onClick={() => send(() => playAction('double'))}>Double</button>
                  <button disabled={busy || !canSplit} onClick={() => send(() => playAction('split'))}>Split</button>
                  <button className="primary controls-main" disabled={busy || activeScore.total >= 21} onClick={() => send(() => playAction('hit'))}>Hit</button>
                  <button className="primary controls-main" disabled={busy} onClick={() => send(() => playAction('stand'))}>Stand</button>
                </>
              ) : (
                <div className="result-actions">
                  <p className="mp-waiting">
                    {tableState.phase === 'settled' ? 'Next hand starts soon.' : myHands.length ? 'Waiting for your turn…' : 'Sit tight, you’ll be dealt in next hand.'}
                  </p>
                  {onChangeTable && (
                    <button className="wide" onClick={onChangeTable}>
                      Change table
                    </button>
                  )}
                </div>
              )}
              {error && <p className="mp-error" role="alert">{error}</p>}
            </div>
          </section>
        </motion.div>

        <TableAds />
      </div>
    </>
  );
}
