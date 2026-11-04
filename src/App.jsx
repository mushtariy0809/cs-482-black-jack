
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
import { usePlayerTimer } from './timer.js';

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

  const timeLeft = usePlayerTimer(game, setGame);
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
<div className="table-message" role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
      <span>
        {game.phase==='ready'?'Your table is ready.':finished?messages[game.result]:'Your turn'}
        {game.phase=== 'player' && ' \u2013 '}
      </span>
      {game.phase === 'player' && (
       <span style={{ color: timeLeft <= 5 ? '#ef4444' : 'inherit', fontWeight: 'bold' }}>
        {timeLeft}s
       </span>
      )}
     </div>
          <div className="player-hand-container" style={{ display: 'flex', gap: '24px', justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap'}}>
        {game.hands && game.hands.length > 0 ? (
       game.hands.map((handObj, handIndex) => {
        const isActive = game.phase === 'player' && game.activeHandIndex === handIndex;
        const handScore = scoreHand(handObj.cards);
        return (
         <div 
          key={handIndex} 
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
           {handObj.cards.map((c, i) => (
            <DealtCard 
             key={c.id || i} 
             front={<Card card={c}/>} 
             back={<Card hidden/>} 
             delay={dealDelay('player', i)}
            />
           ))}
          </div>
          <ScorePill>
           {game.hands.length > 1 ? `Hand ${handIndex + 1} ` : 'Your hand'} 
           {handObj.bet ? `($${handObj.bet})` : ''} 
           {handObj.cards.length ? ` · ${handScore.total}${handScore.blackjack ? ' · Blackjack' : handScore.bust ? ' · Bust' : handScore.soft ? ' · Soft' : ''}` : ''}
           {isActive ? ' ◀ Active' : ''}
          </ScorePill>
         </div>
        );
       })
      ) : (
       <div className="hand">
        <div className="cards">{game.player.map((c,i)=><DealtCard key={c.id} front={<Card card={c}/>} back={<Card hidden/>} delay={dealDelay('player',i)}/>)}</div>
        <ScorePill>Your hand{game.player.length?` · ${p.total}${p.blackjack?' · Blackjack':p.bust?' · Bust':p.soft?' · Soft':''}`:''}</ScorePill>
       </div>
      )}
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
  if (player?.type === 'registered') {
    setScreen('lobby');
  } else {
    setAuthMode('login');
    setScreen('auth');
  }
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
          if (table) leaveTable();
          setTable(null);
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
      ) : screen === 'friends' && player?.type === 'registered' ? (
        <FriendsScreen
          player={player}
          onBack={home}
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
            home();
          }}
          onCancel={home}
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
