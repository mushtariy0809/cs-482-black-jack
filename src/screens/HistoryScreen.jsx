import React, { useEffect, useState } from 'react';
import './history.css';

const RESULT_LABELS = {
  win: 'Win',
  loss: 'Loss',
  push: 'Tie'
};

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
}

// Game history for a registered player
export default function HistoryScreen({ player, onBack }) {
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

  const wins = history.filter(item => item.result === 'win').length;
  const losses = history.filter(item => item.result === 'loss').length;
  const ties = history.filter(item => item.result === 'push').length;

  return (
    <div className="history-page">
      <div className="history-heading">
        <div>
          <span className="history-eyebrow">YOUR TABLE RECORD</span>
          <h1>Game history</h1>
          <p>Every hand tells a story, {player.name}.</p>
        </div>
        <span className="history-total">{history.length} {history.length === 1 ? 'hand' : 'hands'}</span>
      </div>

      <section className="history-summary" aria-label="Game results summary">
        <article className="history-stat">
          <span>Wins</span>
          <strong>{wins}</strong>
        </article>
        <article className="history-stat">
          <span>Losses</span>
          <strong>{losses}</strong>
        </article>
        <article className="history-stat">
          <span>Ties</span>
          <strong>{ties}</strong>
        </article>
      </section>

      <section className="history-section" aria-labelledby="history-recent-title">
        <div className="history-section-heading">
          <h2 id="history-recent-title">Recent hands</h2>
          {!loading && !error && history.length > 0 && (
            <span>Newest first</span>
          )}
        </div>

        {loading ? (
          <div className="history-message" role="status">Loading your games…</div>
        ) : error ? (
          <div className="history-message history-error" role="alert">{error}</div>
        ) : history.length === 0 ? (
          <div className="history-message history-empty">
            <span className="history-empty-mark" aria-hidden="true">♠</span>
            <h3>No hands played yet</h3>
            <p>Your completed games will show up here.</p>
          </div>
        ) : (
          <ol className="history-list">
            {history.map((item, index) => (
              <li className="history-item" key={item._id}>
                <span className={`history-result-icon history-result-${item.result}`} aria-hidden="true">
                  {item.result === 'win' ? '♠' : item.result === 'loss' ? '♣' : '♦'}
                </span>
                <div className="history-result-copy">
                  <strong className={`history-result-label history-result-${item.result}`}>
                    {RESULT_LABELS[item.result] || 'Game'}
                  </strong>
                  <span>Hand {history.length - index}</span>
                </div>
                <div className="history-scores" aria-label={`You ${item.playerScore}, dealer ${item.dealerScore}`}>
                  <div><span>You</span><strong>{item.playerScore}</strong></div>
                  <span className="history-versus">vs</span>
                  <div><span>Dealer</span><strong>{item.dealerScore}</strong></div>
                </div>
                <time className="history-date" dateTime={item.createdAt}>
                  {formatDate(item.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
