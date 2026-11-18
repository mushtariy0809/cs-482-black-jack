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
import AdminDashboard from './admin/AdminDashboard.jsx';
import TableChat from './TableChat.jsx';
import { installUiSounds, preload, setMusic } from './sound/SoundManager.js';
import { startTables, stopTables, leaveTable, joinTable, setChipsHint, dismissInvite, useTables } from './realtime/useTables.js';
import InvitePanel from './invite/InvitePanel.jsx';
import InviteToasts from './invite/InviteToasts.jsx';
import { clearPendingInvite, takeInviteFromUrl } from './invite/inviteLink.js';
import AdPlayer from './ads/AdPlayer.jsx';
import OutOfChipsToast from './ads/OutOfChipsToast.jsx';
import WatchAdButton from './ads/WatchAdButton.jsx';
import { useVideoAds } from './ads/useVideoAds.js';
import { saveHandToHistory } from './history/saveHistory.js';
import { usePlayerTimer } from './timer.js';
import './styles.css';

const GUEST = { type: 'guest', name: 'Guest' };

// The game screen zooms its table itself (see SoloGame) so its ad column never moves
const screenMotion = { initial: false, animate: { opacity: 1 }, exit: { opacity: 1, transition: { duration: 0 } } };

// Button sounds everywhere; lounge music in the lobby, a different loop at the table and in the tutorial.
// The music stops while a video ad plays.
function useAppSounds(screen, adPlaying) {
  useEffect(() => {
    installUiSounds();
  }, []);

  useEffect(() => {
    if (adPlaying) {
      setMusic(null);
    } else if (screen === 'game' || screen === 'tutorial') {
      preload('table');
      setMusic('table');
    } else {
      setMusic('lobby');
    }
  }, [screen, adPlaying]);
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

  return [chips, setChips];
}

