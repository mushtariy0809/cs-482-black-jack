import React, { useEffect, useState } from 'react';

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
