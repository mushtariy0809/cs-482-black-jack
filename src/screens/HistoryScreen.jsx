import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Card from '../components/Card.jsx';
import { scoreHand } from '../blackjack.js';
import { copyText } from '../invite/inviteLink.js';
import { LockIcon, StatusBadge } from '../lobby/tableInfo.jsx';
import { deleteTable, getMyTables, useTables } from '../realtime/useTables.js';
import '../history/history.css';
import { API_URL } from '../apiUrl.js';

// History (registered players): every hand played, plus the tables you created.
// Hands saved before tables and cards were recorded only have the two scores.

const RESULT_LABELS = { win: 'Win', loss: 'Loss', push: 'Push' };
const RESULT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'win', label: 'Wins' },
  { id: 'loss', label: 'Losses' },
  { id: 'push', label: 'Pushes' }
];
const PAGE_SIZE = 25;

// history is newest first
export function historyStats(history) {
  const count = result => history.filter(hand => hand.result === result).length;
  const wins = count('win');

  let best = 0;
  let run = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    run = history[i].result === 'win' ? run + 1 : 0;
    best = Math.max(best, run);
  }

  return {
    hands: history.length,
    wins,
    losses: count('loss'),
    pushes: count('push'),
    winRate: history.length ? Math.round((wins / history.length) * 100) : 0,
    bestStreak: best
  };
}

function dayLabel(date, now = new Date()) {
  const start = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  });
}

