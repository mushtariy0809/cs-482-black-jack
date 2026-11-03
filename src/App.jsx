import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { startGame, dealRound, hit, stand, doubleDown, splitHand, scoreHand } from './blackjack.js';
import Lobby from './lobby/Lobby.jsx';
import CreateTable from './lobby/CreateTable.jsx';
import TableBar from './table/TableBar.jsx';
import LeaveConfirm from './table/LeaveConfirm.jsx';
import TableFx, { DealtCard, ScorePill, dealDelay } from './table/TableFx.jsx';
import PracticeRound from './tutorial/PracticeRound.jsx';
import TableAds from './table/TableAds.jsx';
import SoundButton from './sound/SoundButton.jsx';
import { installUiSounds, preload, setMusic } from './sound/SoundManager.js';
import ConnectionPill from './realtime/ConnectionPill.jsx';
import { startTables, leaveTable, setInHand } from './realtime/useTables.js';
import './styles.css';

const ASSETS = '/assets/';

const lessons = [
  {
    title: 'Every card counts.',
    text: 'Cards 2–10 are worth their number. Jacks, queens, and kings are worth 10. An ace is worth 1 or 11, whichever gives the best total without going over 21.',
    cards: [
      { rank: 'A', suit: 'spades' },
      { rank: 'K', suit: 'hearts' },
    ],
    note: '11 + 10 = 21 · Blackjack',
  },
  {
    title: 'Aces are flexible.',
    text: 'An ace starts at 11. If your hand would go over 21, it becomes 1. Here, adding a 9 changes the ace from 11 to 1.',
    cards: [
      { rank: 'A', suit: 'spades' },
      { rank: '6', suit: 'hearts' },
      { rank: '9', suit: 'clubs' },
    ],
    note: '1 + 6 + 9 = 16',
  },
  {
    title: 'Hit or stand.',
    text: 'Hit takes another card. Stand keeps your total and lets the dealer play. More than 21 is a bust: the hand loses immediately.',
    cards: [
      { rank: '10', suit: 'spades' },
      { rank: '7', suit: 'hearts' },
    ],
    note: '17 · Keep it or take another card',
  },
  {
    title: 'Beat the dealer.',
    text: 'The dealer draws below 17 and stands on all 17s, including soft 17. The higher total without busting wins. Equal totals push. An initial two-card blackjack beats a three-card 21.',
    cards: [
      { rank: 'A', suit: 'spades' },
      { rank: 'K', suit: 'hearts' },
    ],
    note: 'Ready for your first hand?',
  },
];

function Card({ card, hidden = false }) {
  if (hidden) {
    return (
      <div className="card back" aria-label="Face-down card">
        21
      </div>
    );
  }

  const symbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  const exact = card.suit === 'spades' || card.suit === 'hearts';
  const isRed = ['hearts', 'diamonds'].includes(card.suit);

  const files =
    card.suit === 'spades'
      ? ['imgSuitS1.svg', 'imgSuitS2.svg', 'imgSuitS3.svg']
      : ['imgSuitH.svg', 'imgSuitH1.svg', 'imgSuitH2.svg'];

  return (
    <div className={'card ' + (isRed ? 'red' : '')} aria-label={`${card.rank} of ${card.suit}`}>
      <span className="top-rank">{card.rank}</span>

      {exact ? (
        <>
          <img className="top-suit" src={ASSETS + files[0]} alt="" />
          <img className="bottom-suit" src={ASSETS + files[1]} alt="" />
          <img className="center-suit" src={ASSETS + files[2]} alt="" />
        </>
      ) : (
        <>
          <span className="top-suit">{symbols[card.suit]}</span>
          <span className="center-suit">{symbols[card.suit]}</span>
          <span className="bottom-suit">{symbols[card.suit]}</span>
        </>
      )}

      <span className="bottom-rank">{card.rank}</span>
    </div>
  );
}

