import React, { useState, useRef, useEffect } from 'react';
import { startGame, dealRound, hit, stand, doubleDown, splitHand, scoreHand } from './blackjack.js';
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

function Tutorial({ onStart, onClose }) {
  const [step, setStep] = useState(-1);
  const lesson = lessons[step];

  return (
    <>
      <h1>Your first hand.</h1>

      <div className="layout">
        <section className="table tutorial-table" aria-label="Blackjack tutorial">
          <div className="lesson-cards">
            {(lesson?.cards || lessons[0].cards).map((c, i) => (
              <Card key={i} card={c} />
            ))}
          </div>

          <div className="lesson-controls" aria-live="polite">
            {lesson ? (
              <div className="lesson-copy">
                <h2>{lesson.title}</h2>
                <p>{lesson.text}</p>
                <strong>{lesson.note}</strong>

                <div className="lesson-nav">
                  <button disabled={step === 0} onClick={() => setStep(step - 1)}>
                    Back
                  </button>

                  <span>
                    {step + 1} / {lessons.length}
                  </span>

                  <button
                    className="primary"
                    onClick={() => (step === 3 ? onStart() : setStep(step + 1))}
                  >
                    {step === 3 ? 'Start the game' : 'Next →'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button className="primary watch" onClick={() => setStep(0)}>
                  ▶ Start tutorial
                </button>
                <span className="pill">4 short lessons · Read at your pace</span>
              </>
            )}
          </div>
        </section>

        <aside className="panel">
          <h2>Three things to know</h2>

          <ol className="tips">
            <li>
              <div>
                <span className="number">01</span>
                <h3>Get close to 21</h3>
              </div>
              <p>Without going over.</p>
            </li>
            <li>
              <div>
                <span className="number">02</span>
                <h3>Hit or stand</h3>
              </div>
              <p>Take a card or keep your hand.</p>
            </li>
            <li>
              <div>
                <span className="number">03</span>
                <h3>Beat the dealer</h3>
              </div>
              <p>The best hand wins. Equal totals push.</p>
            </li>
          </ol>

          <button className="primary wide" onClick={onStart}>
            Start the game
          </button>
        </aside>
      </div>

      <footer>
        <span>Practice mode · No bets or saved history</span>
        <button onClick={onClose}>Close tutorial</button>
      </footer>
    </>
  );
}




function Game({game,setGame,player,historySaved, bet, setBet}) {

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
          <div className="practice-controls">
            {game.phase==='ready'? (
              <>
            <div style={{ marginButton: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', width: '100%', marginBottom: '4px'}}>Select Bet:</span>
              {[5,10,25,50,100].map((amount) => ( 
                <button 
                key={amount} 
                className={bet==amount ? 'primary' : ''}
                style={{ padding: '4px 10px', fontSize: '12px', flex: '1'}}
                onClick={() => setBet(amount)}
                disabled={amount > game.money}
                >
                ${amount}
                </button>
              ))}
            </div>
            
            <button className="primary wide" 
            onClick={()=>setGame(dealRound(game, bet))}
            disabled={bet > game.money || game.money <=0}
            >
              Deal hand (${bet})
              </button>
              </>
            ) : finished ? (
            <button 
            className="primary wide" 
            onClick={()=>setGame(startGame(game.money))}
            >
              Start a fresh game
              </button>
            ) : (
              <>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginBottom: '8px'}}>
            <button 
            className="Wide"
            disabled={game.player.length !==2 || game.money < game.bet}
            onClick={() =>{setGame(doubleDown(game))}}
            >
              Double
              </button>
            <button 
            className="wide" 
            disabled={
              game.hands?.[game.activeHandIndex]?.cards.length !== 2 ||
              game.hands?.[game.activeHandIndex]?.cards[0].rank !== game.hands?.[game.activeHandIndex]?.cards[1].rank || 
              game.money < game.hands?.[game.activeHandIndex]?.bet
            }
            onClick={() => setGame(splitHand(game))}
            >
              Split
              </button>                                
              </div>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginBottom: '8px'}}>
            <button 
            className="primary" 
            onClick={()=>setGame(hit(game))}
            disabled={p.bust || p.total >=21}
            >
              Hit
              </button>
            <button 
            className="primary"
            onClick={()=>setGame(stand(game))}
            disabled={p.bust}
            >
              Stand
              </button>
              </div>
              </>
            )}
            </div>

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

        <h2>Game History</h2>
        <p>Past games for {player.name}</p>

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

