// Every browser gets a random id so the server can hold seats for guests too.
// Stored in localStorage, so tabs in the same browser are the same player
// (use a private window to test as a second player).
const KEY = '21club.clientId';
let memoryId = null;

function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

export function getClientId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: keep one id for this page load
    memoryId ??= randomId();
    return memoryId;
  }
}
