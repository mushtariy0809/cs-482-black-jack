import { useEffect, useState } from 'react';
import { findAd } from '../../shared/ads.js';
import { abandonAd, completeAd, getAdStatus, startAd, useTables } from '../realtime/useTables.js';

// U21 "Watch ads" for free chips. The server owns the limits (5 a day, 30s apart)
// and pays the reward; this hook keeps the status and the ad being watched.
//
// identity: changes when the player logs in or out (limits are per account / per guest browser)
// onReward(result): result is { reward, seatChips }; seatChips is set when the server
// already added the chips to a multiplayer seat.
export function useVideoAds({ enabled, identity, onReward }) {
  const { connection } = useTables();
  // { reward, perDay, watchedToday, remaining, nextAt }
  const [status, setStatus] = useState(null);
  // { viewId, ad, durationMs } while the player is open
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    const result = await getAdStatus();
    if (result.ok) setStatus(result.status);
  }

  useEffect(() => {
    if (enabled && connection !== 'connecting') refresh();
  }, [enabled, identity, connection]);

  // Resolves to an error message, or null when the ad player opened
  async function open() {
    setError('');
    const result = await startAd();
    if (!result.ok) {
      setError(result.message);
      refresh();
      return result.message;
    }
    setStatus(result.status);
    setSession({ viewId: result.viewId, ad: findAd(result.adId), durationMs: result.durationMs });
    return null;
  }

  // The video ended: ask the server for the chips
  async function finish() {
    const result = await completeAd(session.viewId);
    if (result.ok) {
      setStatus(result.status);
      onReward(result);
    }
    return result;
  }

  // abandoned: closed before the end (no chips)
  function close({ abandoned }) {
    if (abandoned && session) {
      abandonAd(session.viewId).then(result => {
        if (result.ok) setStatus(result.status);
      });
    }
    setSession(null);
  }

  return { status, session, error, open, finish, close, clearError: () => setError('') };
}

// What the ad buttons should say right now: { ready, label, waitMs }
export function adAvailability(status, now) {
  if (!status) return { ready: false, label: 'Free chips', waitMs: 0 };
  if (status.remaining === 0) return { ready: false, label: 'No more ads today', waitMs: 0 };
  const waitMs = status.nextAt ? status.nextAt - now : 0;
  if (waitMs > 0) return { ready: false, label: `Next ad in ${Math.ceil(waitMs / 1000)}s`, waitMs };
  return { ready: true, label: `Watch ad +${status.reward}`, waitMs: 0 };
}

// Re-renders every second while a cooldown is running
export function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
