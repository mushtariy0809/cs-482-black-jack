import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { startGame } from './blackjack.js';
import Card from './components/Card.jsx';
import AppHeader from './layout/AppHeader.jsx';
import Lobby from './lobby/Lobby.jsx';
import CreateTable from './lobby/CreateTable.jsx';
import TableBar from './table/TableBar.jsx';
import LeaveConfirm from './table/LeaveConfirm.jsx';
import MultiplayerGame from './table/MultiplayerGame.jsx';
import { useTableSession } from './table/useTableSession.js';
import PracticeRound from './tutorial/PracticeRound.jsx';
import AuthScreen from './screens/AuthScreen.jsx';
import FriendsScreen from './screens/FriendsScreen.jsx';
import HistoryScreen from './screens/HistoryScreen.jsx';
import ProfileEditor from './screens/ProfileEditor.jsx';
import SoloGame from './screens/SoloGame.jsx';
import WelcomeScreen from './screens/WelcomeScreen.jsx';
import TableChat from './TableChat.jsx';
import { installUiSounds, preload, setMusic } from './sound/SoundManager.js';
import { startTables, leaveTable, joinTable, setChipsHint } from './realtime/useTables.js';
import { saveHandToHistory } from './history/saveHistory.js';
import { usePlayerTimer } from './timer.js';
import './styles.css';

const GUEST = { type: 'guest', name: 'Guest' };

// The game screen zooms its table itself (see SoloGame) so its ad column never moves
const screenMotion = { initial: false, animate: { opacity: 1 }, exit: { opacity: 1, transition: { duration: 0 } } };

// Button sounds everywhere; lounge music in the lobby, a different loop at the table and in the tutorial
function useAppSounds(screen) {
  useEffect(() => {
    installUiSounds();
  }, []);

  useEffect(() => {
    if (screen === 'game' || screen === 'tutorial') {
      preload('table');
      setMusic('table');
    } else {
      setMusic('lobby');
    }
  }, [screen]);
}

// One chip balance carried between tables: from the local game, or from the server at shared tables
function useChips(game, mySharedSeat) {
  const [chips, setChips] = useState(1000);

  useEffect(() => {
    if (game) setChips(game.money);
  }, [game?.money]);

  useEffect(() => {
    if (mySharedSeat) setChips(mySharedSeat.chips);
  }, [mySharedSeat?.chips]);

  // The balance to sit down with at the next table
  useEffect(() => {
    setChipsHint(chips);
  }, [chips]);

  return chips;
}