function FriendsScreen({ player, onBack }) {
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const sendFriendRequest = async (receiverId) => {
    try {
      const response = await fetch('http://localhost:5000/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          senderId: player.id,
          receiverId: receiverId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || 'Unable to send friend request.');
        return;
      }

      alert('Friend request sent successfully!');

    } catch (error) {
      console.error('Friend request error:', error);
      alert('Something went wrong. Please try again.');
    }
  };

  const acceptFriendRequest = async (requesterId) => {
    try {
      const response = await fetch('http://localhost:5000/api/friends/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerId: player.id,
          requesterId: requesterId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || 'Unable to accept friend request.');
        return;
      }

      alert('Friend request accepted!');

      // Refresh friends and requests
      const updatedResponse = await fetch(
        `http://localhost:5000/api/friends/${player.id}`
      );

      const updatedData = await updatedResponse.json();

      setFriends(updatedData.friends);
      setFriendRequests(updatedData.friendRequests);

    } catch (error) {
      console.error('Accept friend request error:', error);
      alert('Something went wrong. Please try again.');
    }
  };

  const declineFriendRequest = async (requesterId) => {
    try {
      const response = await fetch('http://localhost:5000/api/friends/decline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerId: player.id,
          requesterId: requesterId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || 'Unable to decline friend request.');
        return;
      }

      alert('Friend request declined.');

      const updatedResponse = await fetch(
        `http://localhost:5000/api/friends/${player.id}`
      );

      const updatedData = await updatedResponse.json();

      setFriends(updatedData.friends);
      setFriendRequests(updatedData.friendRequests);

    } catch (error) {
      console.error('Decline friend request error:', error);
      alert('Something went wrong. Please try again.');
    }
  };

  const removeFriend = async (friendId) => {
    try {
      const response = await fetch('http://localhost:5000/api/friends/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          friendId: friendId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || 'Unable to remove friend.');
        return;
      }

      alert('Friend removed successfully!');

      const updatedResponse = await fetch(
        `http://localhost:5000/api/friends/${player.id}`
      );

      const updatedData = await updatedResponse.json();

      setFriends(updatedData.friends);
      setFriendRequests(updatedData.friendRequests);
    } catch (error) {
      console.error('Remove friend error:', error);
      alert('Something went wrong. Please try again.');
    }
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`http://localhost:5000/api/friends/${player.id}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Could not load friends.');
        }
        return response.json();
      })
      .then(data => {
        setFriends(data.friends);
        setFriendRequests(data.friendRequests);
      })
      .catch(() => {
        setError('Unable to load your friends.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [player.id]);
  
  useEffect(() => {
    const username = searchTerm.trim();

    if (!username) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);

    fetch(`http://localhost:5000/api/friends/search?username=${encodeURIComponent(username)}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Could not search for players.');
        }
        return response.json();
      })
      .then(data => {
        setSearchResults(data);
      })
      .catch(error => {
        console.error('Search error:', error);
        setSearchResults([]);
      })
      .finally(() => {
        setSearchLoading(false);
      });
  }, [searchTerm]);

  if (selectedFriend) {
    return (
      <ChatScreen
        player={player}
        friend={selectedFriend}
        onBack={() => setSelectedFriend(null)}
      />
    );
  }

  
  return (
    <div className="friends-page">
      <div className="friends-columns">

        <section className="panel friends-panel">
          <h2>My Friends</h2>
          <p>Your friends and connections.</p>

          {loading ? (
            <p>Loading friends...</p>
          ) : error ? (
            <p>{error}</p>
          ) : (
            <>
              <div className="friend-requests-section">
                <h3>Friend Requests</h3>

                {friendRequests.length === 0 ? (
                  <p>No pending friend requests.</p>
                ) : (
                  friendRequests.map(request => (
                    <div key={request._id} className="friend-card friend-request-card">

                      <div className="friend-avatar">
                        {request.username.charAt(0).toUpperCase()}
                      </div>

                      <div className="friend-details">
                        <h3>{request.username}</h3>
                      </div>

                      <div className="friend-actions">
                        <button
                          className="friend-chat-button"
                          onClick={() => acceptFriendRequest(request._id)}
                        >
                          Accept
                        </button>

                        <button
                          className="friend-remove-button"
                          onClick={() => declineFriendRequest(request._id)}
                        >
                          Decline
                        </button>
                      </div>

                    </div>
                  ))
                )}
              </div>

              <div className="friends-list">
                {friends.length === 0 ? (
                  <p>You haven't added any friends yet.</p>
                ) : (
                  friends.map(friend => (
                    <div key={friend._id} className="friend-card">
                      <div className="friend-avatar">
                        {friend.username.charAt(0).toUpperCase()}
                      </div>

                      <div className="friend-details">
                        <h3>{friend.username}</h3>
                      </div>

                      <div className="friend-actions">
                        <button
                          className="friend-chat-button"
                          onClick={() => setSelectedFriend(friend)}
                        >
                          Chat
                        </button>

                        <button
                          className="friend-remove-button"
                          onClick={() => removeFriend(friend._id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        <section className="panel friends-panel">
          <span className="eyebrow">DISCOVER PLAYERS</span>
          <h2>Find a Friend</h2>
          <p>Search for other registered players.</p>

          <input
            type="text"
            placeholder="Search username..."
            className="friends-search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />

          <div className="search-results">
            <h3>Registered Players</h3>

            {!searchTerm.trim() ? (
              null
            ) : searchLoading ? (
              <p>Searching players...</p>
            ) : searchResults.filter(
                result => result._id !== player.id
              ).length === 0 ? (
              <p>No players found.</p>
            ) : (
              searchResults
                .filter(result => result._id !== player.id)
                .map(result => (
                  <div key={result._id} className="search-result">
                    <div className="friend-avatar">
                      {result.username.charAt(0).toUpperCase()}
                    </div>

                    <div className="friend-details">
                      <h3>{result.username}</h3>
                      <span>Registered player</span>
                    </div>

                    <button
                      className="add-friend-button"
                      onClick={() => sendFriendRequest(result._id)}
                    >
                      + Add Friend
                    </button>
                  </div>
                ))
            )}
          </div>
        </section>

      </div>

      <div className="friends-back-button">
        <button className="primary wide" onClick={onBack}>
          Back to the game
        </button>
      </div>
    </div>
  );

}


function ChatScreen({ player, friend, onBack }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadMessages() {
    try {
      const response = await fetch(
        `http://localhost:5000/api/messages/${player.id}/${friend._id}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load messages.');
      }

      setMessages(data);
      setError('');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();

    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [player.id, friend._id]);

  async function sendMessage() {
    if (!newMessage.trim()) return;

    try {
      const response = await fetch(
        'http://localhost:5000/api/messages/send',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            senderId: player.id,
            receiverId: friend._id,
            message: newMessage.trim()
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to send message.');
      }

      setNewMessage('');
      await loadMessages();
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <div className="instagram-chat">

      <div className="chat-header">
        <button className="chat-back" onClick={onBack}>
          ←
        </button>

        <div className="chat-header-avatar">
          {friend.username.charAt(0).toUpperCase()}
        </div>

        <div className="chat-header-info">
          <h2>{friend.username}</h2>
          <span>21 CLUB · FRIENDS</span>
        </div>

        <div className="chat-header-status">
          <span></span>
        </div>
      </div>

      <div className="instagram-chat-messages">

        <div className="chat-welcome">
          <div className="chat-large-avatar">
            {friend.username.charAt(0).toUpperCase()}
          </div>

          <h3>{friend.username}</h3>
          <p>You're connected on 21 CLUB.</p>
          <span>Start your conversation below.</span>
        </div>

        {loading ? (
          <p className="chat-status">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="chat-status">No messages yet. Say hello!</p>
        ) : (
          messages.map(message => {
            const isMine =
              String(message.sender?._id) === String(player.id);

            return (
              <div
                key={message._id}
                className={`chat-message-row ${isMine ? 'mine' : 'theirs'}`}
              >
                <div className="chat-message-content">

                  <span className="chat-sender-name">
                    {isMine ? 'YOU' : friend.username.toUpperCase()}
                  </span>

                  <div className="chat-bubble">
                    {message.message}
                  </div>

                </div>
              </div>
            );
          })
        )}

        {error && <p className="chat-error">{error}</p>}
      </div>

      <div className="instagram-chat-input">

        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') sendMessage();
          }}
          placeholder={`Message ${friend.username}...`}
        />

        <button
          className="chat-send-button"
          onClick={sendMessage}
          disabled={!newMessage.trim()}
        >
          Send
        </button>

      </div>

    </div>
  );
}

function ProfileEditor({ player, onSave, onCancel }) {
  const [username, setUsername] = useState(player.name);
  const [profilePicture, setProfilePicture] = useState(
    player.profilePicture || ''
  );

  const avatars = [
    'avatar1.jpg',
    'avatar2.jpg',
    'avatar3.jpg',
    'avatar4.jpg',
    'avatar5.jpg',
    'avatar6.jpg'
  ];

  function handleImageUpload(event) {
    const file = event.target.files[0];

    if (file) {
      const reader = new FileReader();

      reader.onloadend = () => {
        setProfilePicture(reader.result);
      };

      reader.readAsDataURL(file);
    }
  }

  return (
    <section className="profile-editor">
      <h2>My Profile</h2>

      <label>
        Username
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>

      <p>Choose a profile picture</p>

      <div className="avatar-options">
        {avatars.map((avatar) => (
          <button
            key={avatar}
            type="button"
            onClick={() => setProfilePicture(`${ASSETS}${avatar}`)}
          >
            <img src={`${ASSETS}${avatar}`} alt="Avatar option" />
          </button>
        ))}
      </div>

      <label>
        Or upload a picture from your computer
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
        />
      </label>

      {profilePicture && (
        <div className="profile-preview">
          <p>Preview</p>
          <img src={profilePicture} alt="Profile preview" />
        </div>
      )}

      <div className="profile-editor-actions">
        <button
          type="button"
          onClick={() => onSave({ name: username, profilePicture })}
        >
          Save Changes
        </button>

        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

export default function App() {
 const [screen,setScreen]=useState('start');
 const [game,setGame]=useState(null);
 const [player,setPlayer]=useState(null);
 const [profileMenuOpen, setProfileMenuOpen] = useState(false);
 const [authMode, setAuthMode] = useState('login');
 const [bet, setBet] = useState(10);
 const historySaved = useRef(new Set());
 const main=useRef(null);
 useEffect(()=>{main.current?.focus();},[screen]);

function begin(){
  if (player && player.type === 'registered') {
    
    setGame(startGame());
    setScreen('game');

  } else {
    
    setAuthMode('login');
    setScreen('auth');
  }
}

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

      {player?.type === 'registered' && (
  <div className="profile-menu-container">
    <button
      className="profile-button"
      onClick={() => setProfileMenuOpen(!profileMenuOpen)}
      aria-label="Open profile menu"
      aria-expanded={profileMenuOpen}
      title="My Profile"
    >
      {player.profilePicture ? (
        <img
          src={player.profilePicture}
          alt="Profile"
          className="header-profile-picture"
        />
      ) : (
        <span className="profile-placeholder">
          {player.name.charAt(0).toUpperCase()}
        </span>
      )}
    </button>

    {profileMenuOpen && (
      <div className="profile-dropdown">

        <div className="profile-dropdown-info">
          {player.profilePicture ? (
            <img
              src={player.profilePicture}
              alt="Profile"
              className="dropdown-profile-picture"
            />
          ) : (
            <div className="dropdown-profile-placeholder">
              {player.name.charAt(0).toUpperCase()}
            </div>
          )}

          <h3>{player.name}</h3>
          <p>{player.email}</p>
        </div>

        <div className="profile-dropdown-divider"></div>

        <button onClick={() => {
          setProfileMenuOpen(false);
          setScreen('profile');
        }}>
          <span>👤</span>
          My Profile
        </button>

        <button onClick={() => {
          setProfileMenuOpen(false);
          setScreen('friends');
        }}>
          <span>👥</span>
          View Friends
        </button>

        <button onClick={() => {
          setProfileMenuOpen(false);
          setPlayer(null);
          setGame(null);
          setScreen('start');
        }}>
          <span>🚪</span>
          Log Out
        </button>
      </div>
    )}
  </div>
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
              lineHeight  : '1.5'
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
        <Game game={game} setGame={setGame} player={player} historySaved={historySaved} bet={bet} setBet={setBet}/>
      ) : screen === 'history' && player?.type === 'registered' ? (
        <HistoryScreen
          player={player}
          onBack={() => setScreen(game ? 'game' : 'start')}
        />  
      ) : screen === 'friends' && player?.type === 'registered' ? (
        <FriendsScreen
          player={player}
          onBack={() => setScreen(game ? 'game' : 'start')}
        />

      ) : screen === 'profile' && player?.type === 'registered' ? (
        <ProfileEditor
          player={player}
          onSave={(updatedProfile) => {
            setPlayer({
              ...player,
              name: updatedProfile.name,
              profilePicture: updatedProfile.profilePicture
            });
            setScreen(game ? 'game' : 'start');
          }}
          onCancel={() => setScreen(game ? 'game' : 'start')}
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