function Game({game,setGame,player,historySaved, bet, setBet, tableName = 'The Green Room', toolbar, onChangeTable}) {

  useEffect(() => {
    if (
      game.phase !== 'finished' ||
      player?.type !== 'registered' ||
      !player?.id
    ) {
      return;
    }

    const roundKey = game.roundId;
    console.log('Round ID:', roundKey);

    if (historySaved.current.has(roundKey)) {
      return;
    }

    historySaved.current.add(roundKey);

    const result =
      game.result === 'player'
        ? 'win'
        : game.result === 'dealer'
          ? 'loss'
          : 'push';

    fetch('http://localhost:5000/api/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        playerId: player.id,
        result,
        playerScore: scoreHand(game.player).total,
        dealerScore: scoreHand(game.dealer).total
      })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Could not save game history.');
        }
        console.log('Game history saved!');
      })
      .catch(error => {
        historySaved.current.delete(roundKey);
        console.error('History error:', error);
      });
  }, [game, player]);

 const p=scoreHand(game.player), d=scoreHand(game.dealer);
 const finished=game.phase==='finished';
 const messages={player:'You win.',dealer:'Dealer wins.',push:'Push. It’s a tie.'};
 const activeHand = game.hands?.[game.activeHandIndex];
 const reduceMotion = useReducedMotion();

 // Layout from Figma "Bet"/"Game": table with a controls bar along the bottom, ads on the right.
 // Only the table zooms in/out between screens; the ad column never moves.
 return <>
  {toolbar ?? <h1>{tableName}</h1>}
  <div className="game-layout">
   <motion.div
    className="game-stage"
    initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.94 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.82 }}
    transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
   >
    <section className="table game-table" aria-label="Blackjack table">
     <TableFx game={game} bet={bet}/>
     <div className="hand">
      <ScorePill>Dealer{game.dealer.length ? ` · ${finished?d.total:scoreHand(game.dealer.slice(0,1)).total+' + ?'}`:''}</ScorePill>
      <div className="cards">{game.dealer.map((c,i)=><DealtCard key={c.id} front={<Card card={c}/>} back={<Card hidden/>} hidden={!finished&&i===1} delay={dealDelay('dealer',i)}/>)}</div>
     </div>
     <div className="table-message" role="status">{game.phase==='ready'?'Your table is ready.':finished?messages[game.result]:'Your turn.'}</div>
     <div className="hand">
      <div className="cards">{game.player.map((c,i)=><DealtCard key={c.id} front={<Card card={c}/>} back={<Card hidden/>} delay={dealDelay('player',i)}/>)}</div>
      <ScorePill>Your hand{game.player.length?` · ${p.total}${p.blackjack?' · Blackjack':p.bust?' · Bust':p.soft?' · Soft':''}`:''}</ScorePill>
     </div>

     {/* Controls bar (practice-controls: these buttons make card/chip sounds instead of a click) */}
     <div className="game-controls practice-controls">
      {game.phase==='ready' ? (
       <>
        <div className="controls-bet">
         <span className="controls-label">BET</span>
         <strong>{bet} chips</strong>
         <span className="controls-balance">Balance {game.money.toLocaleString()}</span>
        </div>
        <div className="controls-chips" role="group" aria-label="Select bet">
         {[5,10,25,50,100].map(amount => (
          <button
           key={amount}
           className={`chip-button chip-${amount}` + (bet==amount ? ' is-picked' : '')}
           aria-pressed={bet==amount}
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
         onClick={()=>setGame(dealRound(game, bet))}
         disabled={bet > game.money || game.money <=0}
        >
         Deal ({bet})
        </button>
       </>
      ) : finished ? (
       <div className="result-actions">
        <button className="primary wide" onClick={()=>setGame(startGame(game.money))}>
         Start a fresh game
        </button>
        {onChangeTable && (
         <button className="wide" onClick={onChangeTable}>
          Change table
         </button>
        )}
       </div>
      ) : (
       <>
        <button
         disabled={game.player.length !==2 || game.money < game.bet}
         onClick={() =>{setGame(doubleDown(game))}}
        >
         Double
        </button>
        <button
         disabled={
          activeHand?.cards.length !== 2 ||
          activeHand?.cards[0].rank !== activeHand?.cards[1].rank ||
          game.money < activeHand?.bet
         }
         onClick={() => setGame(splitHand(game))}
        >
         Split
        </button>
        <button className="primary controls-main" onClick={()=>setGame(hit(game))} disabled={p.bust || p.total >=21}>
         Hit
        </button>
        <button className="primary controls-main" onClick={()=>setGame(stand(game))} disabled={p.bust}>
         Stand
        </button>
       </>
      )}
     </div>
    </section>
   </motion.div>

   <TableAds />
  </div>
  <footer>
   <span>Single deck · Dealer stands on soft 17 · Balance {game.money.toLocaleString()} chips</span>
  </footer>
 </>;
}

function AuthScreen({ mode, setMode, onSuccess, onGuest }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:5000/api/auth/${mode === 'register' ? 'register' : 'login'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            mode === 'register'
              ? { username, email, password }
              : { email, password }
          )
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong.');
      }

      onSuccess({
        type: 'registered',
        name: data.player.username,
        id: data.player.id,
        email: data.player.email
      });
    } catch (error) {
      setMessage(
        error.message === 'Failed to fetch'
          ? 'Cannot connect to the server. Make sure your backend is running.'
          : error.message
      );
    } finally {
      setLoading(false);
    }
  }

  // Layout from the Figma Login (3:659) and Sign up (3:711) frames
  return (
    <div className="auth-layout">
      <section className="auth-table" aria-hidden="true">
        <p className="auth-tagline">A good hand.<br />Better company.</p>
        <div className="auth-cards">
          <Card card={lessons[0].cards[0]} />
          <Card card={lessons[0].cards[1]} />
        </div>
      </section>

    <section className="panel auth-panel">
      <h1>{mode === 'register' ? 'Join the club.' : 'Welcome back.'}</h1>

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <label>
            Username
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="Choose your name"
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
          />
        </label>

        {message && <p className="form-error" role="alert">{message}</p>}

        <button className="primary wide" type="submit" disabled={loading}>
          {loading
            ? 'Please wait...'
            : mode === 'register'
              ? 'Create account'
              : 'Log in'}
        </button>
      </form>

      <button className="wide auth-guest" onClick={onGuest}>
        Play as guest
      </button>
      <p className="auth-note">Guest progress is saved for this session only.</p>

      <button
        className="wide auth-switch"
        onClick={() => {
          setMessage('');
          setMode(mode === 'login' ? 'register' : 'login');
        }}
      >
        {mode === 'login'
          ? 'New here? Create account'
          : 'Already a member? Log in'}
      </button>
      {mode === 'register' && (
        <p className="auth-note">Your account keeps your chips and game history.</p>
      )}
    </section>
    </div>
  );
}

