// Remembers the last table this browser sat at, for the lobby hero
const LAST_TABLE_KEY = '21club.lastTable';

export function readLastTable() {
  try {
    return localStorage.getItem(LAST_TABLE_KEY);
  } catch {
    return null;
  }
}

export function saveLastTable(tableId) {
  try {
    localStorage.setItem(LAST_TABLE_KEY, tableId);
  } catch {
    // Storage blocked: the hero just won't remember the table
  }
}
