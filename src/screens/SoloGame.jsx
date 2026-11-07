import React, { useEffect } from 'react';
import { startGame, dealRound, hit, stand, doubleDown, splitHand, scoreHand, isPair } from '../blackjack.js';
import TableFx, { DealtCard, ScorePill, dealDelay } from '../table/TableFx.jsx';
import TableStage from '../table/TableStage.jsx';
import Card from '../components/Card.jsx';
import { saveHandToHistory } from '../history/saveHistory.js';

const CHIP_AMOUNTS = [5, 10, 25, 50, 100];
const RESULT_MESSAGES = { player: 'You win.', dealer: 'Dealer wins.', push: 'Push. It’s a tie.' };

// " · 21 · Blackjack", " · 23 · Bust", " · 17 · Soft", or "" for an empty hand
export function scoreSuffix(cards) {
  if (!cards.length) return '';
  const score = scoreHand(cards);
  const tag = score.blackjack ? ' · Blackjack' : score.bust ? ' · Bust' : score.soft ? ' · Soft' : '';
  return ` · ${score.total}${tag}`;
}

// Saves each finished solo round once for registered players
function useSaveSoloHistory(game, player, historySaved) {
  useEffect(() => {
    if (game.phase !== 'finished') return;
    saveHandToHistory({
      player,
      key: game.roundId,
      result: game.result,
      playerCards: game.player,
      dealerCards: game.dealer,
      savedKeys: historySaved.current
    });
  }, [game, player]);
}

// On a bust or 21, show the new card first and let the dealer play a moment later
function hitWithPause(game, setGame) {
  const nextGame = hit(game);
  const activeCards = nextGame.hands?.[nextGame.activeHandIndex]?.cards || nextGame.player;

  if (scoreHand(activeCards).total < 21) {
    setGame(nextGame);
    return;
  }

  // Freeze in the 'player' phase with the new card shown and the dealer untouched
  setGame({ ...nextGame, phase: 'player', dealer: game.dealer });
  setTimeout(() => setGame(nextGame), 900);
}

function DealerHand({ game, finished }) {
  const shown = finished ? scoreHand(game.dealer).total : `${scoreHand(game.dealer.slice(0, 1)).total} + ?`;

  return (
    <div className="hand">
      <ScorePill>Dealer{game.dealer.length ? ` · ${shown}` : ''}</ScorePill>
      <div className="cards">
        {game.dealer.map((c, i) => (
          <DealtCard key={c.id} front={<Card card={c} />} back={<Card hidden />} hidden={!finished && i === 1} delay={dealDelay('dealer', i)} />
        ))}
      </div>
    </div>
  );
}

function TableMessage({ game, finished, timeLeft }) {
  const playing = game.phase === 'player';
  const text = game.phase === 'ready' ? 'Your table is ready.' : finished ? RESULT_MESSAGES[game.result] : 'Your turn';

  return (
    <div className="table-message" role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
      <span>
        {text}
        {playing && ' – '}
      </span>
      {playing && (
        <span style={{ color: timeLeft <= 5 ? '#ef4444' : 'inherit', fontWeight: 'bold' }}>
          {timeLeft}s
        </span>
      )}
    </div>
  );
}

function SplitHand({ hand, index, count, isActive }) {
  return (
    <div
      className={`hand ${isActive ? 'active-hand' : ''}`}
      style={{
        border: isActive ? '2px solid var(--accent, #f59e0b)' : '2px solid transparent',
        borderRadius: '12px',
        padding: '12px',
        background: isActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
        transition: 'all 0.2s ease'
      }}
    >
      <div className="cards">
        {hand.cards.map((c, i) => (
          <DealtCard key={c.id || i} front={<Card card={c} />} back={<Card hidden />} delay={dealDelay('player', i)} />
        ))}
      </div>
      <ScorePill>
        {count > 1 ? `Hand ${index + 1} ` : 'Your hand'}
        {hand.bet ? `($${hand.bet})` : ''}
        {scoreSuffix(hand.cards)}
        {isActive ? ' ◀ Active' : ''}
      </ScorePill>
    </div>
  );
}

