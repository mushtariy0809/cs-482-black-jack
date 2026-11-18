import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest } from './adminApi.js';
import AdRevenue from './AdRevenue.jsx';
import './admin.css';

const number = value => new Intl.NumberFormat().format(value || 0);

function Metric({ label, value, note }) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{value == null ? '—' : number(value)}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function Overview({ token, overview, loading, onRefresh }) {
  const [tableMessage, setTableMessage] = useState('');
  const maxRounds = Math.max(1, ...(overview?.dailyRounds || []).map(day => day.count));
  const resultTotal = overview
    ? overview.results.win + overview.results.loss + overview.results.push
    : 0;

  async function closeTable(table) {
    if (table.players > 0 || table.isSystem) return;
    if (!window.confirm(`Close the empty table "${table.name}"?`)) return;
    setTableMessage('');
    try {
      await adminRequest(token, `/tables/${encodeURIComponent(table.id)}`, { method: 'DELETE' });
      setTableMessage(`${table.name} was closed.`);
      await onRefresh();
    } catch (error) {
      setTableMessage(error.message);
    }
  }

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <h1>The club at a glance.</h1>
          <p>Live operations and saved game statistics</p>
        </div>
        <button className="admin-quiet-button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Updating…' : 'Refresh'}
        </button>
      </div>

      <section className="admin-metrics" aria-label="Dashboard metrics">
        <Metric label="Players" value={overview?.metrics.players} note="Registered accounts" />
        <Metric label="Rounds" value={overview?.metrics.rounds} note="Saved game history" />
        <Metric label="Online now" value={overview?.metrics.onlineNow} note="Connected clients" />
        <Metric label="Active tables" value={overview?.metrics.activeTables} note="Tables with seated players" />
      </section>

      <section className="admin-overview-grid">
        <article className="admin-panel admin-chart-panel">
          <h2>Game statistics</h2>
          <p className="admin-panel-subtitle">Saved rounds over the last 7 days</p>
          <div className="admin-chart" role="img" aria-label="Saved game rounds by day">
            {(overview?.dailyRounds || []).map(day => {
              const height = Math.max(6, (day.count / maxRounds) * 100);
              return (
                <div className="admin-chart-column" key={day._id}>
                  <strong>{number(day.count)}</strong>
                  <div className="admin-chart-track">
                    <span style={{ height: `${height}%` }} />
                  </div>
                  <small>{new Date(`${day._id}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                </div>
              );
            })}
            {!overview?.dailyRounds?.length && (
              <p className="admin-empty">{overview ? 'No saved game history yet.' : 'Loading statistics…'}</p>
            )}
          </div>
        </article>

        <article className="admin-panel admin-operations-panel">
          <h2>Live operations</h2>
          <dl>
            <div><dt>Online now</dt><dd>{overview ? number(overview.metrics.onlineNow) : '—'}</dd></div>
            <div><dt>Active tables</dt><dd>{overview ? number(overview.metrics.activeTables) : '—'}</dd></div>
            <div><dt>Game rounds</dt><dd>{overview ? number(overview.metrics.rounds) : '—'}</dd></div>
            <div><dt>Table capacity</dt><dd>{overview ? number(overview.tables.reduce((total, table) => total + table.maxSeats, 0)) : '—'}</dd></div>
          </dl>
        </article>
      </section>

      <section className="admin-overview-grid admin-bottom-grid">
        <article className="admin-panel admin-table-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Table management</h2>
              <p className="admin-panel-subtitle">Current live tables and occupancy</p>
            </div>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr><th>Table</th><th>Type</th><th>Players</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {(overview?.tables || []).map(table => (
                  <tr key={table.id}>
                    <td>{table.name}{table.isSystem && <small className="admin-system-tag">System</small>}</td>
                    <td>{table.visibility === 'private' ? 'Private' : 'Public'}</td>
                    <td>{table.players} / {table.maxSeats}</td>
                    <td><span className={`admin-status admin-status-${table.status}`}>{table.status.replace('_', ' ')}</span></td>
                    <td>
                      <button
                        className="admin-table-action"
                        disabled={table.players > 0 || table.isSystem}
                        onClick={() => closeTable(table)}
                        aria-label={`Close ${table.name}`}
                        title={table.isSystem ? 'System tables cannot be closed' : table.players > 0 ? 'Table must be empty' : 'Close table'}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
                {!overview?.tables?.length && (
                  <tr><td colSpan="5" className="admin-empty">{overview ? 'No live tables available.' : 'Loading tables…'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {tableMessage && <p className="admin-feedback" role="status">{tableMessage}</p>}
        </article>

        <article className="admin-panel admin-results-panel">
          <h2>Round results</h2>
          <p className="admin-panel-subtitle">Outcomes across {overview ? number(resultTotal) : '—'} saved rounds</p>
          <dl>
            <div><dt>Player wins</dt><dd>{overview ? number(overview.results.win) : '—'}</dd></div>
            <div><dt>Player losses</dt><dd>{overview ? number(overview.results.loss) : '—'}</dd></div>
            <div><dt>Pushes</dt><dd>{overview ? number(overview.results.push) : '—'}</dd></div>
          </dl>
        </article>
      </section>
      <p className="admin-footnote">The dealer is automated. Chip balances are not tracked by the app yet; ad views and clicks are in Ad revenue.</p>
    </>
  );
}

function CreateUserForm({ token, onCreated, onCancel }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('player');
  const [chips, setChips] = useState('1000');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanUsername = username.trim();
    const cleanEmail = email.trim();
    const startingChips = Number(chips);

    if (!cleanUsername || !cleanEmail || !password) {
      return setError('Username, email, and password are required.');
    }
    if (password.length < 8) {
      return setError('Password must be at least 8 characters long.');
    }
    if (!Number.isInteger(startingChips) || startingChips < 0) {
      return setError('Starting chips must be a non-negative whole number.');
    }

    setError('');
    setBusy(true);
    try {
      const created = await adminRequest(token, '/players', {
        method: 'POST',
        body: JSON.stringify({
          username: cleanUsername,
          email: cleanEmail,
          password,
          role,
          chips: startingChips
        })
      });
      onCreated(created);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-panel admin-user-form" onSubmit={handleSubmit} noValidate aria-label="Add new user">
      <div className="admin-section-heading">
        <div>
          <h2>Add new user</h2>
          <p className="admin-panel-subtitle">Create a registered player or admin account</p>
        </div>
      </div>

      <div className="admin-user-form-grid">
        <label className="admin-field">
          Username
          <input
            type="text"
            value={username}
            onChange={event => { setUsername(event.target.value); setError(''); }}
            placeholder="Choose a username"
          />
        </label>
        <label className="admin-field">
          Email
          <input
            type="email"
            value={email}
            onChange={event => { setEmail(event.target.value); setError(''); }}
            placeholder="user@example.com"
          />
        </label>
        <label className="admin-field">
          Password
          <input
            type="password"
            value={password}
            onChange={event => { setPassword(event.target.value); setError(''); }}
            placeholder="At least 8 characters"
          />
        </label>
        <label className="admin-field">
          Account role
          <select value={role} onChange={event => setRole(event.target.value)}>
            <option value="player">Player</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="admin-field">
          Starting chips
          <input
            type="number"
            min="0"
            step="1"
            value={chips}
            onChange={event => { setChips(event.target.value); setError(''); }}
          />
        </label>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-user-form-actions">
        <button type="button" className="admin-quiet-button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

function PlayerManagement({ token, adminId }) {
  const [players, setPlayers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedRole, setSelectedRole] = useState('player');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [grantingChips, setGrantingChips] = useState(false);
  const [deletingPlayer, setDeletingPlayer] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const result = await adminRequest(token, `/players${query}`);
      setPlayers(result);
      setSelectedId(current => result.some(item => item.id === current) ? current : (result[0]?.id || ''));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [search, token]);

  useEffect(() => {
    const timer = setTimeout(loadPlayers, 200);
    return () => clearTimeout(timer);
  }, [loadPlayers]);

  const selectedPlayer = useMemo(
    () => players.find(item => item.id === selectedId) || null,
    [players, selectedId]
  );
  const isSelf = selectedPlayer?.id === adminId;

  useEffect(() => {
    setSelectedRole(selectedPlayer?.role || 'player');
  }, [selectedPlayer]);

  async function saveRole() {
    if (!selectedPlayer) return;
    setMessage('');
    try {
      const updated = await adminRequest(token, `/players/${selectedPlayer.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: selectedRole })
      });
      setPlayers(current => current.map(item => item.id === updated.id ? updated : item));
      setMessage('Account role updated.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function giveChips() {
    if (!selectedPlayer || grantingChips) return;
    setMessage('');
    setGrantingChips(true);
    try {
      const updated = await adminRequest(token, `/players/${selectedPlayer.id}/chips`, {
        method: 'POST',
        body: JSON.stringify({ amount: 1000 })
      });
      setPlayers(current => current.map(item => item.id === updated.id ? updated : item));
      setMessage(`Gave 1,000 chips to ${updated.username}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setGrantingChips(false);
    }
  }

  async function deleteSelectedPlayer() {
    if (!selectedPlayer || isSelf || deletingPlayer) return;
    setMessage('');
    setDeletingPlayer(true);
    try {
      await adminRequest(token, `/players/${selectedPlayer.id}`, {
        method: 'DELETE'
      });
      const removed = selectedPlayer;
      setPlayers(current => {
        const remaining = current.filter(item => item.id !== removed.id);
        setSelectedId(remaining[0]?.id || '');
        return remaining;
      });
      setMessage(`Deleted account ${removed.username}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDeletingPlayer(false);
    }
  }

  function handleUserCreated(created) {
    setPlayers(current => [created, ...current.filter(item => item.id !== created.id)]);
    setSelectedId(created.id);
    setShowCreateForm(false);
    setMessage(`Created account for ${created.username}.`);
  }

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <h1>Players &amp; permissions</h1>
          <p>Manage registered players and assign account roles</p>
        </div>
        <button type="button" className="primary" onClick={() => setShowCreateForm(open => !open)}>
          {showCreateForm ? 'Close form' : '+ Add user'}
        </button>
      </div>
      {showCreateForm && (
        <CreateUserForm
          token={token}
          onCreated={handleUserCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}
      <div className="admin-player-layout">
        <section className="admin-panel admin-player-list">
          <label className="admin-search">
            <span>Search players</span>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Username or email"
              type="search"
            />
          </label>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead><tr><th>Player</th><th>Role</th><th>Chips</th><th>Joined</th><th>Status</th></tr></thead>
              <tbody>
                {players.map(item => (
                  <tr
                    key={item.id}
                    className={selectedId === item.id ? 'admin-selected-row' : ''}
                    onClick={() => setSelectedId(item.id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedId(item.id);
                    }}
                    tabIndex="0"
                    aria-selected={selectedId === item.id}
                  >
                    <td><strong>{item.username}</strong><small>{item.email}</small></td>
                    <td><span className={`admin-role-tag admin-role-${item.role}`}>{item.role}</span></td>
                    <td>{number(item.chips ?? 1000)}</td>
                    <td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}</td>
                    <td><span className="admin-status admin-status-active">Active</span></td>
                  </tr>
                ))}
                {!players.length && (
                  <tr><td colSpan="5" className="admin-empty">{loading ? 'Loading players…' : message ? 'Unable to display player accounts.' : 'No player accounts found.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

        </section>

        <aside className="admin-panel admin-player-details">
          {selectedPlayer ? (
            <>
              <div className="admin-player-title">
                <div className="admin-avatar">{selectedPlayer.username.charAt(0).toUpperCase()}</div>
                <div><h2>{selectedPlayer.username}</h2><p>{selectedPlayer.email}</p></div>
              </div>
              <div className="admin-player-chips">
                <span>Chips balance</span>
                <strong>{number(selectedPlayer.chips ?? 1000)} chips</strong>
              </div>
              <label className="admin-field">
                Role
                <select value={selectedRole} onChange={event => setSelectedRole(event.target.value)} disabled={isSelf}>
                  <option value="player">Player</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <p className="admin-permission-note">
                Admins can assign account roles and view operations. Dealers remain automated and cannot be assigned as account roles.
              </p>
              {isSelf && <p className="admin-footnote">For safety, you cannot remove your own admin role or delete your own account.</p>}
              <button className="primary wide" onClick={saveRole} disabled={selectedRole === selectedPlayer.role}>
                Save role
              </button>
              <button type="button" className="wide admin-grant-chips" onClick={giveChips} disabled={grantingChips}>
                {grantingChips ? 'Giving chips…' : 'Give 1,000 chips'}
              </button>
              <button type="button" className="wide admin-delete-player" onClick={deleteSelectedPlayer} disabled={isSelf || deletingPlayer}>
                {deletingPlayer ? 'Deleting…' : 'Delete account'}
              </button>
              {selectedPlayer.createdAt && (
                <p className="admin-account-date">Joined {new Date(selectedPlayer.createdAt).toLocaleDateString()}</p>
              )}
            </>
          ) : (
            <p className="admin-empty">Select a player to view account roles and permissions.</p>
          )}
        </aside>
      </div>
      {message && <p className="admin-feedback" role="status">{message}</p>}
    </>
  );
}

export default function AdminDashboard({ player, onLogout }) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOverview(await adminRequest(player.token, '/overview'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [player.token]);

  useEffect(() => {
    loadOverview();
    const interval = setInterval(loadOverview, 30000);
    return () => clearInterval(interval);
  }, [loadOverview]);

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="admin-brand" href="#" onClick={event => event.preventDefault()}>
          <span aria-hidden="true">♠</span> 21 CLUB
        </a>
        <nav className="admin-nav" aria-label="Admin navigation">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
          <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>Players</button>
          <button className={tab === 'ads' ? 'active' : ''} onClick={() => setTab('ads')}>Ad revenue</button>
        </nav>
        <div className="admin-topbar-user">
          <span>{player.name}</span>
          <button onClick={onLogout}>Log out</button>
        </div>
      </header>

      <main className="admin-main">
        {error && <p className="admin-error" role="alert">{error}</p>}
        {tab === 'overview' && <Overview token={player.token} overview={overview} loading={loading} onRefresh={loadOverview} />}
        {tab === 'players' && <PlayerManagement token={player.token} adminId={player.id} />}
        {tab === 'ads' && <AdRevenue token={player.token} />}
      </main>
    </div>
  );
}
