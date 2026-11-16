// Invite links (U1): https://<site>/?join=ABC123 opens the app and joins that table.

const PARAM = 'join';
const PENDING_KEY = '21club.pendingInvite';
const CODE_PATTERN = /^[A-Z2-9]{6}$/;

export function inviteUrl(inviteCode) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(PARAM, inviteCode);
  return url.toString();
}

// Reads ?join=CODE once and removes it from the address bar, so a refresh doesn't
// join again. The code is kept for this tab until the player has logged in.
export function takeInviteFromUrl() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get(PARAM)?.trim().toUpperCase();
    if (code) {
      url.searchParams.delete(PARAM);
      window.history.replaceState(null, '', url.toString());
      if (CODE_PATTERN.test(code)) sessionStorage.setItem(PENDING_KEY, code);
    }
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: nothing was saved
  }
}

// Copies text, falling back to a hidden textarea where the Clipboard API is blocked
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function canShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

// The phone/OS share sheet. Resolves to false if the player cancelled or sharing failed.
export async function shareInvite({ tableName, url }) {
  try {
    await navigator.share({
      title: '21 CLUB',
      text: `Pull up a chair at "${tableName}" on 21 CLUB.`,
      url
    });
    return true;
  } catch {
    return false;
  }
}