export default function App() {
  const [screen, setScreen] = useState('start');
  const [game, setGame] = useState(null);
  const [player, setPlayer] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [bet, setBet] = useState(10);
  // Table the player is seated at
  const [table, setTable] = useState(null);
  const [showTableChat, setShowTableChat] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Table to join as soon as the lobby opens (tutorial's "Practice with bots")
  const [autoJoinId, setAutoJoinId] = useState(null);
  const historySaved = useRef(new Set());
  const main = useRef(null);

  const session = useTableSession({ table, screen, game });
  const { live, mySeat, offline, shared, sharedState, mySharedSeat, inHand, stake } = session;
  const chips = useChips(game, mySharedSeat);
  const timeLeft = usePlayerTimer(game, setGame);
  const registered = player?.type === 'registered';

  useEffect(() => { main.current?.focus(); }, [screen]);
  useAppSounds(screen);

  // Save each settled shared hand to history (same endpoint as the solo game)
  function saveSharedRound({ key, hands, dealer }) {
    const hand = hands[0];
    saveHandToHistory({ player, key, result: hand.result, playerCards: hand.cards, dealerCards: dealer, savedKeys: historySaved.current });
  }

  // Registered players go to the lobby; everyone else logs in first
  function begin() {
    if (registered) {
      setScreen('lobby');
    } else {
      setAuthMode('login');
      setScreen('auth');
    }
  }

  // Where "Play" and the logo lead
  function home() {
    if (game || table) setScreen('game');
    else if (player) setScreen('lobby');
    else setScreen('start');
  }

  function enterLobby(newPlayer) {
    setPlayer(newPlayer);
    startTables(newPlayer.name, newPlayer.token);
    setScreen('lobby');
  }

  async function sitAt(joinedTable) {
    setTable(joinedTable);

    const result = await joinTable({ tableId: joinedTable.id });
    if (!result.ok) {
      alert(result.message || 'Could not join table');
      setScreen('lobby');
      return;
    }

    // Solo/demo tables play a local game; shared tables wait for the server's table:state
    setGame(joinedTable.solo || offline ? startGame(chips) : null);
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

  // Leaving between hands is free; mid-hand asks first because the bet is lost
  function requestLeave() {
    if (inHand) setConfirmLeave(true);
    else exitTable();
  }

  // Tutorial end buttons. Not logged in yet? Log in / play as guest first.
  function findTable() {
    if (player) setScreen('lobby');
    else begin();
  }

  function practiceWithBots() {
    setAutoJoinId('practice');
    findTable();
  }

  function logOut() {
    if (table) leaveTable();
    setTable(null);
    setPlayer(null);
    setGame(null);
    setScreen('start');
  }

  function saveProfile(updatedProfile) {
    setPlayer({ ...player, name: updatedProfile.name, profilePicture: updatedProfile.profilePicture });
    home();
  }

  function renderSharedTable() {
    if (!sharedState) {
      return (
        <>
          <TableBar table={table} onLeave={requestLeave} />
          <p className="table-loading" role="status">Taking your seat…</p>
        </>
      );
    }

    return (
      <>
        <MultiplayerGame
          tableState={sharedState}
          mySeatIndex={mySeat?.seat}
          maxSeats={live?.maxSeats ?? 5}
          Card={Card}
          toolbar={<TableBar table={table} onLeave={requestLeave} onChat={() => setShowTableChat(true)} canChat={Boolean(player?.token && !table.solo)} />}
          onChangeTable={requestLeave}
          onRoundSettled={saveSharedRound}
        />
        {showTableChat && <TableChat player={player} table={table} onClose={() => setShowTableChat(false)} />}
      </>
    );
  }

  function renderSoloTable() {
    return (
      <SoloGame
        game={game} setGame={setGame} player={player} historySaved={historySaved} bet={bet} setBet={setBet}
        timeLeft={timeLeft}
        tableName={table?.name}
        toolbar={table && <TableBar table={table} onLeave={requestLeave} onChat={() => setShowTableChat(true)} />}
        onChangeTable={table ? exitTable : undefined}
      />
    );
  }

  // The screen to show. Screens that need a player (or a game) fall back to the welcome screen.
  function renderScreen() {
    switch (screen) {
      case 'auth':
        return (
          <AuthScreen
            mode={authMode}
            setMode={setAuthMode}
            onSuccess={({ name, id, email, token }) => enterLobby({ type: 'registered', name, id, email, token })}
            onGuest={() => enterLobby(GUEST)}
          />
        );
      case 'tutorial':
        return <PracticeRound Card={Card} onSkip={home} onPractice={practiceWithBots} onFindTable={findTable} />;
      case 'lobby':
        if (player) return <Lobby onJoined={sitAt} onCreate={() => setScreen('create')} autoJoinId={autoJoinId} onAutoJoinHandled={() => setAutoJoinId(null)} />;
        break;
      case 'create':
        if (player) return <CreateTable onCreated={result => sitAt(result.table)} onCancel={() => setScreen('lobby')} />;
        break;
      case 'game':
        if (shared) return renderSharedTable();
        if (game) return renderSoloTable();
        break;
      case 'history':
        if (registered) return <HistoryScreen player={player} onBack={home} />;
        break;
      case 'friends':
        if (registered) return <FriendsScreen player={player} onBack={home} />;
        break;
      case 'profile':
        if (registered) return <ProfileEditor player={player} onSave={saveProfile} onCancel={home} />;
        break;
    }
    return <WelcomeScreen onStart={begin} onGuest={() => enterLobby(GUEST)} onTutorial={() => setScreen('tutorial')} />;
  }

  return (
    <>
      <AppHeader screen={screen} player={player} chips={chips} onHome={home} onNavigate={setScreen} onLogOut={logOut} />

      <main ref={main} tabIndex="-1">
        <AnimatePresence mode="wait">
          <motion.div key={screen} {...screenMotion}>
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {confirmLeave && <LeaveConfirm stake={stake} onConfirm={exitTable} onCancel={() => setConfirmLeave(false)} />}
      </AnimatePresence>
    </>
  );
}