// Function to display the game history for a registered player

function HistoryScreen({ player, onBack }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`http://localhost:5000/api/history/${player.id}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Could not load game history.');
        }
        return response.json();
      })
      .then(data => setHistory(data))
      .catch(() => setError('Unable to load game history.'))
      .finally(() => setLoading(false));
  }, [player.id]);

  return (
    <div className="layout">
      <section className="panel">
        <span className="eyebrow">21 CLUB</span>
        <h2>Game History</h2>
        <p>Past games for {player.name}</p>

        <button onClick={onBack}>Back to the game</button>

        {loading ? (
          <p>Loading your games...</p>
        ) : error ? (
          <p>{error}</p>
        ) : history.length === 0 ? (
          <p>No completed games yet.</p>
        ) : (
          <div className="rule-list">
            {history.map(item => (
              <div key={item._id}>
                <p>
                  <strong>
                    {item.result === 'win'
                      ? 'Win'
                      : item.result === 'loss'
                        ? 'Loss'
                        : 'Tie'}
                  </strong>
                  <span>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </p>
                <p>
                  Your score: {item.playerScore} · Dealer score: {item.dealerScore}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function App() {
 const [screen,setScreen]=useState('start');
 const [game,setGame]=useState(null);
 const [player,setPlayer]=useState(null);
 const [authMode, setAuthMode] = useState('login');
 const [bet, setBet] = useState(10);
 const historySaved = useRef(new Set());
 const main=useRef(null);
 // Table the player is seated at, and chips carried between tables
 const [table, setTable] = useState(null);
 const [chips, setChips] = useState(1000);
 useEffect(()=>{main.current?.focus();},[screen]);
 useEffect(() => {
  if (game) setChips(game.money);
 }, [game?.money]);

 // Tell the lobby when a hand is in progress (shows the table as "In game")
 const inHand = screen === 'game' && Boolean(game) && game.phase !== 'ready' && game.phase !== 'finished';
 useEffect(() => {
  if (table) setInHand(inHand);
 }, [inHand, table]);

 const [confirmLeave, setConfirmLeave] = useState(false);
 // Table to join as soon as the lobby opens (tutorial's "Practice with bots")
 const [autoJoinId, setAutoJoinId] = useState(null);
 // Button clicks/hovers everywhere; audio starts after the first click (browser rule)
 useEffect(() => {
  installUiSounds();
 }, []);

 // Lounge music in the lobby, a different loop at the table and in the tutorial round
 useEffect(() => {
  if (screen === 'game' || screen === 'tutorial') {
   preload('table');
   setMusic('table');
  } else {
   setMusic('lobby');
  }
 }, [screen]);

//  function begin(){setGame(startGame());setScreen('game');}
function begin(){
  setAuthMode('login');
  setScreen('auth');
}

// Where "Play" and the logo lead
function home() {
  setScreen(game ? 'game' : player ? 'lobby' : 'start');
}

function enterLobby(newPlayer) {
  setPlayer(newPlayer);
  startTables(newPlayer.name);
  setScreen('lobby');
}

function sitAt(joinedTable) {
  setTable(joinedTable);
  setGame(startGame(chips));
  setScreen('game');
}

// Leaving mid-hand loses the bet: it was already taken when the hand was dealt
function exitTable() {
  setConfirmLeave(false);
  leaveTable();
  setTable(null);
  setGame(null);
  setScreen('lobby');
}

// Tutorial end buttons. Not logged in yet? Log in / play as guest first.
function practiceWithBots() {
  setAutoJoinId('practice');
  if (player) setScreen('lobby');
  else begin();
}

function findTable() {
  if (player) setScreen('lobby');
  else begin();
}

// Leaving between hands is free; mid-hand asks first because the bet is lost
function requestLeave() {
  if (inHand) setConfirmLeave(true);
  else exitTable();
}

const stake = game?.hands?.reduce((sum, hand) => sum + hand.bet, 0) || game?.bet || 0;

// The game screen zooms its table itself (see Game) so its ad column never moves
const screenMotion = { initial: false, animate: { opacity: 1 }, exit: { opacity: 1, transition: { duration: 0 } } };


return (
  <>
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
      <a
        className="brand"
        href="#"
        onClick={e => {
          e.preventDefault();
          home();
        }}
      >
        <img src={ASSETS + 'imgSuitS.svg'} alt="" />
        21 CLUB
      </a>
      <nav aria-label="Main navigation">
        <button
          className={screen !== 'tutorial' && screen !== 'history' ? 'active' : ''}
          onClick={home}
        >
          Play
        </button>
        <button
          className={screen === 'tutorial' ? 'active' : ''}
          onClick={() => setScreen('tutorial')}
        >
          How to play
        </button>

        {player?.type === 'registered' && (
         <button
          className={screen === 'history' ? 'active' : ''}
          onClick={() => setScreen('history')}
         >
          History
          </button>
      )}

      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginleft: 'auto'}}>
        <ConnectionPill />
        <SoundButton compact />
      {player ? (
        <span className="chips-counter">{chips.toLocaleString()} chips</span>
      ) : (
        <span className="practice-tag">Practice mode</span>
      )}
      </div>
    </header>

    <main ref={main} tabIndex="-1">
      <AnimatePresence mode="wait">
      <motion.div key={screen} {...screenMotion}>
      {screen === 'auth' ? (
        <AuthScreen
          mode={authMode}
          setMode={setAuthMode}
          onSuccess={loggedInPlayer => {
            enterLobby({
              type: 'registered',
              name: loggedInPlayer.name,
              id: loggedInPlayer.id,
              email: loggedInPlayer.email
            });
          }}
          onGuest={() => enterLobby({ type: 'guest', name: 'Guest' })}
        />
      ) : screen === 'tutorial' ? (
        <PracticeRound Card={Card} onSkip={home} onPractice={practiceWithBots} onFindTable={findTable} />
      ) : screen === 'lobby' && player ? (
        <Lobby
          onJoined={sitAt}
          onCreate={() => setScreen('create')}
          autoJoinId={autoJoinId}
          onAutoJoinHandled={() => setAutoJoinId(null)}
        />
      ) : screen === 'create' && player ? (
        <CreateTable onCreated={result => sitAt(result.table)} onCancel={() => setScreen('lobby')} />
      ) : screen === 'game' && game ? (
        <Game
          game={game} setGame={setGame} player={player} historySaved={historySaved} bet={bet} setBet={setBet}
          tableName={table?.name}
          toolbar={table && <TableBar table={table} onLeave={requestLeave} />}
          onChangeTable={table ? exitTable : undefined}
        />
      ) : screen === 'history' && player?.type === 'registered' ? (
        <HistoryScreen
          player={player}
          onBack={home}
        />
      ) : (
        <>
          <h1>A good hand. Better company.</h1>
          <div className="layout">
            <section className="table welcome-table">
              <div className="cards">
                <Card card={lessons[0].cards[0]} />
                <Card card={lessons[0].cards[1]} />
              </div>
            </section>

            <aside className="panel">
              <span className="eyebrow">WELCOME TO 21 CLUB</span>
              <h2>Your next hand starts here.</h2>
              <p>
                Get closer to 21 than the dealer, without going over.
                Start a fresh game or learn the rules at your own pace.
              </p>

              <button className="primary wide" onClick={begin}>
                Start the game
              </button>

              <button
                className="wide"
                onClick={() => enterLobby({ type: 'guest', name: 'Guest' })}
              >
                Continue as Guest
              </button>

              <button
                className="wide"
                onClick={() => setScreen('tutorial')}
              >
                How to play
              </button>
            </aside>
          </div>
        </>
      )}
      </motion.div>
      </AnimatePresence>
    </main>

    <AnimatePresence>
      {confirmLeave && (
        <LeaveConfirm stake={stake} onConfirm={exitTable} onCancel={() => setConfirmLeave(false)} />
      )}
    </AnimatePresence>
  </>
);


}