function timeLabel(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Consecutive hands from the same day share a heading
function groupByDay(hands) {
  const groups = [];
  for (const hand of hands) {
    const label = dayLabel(new Date(hand.createdAt));
    if (groups.at(-1)?.label === label) groups.at(-1).hands.push(hand);
    else groups.push({ label, hands: [hand] });
  }
  return groups;
}

function StatTile({ value, label, tone = '' }) {
  return (
    <div className={`history-stat ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CardsRow({ who, cards, total }) {
  return (
    <div className="history-hand-row">
      <span className="history-who">{who}</span>
      <div className="history-cards">
        {cards.map((card, i) => <Card key={i} card={card} />)}
      </div>
      <span className="history-total">{total}</span>
    </div>
  );
}

function HandItem({ hand }) {
  const date = new Date(hand.createdAt);
  const hasCards = hand.playerCards?.length > 0 && hand.dealerCards?.length > 0;
  const blackjack = hasCards && hand.playerCards.length === 2 && scoreHand(hand.playerCards).total === 21;

  return (
    <li className={`history-hand is-${hand.result}`}>
      <div className="history-hand-head">
        <span className={`history-badge is-${hand.result}`}>{RESULT_LABELS[hand.result]}</span>
        <span className="history-hand-where">
          {/* Hands saved before table names were recorded show just the time */}
          {hand.tableName && <>{hand.tableName} <span aria-hidden="true">·</span> </>}
          {timeLabel(date)}
        </span>
        <span className="history-hand-score" aria-label={`You ${hand.playerScore}, dealer ${hand.dealerScore}`}>
          {hand.playerScore} <small>vs</small> {hand.dealerScore}
        </span>
      </div>
      {hasCards && (
        <div className="history-hand-body">
          <CardsRow who="You" cards={hand.playerCards} total={blackjack ? '21 · Blackjack' : hand.playerScore} />
          <CardsRow who="Dealer" cards={hand.dealerCards} total={hand.dealerScore} />
        </div>
      )}
    </li>
  );
}

function HandsTab({ player, onFindTable }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState('all');
  const [tableName, setTableName] = useState('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    fetch(`${API_URL}/api/history/${player.id}`)
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

  const stats = useMemo(() => historyStats(history), [history]);
  const tableNames = useMemo(() => [...new Set(history.map(hand => hand.tableName).filter(Boolean))].sort(), [history]);
  const filtered = history.filter(hand =>
    (result === 'all' || hand.result === result) && (tableName === 'all' || hand.tableName === tableName)
  );
  const groups = groupByDay(filtered.slice(0, shown));

  function changeFilter(change) {
    change();
    setShown(PAGE_SIZE);
  }

  if (loading) return <p className="history-note" role="status">Loading your games…</p>;
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (history.length === 0) {
    return (
      <div className="history-empty">
        <p>No completed games yet.</p>
        <p className="history-note">Every hand you finish shows up here, with your cards and the dealer's.</p>
        <button type="button" className="primary" onClick={onFindTable}>Find a table →</button>
      </div>
    );
  }

  return (
    <>
      <div className="history-stats" aria-label="Your stats">
        <StatTile value={stats.hands.toLocaleString()} label="Hands played" />
        <StatTile value={`${stats.winRate}%`} label="Win rate" tone="is-mint" />
        <StatTile value={`${stats.wins}–${stats.losses}–${stats.pushes}`} label="Wins – losses – pushes" />
        <StatTile value={stats.bestStreak} label="Best win streak" tone="is-gold" />
      </div>

      <div className="history-filters">
        <div className="filter-tabs" role="group" aria-label="Filter by result">
          {RESULT_FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={result === f.id ? 'is-selected' : ''}
              aria-pressed={result === f.id}
              onClick={() => changeFilter(() => setResult(f.id))}
            >
              {f.label}
            </button>
          ))}
        </div>
        {tableNames.length > 1 && (
          <label className="history-table-filter">
            <span>Table</span>
            <select value={tableName} onChange={event => changeFilter(() => setTableName(event.target.value))}>
              <option value="all">All tables</option>
              {tableNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="history-note">No hands match these filters.</p>
      ) : (
        groups.map(group => (
          <section key={group.label} className="history-day" aria-label={group.label}>
            <h3>{group.label}</h3>
            <ul className="history-hands">
              {group.hands.map(hand => <HandItem key={hand._id} hand={hand} />)}
            </ul>
          </section>
        ))
      )}

      {filtered.length > shown && (
        <button type="button" className="wide history-more" onClick={() => setShown(shown + PAGE_SIZE)}>
          Show more ({filtered.length - shown} left)
        </button>
      )}
    </>
  );
}

function deleteBlockReason(table) {
  if (table.canDelete) return '';
  if (table.seatedHere) return "You're sitting here. Leave the table first.";
  const others = table.othersSeated;
  const who = others === 1 ? '1 player is' : `${others} players are`;
  return `${who} seated. Only empty tables can be deleted.`;
}

function MyTableItem({ table, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const blocked = deleteBlockReason(table);
  const isPrivate = table.visibility === 'private';

  async function remove() {
    setBusy(true);
    setError('');
    const result = await deleteTable(table.id);
    setBusy(false);
    if (result.ok) onDeleted(table.id);
    else {
      setError(result.message);
      setConfirming(false);
    }
  }

  async function copyCode() {
    setCopied(await copyText(table.inviteCode));
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <motion.li className="my-table" layout exit={{ opacity: 0, height: 0 }}>
      <div className="my-table-main">
        <div className="my-table-title">
          <h3>{isPrivate && <LockIcon />} {table.name}</h3>
          <StatusBadge status={table.status} />
        </div>
        <p className="my-table-meta">
          <span>{visibilityText(table)}</span>
          <span aria-hidden="true">·</span>
          <span>{table.players} / {table.maxSeats} players</span>
          <span aria-hidden="true">·</span>
          <span>Created {timeLabel(new Date(table.createdAt))}</span>
        </p>
        <p className="my-table-code">
          Invite code <strong>{table.inviteCode}</strong>
          <button type="button" className="my-table-copy" onClick={copyCode}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </p>
        {blocked && <p className="history-note">{blocked}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>

      <div className="my-table-actions">
        {confirming ? (
          <div className="my-table-confirm" role="group" aria-label={`Delete ${table.name}?`}>
            <span>Delete “{table.name}”? Its invite link stops working.</span>
            <div>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
              <button type="button" className="danger" onClick={remove} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete table'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="danger-outline" disabled={Boolean(blocked)} onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
    </motion.li>
  );
}

function MyTablesTab({ onCreateTable }) {
  const { tables: live, connection } = useTables();
  const [mine, setMine] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const result = await getMyTables();
    if (result.ok) {
      setMine(result.tables);
      setError('');
    } else {
      setError(result.message);
    }
  }

  useEffect(() => {
    if (connection !== 'connecting') load();
  }, [connection]);

  // Seat counts and status change live; reload so canDelete stays right
  const liveSignature = (mine ?? [])
    .map(t => {
      const now = live.find(l => l.id === t.id);
      return now ? `${t.id}:${now.players}:${now.status}` : `${t.id}:gone`;
    })
    .join('|');
  useEffect(() => {
    if (mine) load();
  }, [liveSignature]);

  if (error && !mine) return <p className="form-error" role="alert">{error}</p>;
  if (!mine) return <p className="history-note" role="status">Loading your tables…</p>;

  // Tables that closed since (deleted elsewhere, or empty for 5 minutes) drop out
  const shown = mine
    .filter(t => connection !== 'online' || live.some(l => l.id === t.id))
    .map(t => ({ ...t, ...pickLive(live.find(l => l.id === t.id)) }));

  if (shown.length === 0) {
    return (
      <div className="history-empty">
        <p>You have no open tables.</p>
        <p className="history-note">Tables you create show up here so you can share or delete them.</p>
        <button type="button" className="primary" onClick={onCreateTable}>+ Create table</button>
      </div>
    );
  }

  return (
    <>
      <ul className="my-tables">
        {shown.map(table => (
          <MyTableItem key={table.id} table={table} onDeleted={id => setMine(current => current.filter(t => t.id !== id))} />
        ))}
      </ul>
      <p className="history-note">Empty tables close on their own after 5 minutes.</p>
    </>
  );
}

function visibilityText(table) {
  if (table.visibility !== 'private') return 'Public';
  return table.hasPin ? 'Private · PIN' : 'Private';
}

// The live fields from the lobby list (seats and status change while you look)
function pickLive(table) {
  if (!table) return {};
  return { players: table.players, status: table.status, maxSeats: table.maxSeats };
}

export default function HistoryScreen({ player, onBack, onFindTable = onBack, onCreateTable = onBack }) {
  const [tab, setTab] = useState('hands');

  return (
    <div className="history-screen">
      <div className="setup-title history-title">
        <button type="button" className="setup-back" onClick={onBack}>‹ Back</button>
        <div>
          <h1>Game History</h1>
          <p className="history-note">Past games for {player.name}</p>
        </div>
      </div>

      <div className="history-tabs" role="tablist" aria-label="History">
        <button
          type="button"
          role="tab"
          id="history-tab-hands"
          aria-selected={tab === 'hands'}
          aria-controls="history-panel"
          className={tab === 'hands' ? 'is-selected' : ''}
          onClick={() => setTab('hands')}
        >
          Hands
        </button>
        <button
          type="button"
          role="tab"
          id="history-tab-tables"
          aria-selected={tab === 'tables'}
          aria-controls="history-panel"
          className={tab === 'tables' ? 'is-selected' : ''}
          onClick={() => setTab('tables')}
        >
          My tables
        </button>
      </div>

      <section
        id="history-panel"
        className="panel history-panel"
        role="tabpanel"
        aria-labelledby={tab === 'hands' ? 'history-tab-hands' : 'history-tab-tables'}
      >
        {tab === 'hands'
          ? <HandsTab player={player} onFindTable={onFindTable} />
          : <MyTablesTab onCreateTable={onCreateTable} />}
      </section>
    </div>
  );
}
