// Calls to the backend friends API (backend/routes/friends.js)
const FRIENDS_URL = 'http://localhost:5000/api/friends';

// { friends, friendRequests } for a player
export async function fetchFriends(playerId) {
  const response = await fetch(`${FRIENDS_URL}/${playerId}`);
  if (!response.ok) throw new Error('Could not load friends.');
  return response.json();
}

export async function searchPlayers(username) {
  const response = await fetch(`${FRIENDS_URL}/search?username=${encodeURIComponent(username)}`);
  if (!response.ok) throw new Error('Could not search for players.');
  return response.json();
}

// POST/DELETE an action (request, accept, decline, remove).
// Returns { ok, message } with the server's message, or `fallback` when it sent none.
export async function friendAction(action, body, fallback, method = 'POST') {
  const response = await fetch(`${FRIENDS_URL}/${action}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return { ok: response.ok, message: data.message || fallback };
}
