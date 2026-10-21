
import React, { useState, useRef, useEffect } from 'react';
import { startGame, dealRound, hit, stand, scoreHand } from './blackjack.js';
import './styles.css';

const ASSETS = '/assets/';
const lessons = [
  { title: 'Every card counts.', text: 'Cards 2–10 are worth their number. Jacks, queens, and kings are worth 10. An ace is worth 1 or 11, whichever gives the best total without going over 21.', cards: [{rank:'A',suit:'spades'},{rank:'K',suit:'hearts'}], note:'11 + 10 = 21 · Blackjack' },
  { title: 'Aces are flexible.', text: 'An ace starts at 11. If your hand would go over 21, it becomes 1. Here, adding a 9 changes the ace from 11 to 1.', cards:[{rank:'A',suit:'spades'},{rank:'6',suit:'hearts'},{rank:'9',suit:'clubs'}], note:'1 + 6 + 9 = 16' },
  { title: 'Hit or stand.', text: 'Hit takes another card. Stand keeps your total and lets the dealer play. More than 21 is a bust: the hand loses immediately.', cards:[{rank:'10',suit:'spades'},{rank:'7',suit:'hearts'}], note:'17 · Keep it or take another card' },
  { title: 'Beat the dealer.', text: 'The dealer draws below 17 and stands on all 17s, including soft 17. The higher total without busting wins. Equal totals push. An initial two-card blackjack beats a three-card 21.', cards:[{rank:'A',suit:'spades'},{rank:'K',suit:'hearts'}], note:'Ready for your first hand?' }
];
function Card({card, hidden=false}) {
  if (hidden) return <div className="card back" aria-label="Face-down card">21</div>;
  const symbols = {spades:'♠',hearts:'♥',clubs:'♣',diamonds:'♦'};
  const exact = card.suit === 'spades' || card.suit === 'hearts';
  const files = card.suit === 'spades' ? ['imgSuitS1.svg','imgSuitS2.svg','imgSuitS3.svg'] : ['imgSuitH.svg','imgSuitH1.svg','imgSuitH2.svg'];
  return <div className={'card '+(['hearts','diamonds'].includes(card.suit)?'red':'')} aria-label={`${card.rank} of ${card.suit}`}>
    <span className="top-rank">{card.rank}</span>
    {exact ? <><img className="top-suit" src={ASSETS+files[0]} alt=""/><img className="bottom-suit" src={ASSETS+files[1]} alt=""/><img className="center-suit" src={ASSETS+files[2]} alt=""/></> : <><span className="top-suit">{symbols[card.suit]}</span><span className="center-suit">{symbols[card.suit]}</span><span className="bottom-suit">{symbols[card.suit]}</span></>}
    <span className="bottom-rank">{card.rank}</span>
  </div>;
}
function Tutorial({onStart,onClose}) {
  const [step,setStep] = useState(-1);
  const lesson = lessons[step];
  return <><h1>Your first hand.</h1><div className="layout"><section className="table tutorial-table" aria-label="Blackjack tutorial">
    <div className="lesson-cards">{(lesson?.cards || lessons[0].cards).map((c,i)=><Card key={i} card={c}/>)}</div>
    <div className="lesson-controls" aria-live="polite">{lesson ? <div className="lesson-copy"><h2>{lesson.title}</h2><p>{lesson.text}</p><strong>{lesson.note}</strong><div className="lesson-nav"><button disabled={step===0} onClick={()=>setStep(step-1)}>Back</button><span>{step+1} / {lessons.length}</span><button className="primary" onClick={()=>step===3?onStart():setStep(step+1)}>{step===3?'Start the game':'Next →'}</button></div></div> : <><button className="primary watch" onClick={()=>setStep(0)}>▶ Start tutorial</button><span className="pill">4 short lessons · Read at your pace</span></>}</div>
  </section><aside className="panel"><h2>Three things to know</h2><ol className="tips"><li><div><span className="number">01</span><h3>Get close to 21</h3></div><p>Without going over.</p></li><li><div><span className="number">02</span><h3>Hit or stand</h3></div><p>Take a card or keep your hand.</p></li><li><div><span className="number">03</span><h3>Beat the dealer</h3></div><p>The best hand wins. Equal totals push.</p></li></ol><button className="primary wide" onClick={onStart}>Start the game</button></aside></div><footer><span>Practice mode · No bets or saved history</span><button onClick={onClose}>Close tutorial</button></footer></>;
}
function Game({game,setGame,player,historySaved}) {

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
 return <><h1>The Green Room</h1><div className="layout"><section className="table game-table" aria-label="Practice table"><div className="hand"><span className="pill">Dealer{game.dealer.length ? ` · ${finished?d.total:scoreHand(game.dealer.slice(0,1)).total+' + ?'}`:''}</span><div className="cards">{game.dealer.map((c,i)=><Card key={c.id} card={c} hidden={!finished&&i===1}/>)}</div></div><div className="table-message" role="status">{game.phase==='ready'?'Your table is ready.':finished?messages[game.result]:'Your turn.'}</div><div className="hand"><div className="cards">{game.player.map(c=><Card key={c.id} card={c}/>)}</div><span className="pill">Your hand{game.player.length?` · ${p.total}${p.blackjack?' · Blackjack':p.bust?' · Bust':p.soft?' · Soft':''}`:''}</span></div></section><aside className="panel game-panel"><span className="eyebrow">PRACTICE HAND</span>
 
 <div style={{ marginBottom: '16px'}}>
  <span className="pill" style={{ fontSize: '15px', color: '#f2d388'}}>
    Money: ${game.money}
  </span>
</div>

 <h2>{game.phase==='ready'?'Take your seat.':'Learn as you play.'}</h2>
 <p>This practice area lets you check the game rules before the team connects betting and the final controls.</p>
 <div className="rule-list">
  <p>
    <strong>Number cards</strong>
    <span>Face value</span>
    </p>
    <p>
      <strong>J, Q, K</strong>
      <span>10 points</span>
      </p>
      <p>
        <strong>Ace</strong>
        <span>1 or 11 points</span>
        </p>
        <p>
          <strong>Dealer</strong>
          <span>Stands on all 17s</span>
          </p>
          </div>
          <div className="practice-controls">{game.phase==='ready'?
            <button className="primary wide" onClick={()=>setGame(dealRound(game))}>Deal hand</button>:finished?
            <button className="primary wide" onClick={()=>setGame(startGame(game.money))}>Start a fresh game</button>:<>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginBottom: '8px'}}>
            <button className="Wide" disabled={game.player.length !==2} onClick={() =>{}}>Double</button>
            <button className="wide" disabled={game.player.length !== 2 || game.player[0].rank !== game.player[1].rank} onClick={() => {}}>Split</button>                                </div>
            <button className="primary wide" onClick={()=>setGame(hit(game))}disabled={p.bust || p.total >=21}>Hit</button>
            <button className="wide" onClick={()=>setGame(stand(game))}disabled={p.bust}>Stand</button></>
            }</div>
            </aside>
            </div>
            <footer>
              <span>Single deck · Dealer stands on soft 17 · Practice only</span>
              </footer></>;


 return <><h1>The Green Room</h1>
 {player && <p>Welcome, {player.name}!</p>}
 <div className="layout">
  <section className="table game-table" aria-label="Practice table">
  <div className="hand">
    <span className="pill">
      Dealer{game.dealer.length ? ` · ${finished?d.total:scoreHand(game.dealer.slice(0,1)).total+' + ?'}`:''}
      </span>
      <div className="cards">
        {game.dealer.map((c,i)=><Card key={c.id} card={c} hidden={!finished&&i===1}/>)}
        </div>
        </div>
        <div className="table-message" role="status">
          {game.phase==='ready'?'Your table is ready.':finished?messages[game.result]:'Your turn.'}
          </div><div className="hand">
            <div className="cards">
              {game.player.map(c=><Card key={c.id} card={c}/>)}
              </div>
              <span className="pill">
                Your hand{game.player.length?` · ${p.total}${p.blackjack?' · Blackjack':p.bust?' · Bust':p.soft?' · Soft':''}`:''}
                </span>
                </div>
                </section>
                <aside className="panel game-panel">
                  <span className="eyebrow">PRACTICE HAND</span>
                  <h2>{game.phase==='ready'?'Take your seat.':'Learn as you play.'}</h2>
                  <p>This practice area lets you check the game rules before the team connects betting and the final controls.</p>
                  <div className="rule-list">
                    <p>
                      <strong>Number cards</strong>
                      <span>Face value</span>
                      </p>
                      <p>
                        <strong>J, Q, K</strong>
                        <span>10 points</span>
                        </p>
                        <p>
                          <strong>Ace</strong>
                          <span>1 or 11 points</span>
                          </p>
                          <p>
                            <strong>Dealer</strong>
                            <span>Stands on all 17s</span>
                            </p>
                            </div>
                            <div className="practice-controls">
                              {game.phase==='ready'?
                              <button className="primary wide" onClick={()=>setGame(dealRound(game))}>Deal hand</button>:finished?
                              <button className="primary wide" onClick={()=>setGame(startGame(game.money))}>Start a fresh game</button>:<>
                              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginBottom: '8px'}}>
                                <button className="Wide" disabled={game.player.length !==2} onClick={() =>{}}>Double</button>
                                <button className="wide" disabled={game.player.length !== 2 || game.player[0].rank !== game.player[1].rank} onClick={() => {}}>Split</button>                                </div>
                              <button className="primary wide" onClick={()=>setGame(hit(game))}disabled={p.bust || p.total >=21}>Hit</button>
                              <button className="wide" onClick={()=>setGame(stand(game))}disabled={p.bust}>Stand</button></>
                              }</div>
                              </aside>
                              </div>
                              <footer><span>Single deck · Dealer stands on soft 17 · Practice only</span></footer></>;
}

