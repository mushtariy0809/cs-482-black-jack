import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cancelOnBackdrop, useDialogFocus } from '../components/useDismiss.js';
import { fetchFriends } from '../friends/friendsApi.js';
import { LockIcon } from '../lobby/tableInfo.jsx';
import { getInviteInfo, inviteFriend } from '../realtime/useTables.js';
import { canShare, copyText, inviteUrl, shareInvite } from './inviteLink.js';
import './invite.css';

// "Invite friends" at the table (U1): copy the link or code, open the share sheet,
// or send an in-app invite to someone on your friends list.
// pin: the PIN this player picked when creating the table ('' if unknown).

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(null);

  async function copy() {
    setCopied(await copyText(text));
    setTimeout(() => setCopied(null), 1800);
  }

  let shown = label;
  if (copied === true) shown = 'Copied ✓';
  if (copied === false) shown = 'Copy failed';

  return (
    <button type="button" className="invite-copy" onClick={copy} aria-live="polite">
      {shown}
    </button>
  );
}

// One friend and their invite state: idle | sending | online | offline | error
function FriendInviteRow({ friend, status, onInvite }) {
  const sent = status?.state === 'online' || status?.state === 'offline';
  const sentText = status?.state === 'online' ? 'Invite sent' : 'Sent · they’ll see it in their lobby';

  return (
    <li className="invite-friend">
      <span className="invite-friend-avatar" aria-hidden="true">{friend.username.charAt(0).toUpperCase()}</span>
      <span className="invite-friend-name">
        {friend.username}
        {status?.state === 'error' && <span className="form-error">{status.message}</span>}
        {sent && <span className="invite-friend-sent">{sentText}</span>}
      </span>
      <button
        type="button"
        className={sent ? '' : 'primary'}
        disabled={status?.state === 'sending' || sent}
        onClick={() => onInvite(friend)}
      >
        {status?.state === 'sending' ? 'Sending…' : sent ? 'Invited' : 'Invite'}
      </button>
    </li>
  );
}

function FriendsSection({ player }) {
  const [friends, setFriends] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetchFriends(player.id)
      .then(data => !cancelled && setFriends(data.friends ?? []))
      .catch(error => !cancelled && setLoadError(error.message));
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  async function invite(friend) {
    const set = status => setStatuses(current => ({ ...current, [friend._id]: status }));
    set({ state: 'sending' });
    const result = await inviteFriend(friend._id);
    if (result.ok) set({ state: result.online ? 'online' : 'offline' });
    else set({ state: 'error', message: result.message });
  }

  let body;
  if (loadError) body = <p className="form-error">{loadError}</p>;
  else if (!friends) body = <p className="invite-muted">Loading friends…</p>;
  else if (friends.length === 0) body = <p className="invite-muted">No friends yet. Add some from Profile → Friends.</p>;
  else {
    body = (
      <ul className="invite-friends">
        {friends.map(friend => (
          <FriendInviteRow key={friend._id} friend={friend} status={statuses[friend._id]} onInvite={invite} />
        ))}
      </ul>
    );
  }

  return (
    <section className="invite-section" aria-labelledby="invite-friends-title">
      <h3 id="invite-friends-title">Your friends</h3>
      {body}
    </section>
  );
}

export default function InvitePanel({ table, player, pin = '', onClose }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const closeButton = useDialogFocus(onClose);
  const registered = player?.type === 'registered';

  useEffect(() => {
    getInviteInfo().then(result => {
      if (result.ok) setInfo(result);
      else setError(result.message);
    });
  }, []);

  const url = info ? inviteUrl(info.inviteCode) : '';
  const isPrivate = info?.visibility === 'private';
  const openSeats = Math.max(0, (table.maxSeats ?? 0) - (table.players ?? 0));

  async function share() {
    setShareFailed(false);
    const ok = await shareInvite({ tableName: info.tableName, url });
    if (!ok) setShareFailed(true);
  }

  return (
    <motion.div
      className="leave-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={cancelOnBackdrop(onClose)}
    >
      <motion.div
        className="panel invite-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 14 }}
      >
        <div className="invite-head">
          <div>
            <span className="eyebrow">
              {isPrivate && <LockIcon />} {isPrivate ? 'PRIVATE TABLE' : 'INVITE FRIENDS'}
            </span>
            <h2 id="invite-title">{table.name}</h2>
            <p className="invite-muted">
              {openSeats === 1 ? '1 seat open' : `${openSeats} seats open`}
              {isPrivate ? ' · hidden from the lobby' : ' · also listed in the lobby'}
            </p>
          </div>
          <button ref={closeButton} type="button" className="invite-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {!info && !error && <p className="invite-muted">Getting your invite link…</p>}

        {info && (
          <>
            <section className="invite-section" aria-label="Invite link">
              <h3>Invite link</h3>
              <div className="invite-link-row">
                <input readOnly value={url} aria-label="Invite link" onFocus={event => event.target.select()} />
                <CopyButton text={url} label="Copy link" />
              </div>

              <div className="invite-code-row">
                <span className="invite-muted">or share the code</span>
                <strong className="invite-code" aria-label={`Invite code ${info.inviteCode.split('').join(' ')}`}>
                  {info.inviteCode}
                </strong>
                <CopyButton text={info.inviteCode} label="Copy code" />
              </div>

              {canShare() && (
                <button type="button" className="wide invite-share" onClick={share}>Share…</button>
              )}
              {shareFailed && <p className="invite-muted">Sharing didn’t go through. Copy the link instead.</p>}
            </section>

            {info.hasPin && (
              <p className="invite-pin" role="note">
                <LockIcon /> This table needs a PIN.{' '}
                {pin ? (
                  <>
                    Yours is <strong className="invite-pin-value">{showPin ? pin : '•'.repeat(pin.length)}</strong>
                    <button type="button" className="invite-pin-toggle" onClick={() => setShowPin(!showPin)}>
                      {showPin ? 'Hide' : 'Show'}
                    </button>
                    — send it to friends separately from the link.
                  </>
                ) : (
                  'Ask the table creator for it.'
                )}
              </p>
            )}

            {registered ? (
              <FriendsSection player={player} />
            ) : (
              <p className="invite-muted invite-guest">Log in to invite people from your friends list.</p>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