// Chips needed to place a bet where the player is (the table's minimum, or the usual 10 in the lobby)
const LOBBY_MIN_BET = 10;

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
  // Invite code to join once the player is in the lobby (?join=CODE link or a friend's invite)
  const [inviteCode, setInviteCode] = useState(() => takeInviteFromUrl());
  const [showInvite, setShowInvite] = useState(false);
  // PINs this player picked for the private tables they created (shown in the invite panel)
  const [tablePins, setTablePins] = useState({});
  const [brokeDismissed, setBrokeDismissed] = useState(false);
  const [notice, setNotice] = useState('');
  const historySaved = useRef(new Set());
  const main = useRef(null);

  const session = useTableSession({ table, screen, game });
  const { live, mySeat, offline, shared, sharedState, mySharedSeat, inHand, stake } = session;
  const { chipGrant } = useTables();
  const [chips, setChips] = useChips(game, mySharedSeat);
  const timeLeft = usePlayerTimer(game, setGame);
  const lastGrantId = useRef(null);
  const registered = player?.type === 'registered';

  const ads = useVideoAds({ enabled: Boolean(player), identity: player?.token ?? 'guest', onReward: collectAdReward });

  useEffect(() => { main.current?.focus(); }, [screen]);
  useAppSounds(screen, Boolean(ads.session));

  // Out of chips: offer a video ad, unless a hand is being played
  const minBet = table ? (live?.minBet ?? table.minBet ?? LOBBY_MIN_BET) : LOBBY_MIN_BET;
  const broke = Boolean(player) && chips < minBet && !inHand && (screen === 'lobby' || screen === 'game');
  useEffect(() => {
    if (!broke) setBrokeDismissed(false);
  }, [broke]);

  // Apply live admin chip grants when the player is logged in
  useEffect(() => {
    if (!registered || !chipGrant || chipGrant.id === lastGrantId.current) return;
    lastGrantId.current = chipGrant.id;
    if (!mySharedSeat) {
      if (game) setGame(current => current && { ...current, money: current.money + chipGrant.amount });
      else setChips(current => current + chipGrant.amount);
    }
    setNotice(`Admin added ${chipGrant.amount.toLocaleString()} chips to your account.`);
  }, [chipGrant, registered, mySharedSeat, game]);

  // Short messages (ad errors) disappear on their own
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // The server already added the chips at a multiplayer seat (seatChips);
  // otherwise the browser holds the balance: the solo game's money, or the lobby balance.
  function collectAdReward({ reward, seatChips }) {
    if (seatChips != null) return;
    if (game) setGame(current => current && { ...current, money: current.money + reward });
    else setChips(current => current + reward);
  }

  async function watchAd() {
    const message = await ads.open();
    if (message) setNotice(message);
  }

  // Save each settled shared hand to history (same endpoint as the solo game)
  function saveSharedRound({ key, hands, dealer }) {
    const hand = hands[0];
    saveHandToHistory({ player, key, result: hand.result, playerCards: hand.cards, dealerCards: dealer, tableName: table?.name ?? '', savedKeys: historySaved.current });
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
    setChips(newPlayer.chips ?? 1000);
    if (newPlayer.role === 'admin') {
      stopTables();
      setTable(null);
      setGame(null);
      setScreen('admin');
      return;
    }
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
    setShowInvite(false);
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

  // Created a table: private ones open the invite panel right away so the link can be shared
  function tableCreated(result, { pin }) {
    if (pin) setTablePins(current => ({ ...current, [result.table.id]: pin }));
    setShowInvite(result.table.visibility === 'private');
    sitAt(result.table);
  }

  // "Join" on a friend's invite popup. Not offered mid-hand (that would lose the bet).
  function acceptInvite(invite) {
    dismissInvite(invite.tableId);
    if (table) {
      leaveTable();
      setTable(null);
      setGame(null);
      setShowInvite(false);
    }
    setInviteCode(invite.inviteCode);
    setScreen('lobby');
  }

  function inviteHandled() {
    setAutoJoinId(null);
    setInviteCode(null);
    clearPendingInvite();
  }

  function logOut() {
    if (table) leaveTable();
    stopTables();
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
          toolbar={<TableBar table={table} onLeave={requestLeave} onChat={() => setShowTableChat(true)} canChat={Boolean(player?.token && !table.solo)} onInvite={() => setShowInvite(true)} />}
          onChangeTable={requestLeave}
          onRoundSettled={saveSharedRound}
        />
        {showTableChat && <TableChat player={player} table={table} onClose={() => setShowTableChat(false)} />}
        <AnimatePresence>
          {showInvite && (
            <InvitePanel table={live ?? table} player={player} pin={tablePins[table.id] ?? ''} onClose={() => setShowInvite(false)} />
          )}
        </AnimatePresence>
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
            onSuccess={({ name, id, email, token, role,chips: accountChips }) => enterLobby({ type: 'registered', name, id, email, token, role, chips: accountChips })}
            onGuest={() => enterLobby(GUEST)}
          />
        );
      case 'tutorial':
        return <PracticeRound Card={Card} onSkip={home} onPractice={practiceWithBots} onFindTable={findTable} />;
      case 'lobby':
        if (player) {
          return (
            <Lobby
              onJoined={sitAt}
              onCreate={() => setScreen('create')}
              autoJoinId={autoJoinId}
              autoJoinCode={inviteCode}
              onAutoJoinHandled={inviteHandled}
            />
          );
        }
        break;
      case 'create':
        if (player) return <CreateTable onCreated={tableCreated} onCancel={() => setScreen('lobby')} />;
        break;
      case 'game':
        if (shared) return renderSharedTable();
        if (game) return renderSoloTable();
        break;
      case 'history':
        if (registered) {
          return (
            <HistoryScreen
              player={player}
              onBack={home}
              onFindTable={() => setScreen(table || game ? 'game' : 'lobby')}
              onCreateTable={() => setScreen('create')}
            />
          );
        }
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
      {screen === 'admin' && player?.role === 'admin' ? (
        <AdminDashboard player={player} onLogout={logOut} />
      ) : (
        <>
          <AppHeader
            screen={screen}
            player={player}
            chips={chips}
            onHome={home}
            onNavigate={setScreen}
            onLogOut={logOut}
            adButton={<WatchAdButton status={ads.status} onWatch={watchAd} />}
          />

          <main ref={main} tabIndex="-1">
            {inviteCode && !player && (
              <p className="invite-banner" role="status">
                You've been invited to a table. Log in or play as a guest to take your seat.
              </p>
            )}
            <AnimatePresence mode="wait">
              <motion.div key={screen} {...screenMotion}>
                {renderScreen()}
              </motion.div>
            </AnimatePresence>
          </main>

          <AnimatePresence>
            {confirmLeave && <LeaveConfirm stake={stake} onConfirm={exitTable} onCancel={() => setConfirmLeave(false)} />}
          </AnimatePresence>

          {/* Bottom-left popups: friend invites, out of chips, short notices */}
          <div className="toast-stack" aria-live="polite">
            {player && <InviteToasts onJoin={acceptInvite} blockedReason={inHand ? 'Finish this hand first.' : ''} />}
            <AnimatePresence>
              {broke && !brokeDismissed && !ads.session && (
                <OutOfChipsToast
                  key="broke"
                  status={ads.status}
                  minBet={minBet}
                  error={ads.error}
                  onWatch={watchAd}
                  onDismiss={() => setBrokeDismissed(true)}
                />
              )}
              {notice && !broke && (
                <motion.p key="notice" className="toast toast-notice" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {notice}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {ads.session && <AdPlayer key={ads.session.viewId} session={ads.session} onFinish={ads.finish} onClose={ads.close} />}
          </AnimatePresence>
        </>
      )}
    </>
  );
}
