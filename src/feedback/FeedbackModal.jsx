import React, { useState } from 'react';

export default function FeedbackModal({ player, onClose }) {
  const [view, setView] = useState('new');
  const [title, setTitle] = useState('');
  const [importance, setImportance] = useState('medium');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketError, setTicketError] = useState('');

  const selectedTicket = tickets.find(ticket => ticket._id === selectedTicketId) ?? null;

  async function showMyFeedback() {
    setView('mine');
    setTicketError('');
    setLoadingTickets(true);

    try {
      const response = await fetch('http://localhost:5000/api/feedback/mine', {
        headers: { Authorization: `Bearer ${player.token}` }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load your feedback.');
      }

      setTickets(data);
      setSelectedTicketId(current => (
        data.some(ticket => ticket._id === current) ? current : (data[0]?._id ?? '')
      ));
    } catch (requestError) {
      setTicketError(requestError.message);
    } finally {
      setLoadingTickets(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSending(true);

    try {
      const response = await fetch('http://localhost:5000/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${player.token}`
        },
        body: JSON.stringify({ title, importance, description })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to send feedback.');
      }

      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="feedback-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
      >
        <button className="feedback-close" type="button" onClick={onClose} aria-label="Close feedback form">
          ×
        </button>
        <p className="feedback-eyebrow">PLAYER SUPPORT</p>
        <h2 id="feedback-dialog-title">{view === 'new' ? 'Send feedback' : 'My feedback'}</h2>
        <div className="feedback-tabs" role="tablist" aria-label="Feedback options">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'new'}
            className={view === 'new' ? 'active' : ''}
            onClick={() => setView('new')}
          >
            New ticket
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'mine'}
            className={view === 'mine' ? 'active' : ''}
            onClick={showMyFeedback}
          >
            My tickets
          </button>
        </div>
        {view === 'mine' ? (
          <section className="feedback-history" aria-label="Your feedback tickets">
            {ticketError && <p className="feedback-form-error" role="alert">{ticketError}</p>}
            {loadingTickets ? (
              <p className="feedback-history-empty">Loading your tickets…</p>
            ) : tickets.length ? (
              <>
                <div className="feedback-history-list">
                  {tickets.map(ticket => (
                    <button
                      type="button"
                      key={ticket._id}
                      className={ticket._id === selectedTicketId ? 'active' : ''}
                      onClick={() => setSelectedTicketId(ticket._id)}
                    >
                      <strong>{ticket.title}</strong>
                      <span>{ticket.status} · {ticket.importance} importance</span>
                    </button>
                  ))}
                </div>
                {selectedTicket && (
                  <div className="feedback-history-detail">
                    <p className="feedback-history-description">{selectedTicket.description}</p>
                    {(selectedTicket.replies || []).map((item, index) => (
                      <article className="feedback-history-reply" key={`${item.createdAt}-${index}`}>
                        <strong>{item.senderRole === 'admin' ? 'ADMIN' : 'You'}</strong>
                        <p>{item.message}</p>
                      </article>
                    ))}
                    {!selectedTicket.replies?.length && (
                      <p className="feedback-history-empty">The admin has not replied yet.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="feedback-history-empty">You haven’t submitted any tickets yet.</p>
            )}
          </section>
        ) : submitted ? (
          <div className="feedback-success">
            <span className="feedback-success-mark" aria-hidden="true">✓</span>
            <h3>Thanks for reaching out.</h3>
            <p>Your feedback was sent to the admin team.</p>
            <button className="primary wide" type="button" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <p className="feedback-intro">Tell us what happened or how we can make the game better.</p>
            <form onSubmit={submit}>
              <label>
                Title
                <input
                  autoFocus
                  required
                  maxLength="120"
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="A short summary"
                />
              </label>
              <label>
                Importance
                <select value={importance} onChange={event => setImportance(event.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Description
                <textarea
                  required
                  maxLength="5000"
                  rows="5"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  placeholder="Share the details with the admin..."
                />
              </label>
              {error && <p className="feedback-form-error" role="alert">{error}</p>}
              <button className="primary wide feedback-submit" type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Send to admin'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