function AuthScreen({ mode, setMode, onSuccess, onBack }) {
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

  return (
    <section className="panel">
      <span className="eyebrow">WELCOME TO 21 CLUB</span>
      <h1>{mode === 'register' ? 'Create your account.' : 'Welcome back.'}</h1>
      <p>
        {mode === 'register'
          ? 'Join the club and save your player account.'
          : 'Log in to take your seat at the table.'}
      </p>

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <label>
            Username
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="Choose a username"
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

        {message && <p role="alert">{message}</p>}

        <button className="primary wide" type="submit" disabled={loading}>
          {loading
            ? 'Please wait...'
            : mode === 'register'
              ? 'Create account'
              : 'Log in'}
        </button>
      </form>

      <button
        className="wide"
        onClick={() => {
          setMessage('');
          setMode(mode === 'login' ? 'register' : 'login');
        }}
      >
        {mode === 'login'
          ? 'New player? Create an account'
          : 'Already registered? Log in'}
      </button>

      <button className="wide" onClick={onBack}>
        Back to home
      </button>
    </section>
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
 const historySaved = useRef(new Set());
 const main=useRef(null);
 useEffect(()=>{main.current?.focus();},[screen]);
//  function begin(){setGame(startGame());setScreen('game');}
function begin(){
  setAuthMode('login');
  setScreen('auth');
}
//  return <><header><a className="brand" href="#" onClick={e=>{e.preventDefault();setScreen('start');}}><img src={ASSETS+'imgSuitS.svg'} alt=""/>21 CLUB</a><nav aria-label="Main navigation"><button className={screen!=='tutorial'?'active':''} onClick={()=>setScreen(game?'game':'start')}>Play</button><button className={screen==='tutorial'?'active':''} onClick={()=>setScreen('tutorial')}>How to play</button></nav><span className="practice-tag">Practice mode</span></header><main ref={main} tabIndex="-1">{screen==='tutorial'?<Tutorial onStart={begin} onClose={()=>setScreen(game?'game':'start')}/>:screen==='game'?<Game game={game} setGame={setGame} player={player}/>:<><h1>A good hand. Better company.</h1><div className="layout"><section className="table welcome-table"><div className="cards"><Card card={lessons[0].cards[0]}/><Card card={lessons[0].cards[1]}/></div></section><aside className="panel"><span className="eyebrow">WELCOME TO 21 CLUB</span><h2>Your next hand starts here.</h2><p>Get closer to 21 than the dealer, without going over. Start a fresh game or learn the rules at your own pace.</p><button className="primary wide" onClick={begin}>Start the game</button><button className="wide" onClick={()=>{setPlayer({type:'guest',name:'Guest'});setGame(startGame());setScreen('game');}}>Continue as Guest</button><button className="wide" onClick={()=>setScreen('tutorial')}>How to play</button></aside></div></>}</main></>;


return (
  <>
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
      <a
        className="brand"
        href="#"
        onClick={e => {
          e.preventDefault();
          setScreen('start');
        }}
      >
        <img src={ASSETS + 'imgSuitS.svg'} alt="" />
        21 CLUB
      </a>
      <nav aria-label="Main navigation">
        <button
          className={screen !== 'tutorial' && screen !== 'history' ? 'active' : ''}
          onClick={() => setScreen(game ? 'game' : 'start')}
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
        {screen == 'game' && (
          <button
            onClick={() => {
              setGame(null);
              setScreen('start');
            }}
            style={{
              background: '#8a150c',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '9999px',
              cursor: 'pointer',
              fontWeight: 'bold',
              lineheight  : '1.5'
            }}
          >
            Exit Game
          </button>
        )}
      <span className="practice-tag">Practice mode</span>
      </div>
    </header>

    <main ref={main} tabIndex="-1">
      {screen === 'auth' ? (
        <div className="layout">
          <AuthScreen
            mode={authMode}
            setMode={setAuthMode}
            onSuccess={loggedInPlayer => {
              setPlayer({
                type: 'registered',
                name: loggedInPlayer.name,
                id: loggedInPlayer.id,
                email: loggedInPlayer.email
              });
              setGame(startGame());
              setScreen('game');
            }}
            onBack={() => setScreen('start')}
          />
        </div>
      ) : screen === 'tutorial' ? (
        <Tutorial
          onStart={begin}
          onClose={() => setScreen(game ? 'game' : 'start')}
        />
      ) : screen === 'game' ? (
        <Game game={game} setGame={setGame} player={player} historySaved={historySaved} />
      ) : screen === 'history' && player?.type === 'registered' ? (
        <HistoryScreen
          player={player}
          onBack={() => setScreen(game ? 'game' : 'start')}
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
                onClick={() => {
                  setPlayer({ type: 'guest', name: 'Guest' });
                  setGame(startGame());
                  setScreen('game');
                }}
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
    </main>
  </>
);


}