function PlayerHands({ game }) {
  const hands = game.hands ?? [];

  return (
    <div className="player-hand-container" style={{ display: 'flex', gap: '24px', justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {hands.length > 0 ? (
        hands.map((hand, index) => (
          <SplitHand
            key={index}
            hand={hand}
            index={index}
            count={hands.length}
            isActive={game.phase === 'player' && game.activeHandIndex === index}
          />
        ))
      ) : (
        <div className="hand">
          <div className="cards">
            {game.player.map((c, i) => (
              <DealtCard key={c.id} front={<Card card={c} />} back={<Card hidden />} delay={dealDelay('player', i)} />
            ))}
          </div>
          <ScorePill>Your hand{scoreSuffix(game.player)}</ScorePill>
        </div>
      )}
    </div>
  );
}

function BetControls({ game, setGame, bet, setBet }) {
  return (
    <>
      <div className="controls-bet">
        <span className="controls-label">BET</span>
        <strong>{bet} chips</strong>
        <span className="controls-balance">Balance {game.money.toLocaleString()}</span>
      </div>
      <div className="controls-chips" role="group" aria-label="Select bet">
        {CHIP_AMOUNTS.map(amount => (
          <button
            key={amount}
            className={`chip-button chip-${amount}` + (bet === amount ? ' is-picked' : '')}
            aria-pressed={bet === amount}
            aria-label={`Bet ${amount}`}
            onClick={() => setBet(amount)}
            disabled={amount > game.money}
          >
            {amount}
          </button>
        ))}
      </div>
      <button
        className="primary controls-main"
        onClick={() => setGame(dealRound(game, bet))}
        disabled={bet > game.money || game.money <= 0}
      >
        Deal ({bet})
      </button>
    </>
  );
}

function ResultActions({ game, setGame, onChangeTable }) {
  return (
    <div className="result-actions">
      <button className="primary wide" onClick={() => setGame(startGame(game.money))}>
        Start a fresh game
      </button>
      {onChangeTable && (
        <button className="wide" onClick={onChangeTable}>
          Change table
        </button>
      )}
    </div>
  );
}

function PlayControls({ game, setGame }) {
  const activeHand = game.hands?.[game.activeHandIndex];
  const score = scoreHand(game.player);
  const canSplit = Boolean(activeHand) && isPair(activeHand.cards) && game.money >= activeHand.bet;

  return (
    <>
      <button disabled={game.player.length !== 2 || game.money < game.bet} onClick={() => setGame(doubleDown(game))}>
        Double
      </button>
      <button disabled={!canSplit} onClick={() => setGame(splitHand(game))}>
        Split
      </button>
      <button className="primary controls-main" onClick={() => hitWithPause(game, setGame)} disabled={score.bust || score.total >= 21}>
        Hit
      </button>
      <button className="primary controls-main" onClick={() => setGame(stand(game))} disabled={score.bust}>
        Stand
      </button>
    </>
  );
}

// Controls bar (practice-controls: these buttons make card/chip sounds instead of a click)
function GameControls(props) {
  const { game } = props;
  let controls;
  if (game.phase === 'ready') controls = <BetControls {...props} />;
  else if (game.phase === 'finished') controls = <ResultActions {...props} />;
  else controls = <PlayControls {...props} />;

  return <div className="game-controls practice-controls">{controls}</div>;
}

// Solo / practice table played in the browser (src/blackjack.js).
// Table with a controls bar along the bottom (see TableStage for the layout).
export default function SoloGame({ game, setGame, player, historySaved, bet, setBet, timeLeft, tableName = 'The Green Room', toolbar, onChangeTable }) {
  useSaveSoloHistory(game, player, historySaved);
  const finished = game.phase === 'finished';

  return (
    <>
      {toolbar ?? <h1>{tableName}</h1>}
      <TableStage>
            <TableFx game={game} bet={bet} />
            <DealerHand game={game} finished={finished} />
            <TableMessage game={game} finished={finished} timeLeft={timeLeft} />
            <PlayerHands game={game} />
            <GameControls game={game} setGame={setGame} bet={bet} setBet={setBet} onChangeTable={onChangeTable} />
      </TableStage>
      <footer>
        <span>Single deck · Dealer stands on soft 17 · Balance {game.money.toLocaleString()} chips</span>
      </footer>
    </>
  );
}
