import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest } from './adminApi.js';

function ticketNumber(ticket) {
  return String(ticket._id).slice(-6).toUpperCase();
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function FeedbackInbox({ token }) {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState('open');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminRequest(token, '/feedback');
      setTickets(result);
      setSelectedId(current => (
        result.some(ticket => ticket._id === current)
          ? current
          : (result.find(ticket => ticket.status === 'open')?._id ?? result[0]?._id ?? '')
      ));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const counts = useMemo(() => ({
    open: tickets.filter(ticket => ticket.status === 'open').length,
    resolved: tickets.filter(ticket => ticket.status === 'resolved').length
  }), [tickets]);
  const visibleTickets = tickets.filter(ticket => ticket.status === filter);
  const selectedTicket = visibleTickets.find(ticket => ticket._id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedTicket && visibleTickets.length) {
      setSelectedId(visibleTickets[0]._id);
    } else if (!visibleTickets.length) {
      setSelectedId('');
    }
  }, [selectedTicket, visibleTickets]);

  async function updateTicket(ticket, changes, confirmation) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await adminRequest(token, `/feedback/${ticket._id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes)
      });
      setTickets(current => current.map(item => item._id === updated._id ? updated : item));
      setReply('');
      setNotice(confirmation);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function sendReply(event) {
    event.preventDefault();
    if (!selectedTicket || !reply.trim()) return;
    updateTicket(selectedTicket, { reply }, 'Reply sent.');
  }

  return (
    <>
      <div className="admin-page-heading feedback-page-heading">
        <div>
          <h1>Player feedback</h1>
          <p>Review reports and suggestions from your players</p>
        </div>
        <button className="admin-quiet-button" onClick={loadTickets} disabled={loading}>
          {loading ? 'Updating…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-feedback" role="status">{notice}</p>}

      <div className="admin-feedback-layout">
        <section className="admin-panel admin-ticket-list-panel" aria-label="Feedback tickets">
          <div className="admin-feedback-filters" aria-label="Ticket status">
            <button
              className={filter === 'open' ? 'active' : ''}
              onClick={() => setFilter('open')}
              aria-pressed={filter === 'open'}
            >
              Open <span>{counts.open}</span>
            </button>
            <button
              className={filter === 'resolved' ? 'active' : ''}
              onClick={() => setFilter('resolved')}
              aria-pressed={filter === 'resolved'}
            >
              Resolved <span>{counts.resolved}</span>
            </button>
          </div>

          <div className="admin-ticket-list">
            {visibleTickets.map(ticket => (
              <button
                type="button"
                key={ticket._id}
                className={`admin-ticket-card ${ticket._id === selectedTicket?._id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedId(ticket._id);
                  setNotice('');
                }}
                aria-pressed={ticket._id === selectedTicket?._id}
              >
                <span className="admin-ticket-player">{ticket.submittedBy?.username ?? 'Player'}</span>
                <span className="admin-ticket-title">{ticket.title}</span>
                <span className="admin-ticket-meta">
                  <span className={`admin-importance admin-importance-${ticket.importance}`}>{ticket.importance}</span>
                  <span>{formatDate(ticket.createdAt)}</span>
                </span>
              </button>
            ))}
            {!visibleTickets.length && (
              <p className="admin-ticket-empty">
                {loading ? 'Loading feedback…' : filter === 'open' ? 'No open tickets. You’re all caught up.' : 'No resolved tickets yet.'}
              </p>
            )}
          </div>
        </section>

        <section className="admin-panel admin-ticket-detail" aria-label="Selected feedback">
          {selectedTicket ? (
            <>
              <div className="admin-ticket-detail-heading">
                <div>
                  <h2>{selectedTicket.title}</h2>
                  <div className="admin-ticket-badges">
                    <span className={`admin-status admin-ticket-status-${selectedTicket.status}`}>{selectedTicket.status}</span>
                    <span className={`admin-importance admin-importance-${selectedTicket.importance}`}>{selectedTicket.importance} importance</span>
                    <span className="admin-ticket-number">#{ticketNumber(selectedTicket)}</span>
                  </div>
                </div>
              </div>

              <div className="admin-ticket-thread">
                <article className="admin-ticket-message">
                  <div className="admin-ticket-message-meta">
                    <strong>{selectedTicket.submittedBy?.username ?? 'Player'}</strong>
                    <time>{formatDate(selectedTicket.createdAt)}</time>
                  </div>
                  <p>{selectedTicket.description}</p>
                </article>
                {(selectedTicket.replies || []).map((item, index) => (
                  <article
                    className={`admin-ticket-message ${item.senderRole === 'admin' ? 'admin-ticket-admin-message' : ''}`}
                    key={`${item.createdAt}-${index}`}
                  >
                    <div className="admin-ticket-message-meta">
                      <strong>{item.senderRole === 'admin' ? 'ADMIN' : item.sender?.username ?? 'Player'}</strong>
                      <time>{formatDate(item.createdAt)}</time>
                    </div>
                    <p>{item.message}</p>
                  </article>
                ))}
              </div>

              <form className="admin-ticket-reply-form" onSubmit={sendReply}>
                <label htmlFor="admin-feedback-reply">Reply to player</label>
                <textarea
                  id="admin-feedback-reply"
                  rows="3"
                  maxLength="2000"
                  value={reply}
                  onChange={event => setReply(event.target.value)}
                  placeholder="Write your reply..."
                />
                <div className="admin-ticket-actions">
                  <button className="primary" type="submit" disabled={saving || !reply.trim()}>
                    {saving ? 'Sending…' : 'Send reply'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => updateTicket(
                      selectedTicket,
                      { status: selectedTicket.status === 'open' ? 'resolved' : 'open' },
                      selectedTicket.status === 'open' ? 'Ticket marked resolved.' : 'Ticket reopened.'
                    )}
                  >
                    {selectedTicket.status === 'open' ? 'Mark resolved' : 'Reopen ticket'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="admin-ticket-detail-empty">
              <span aria-hidden="true">✦</span>
              <h2>{filter === 'open' ? 'You’re all caught up.' : 'No resolved feedback yet.'}</h2>
              <p>{filter === 'open' ? 'New player reports will appear here.' : 'Resolved tickets will be saved here.'}</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
