const crypto = require('crypto');
const { AD_REWARD, ADS_PER_DAY, AD_GAP_MS, AD_GRACE_MS } = require('../../shared/ads.js');
const { AdCatalog, publicAd } = require('./adCatalog');

// U21 "Watch ads": the server decides whether a player may watch another ad
// and pays the reward only once the whole video had time to play.
//
// Limits are per viewer: a logged-in player by account, a guest by browser (clientId).
// Every view is saved (persist.save) for the admin Ad revenue page (A4), and so are
// banner impressions and ad link clicks (persist.saveEvent).

// A started ad nobody finished within this time is dropped
const STALE_VIEW_MS = 10 * 60 * 1000;
// The same viewer seeing the same banner again this soon isn't a new impression
// (re-renders, quick back-and-forth between screens); same for double clicks
const IMPRESSION_GAP_MS = 60 * 1000;
const CLICK_GAP_MS = 3 * 1000;
const EVENT_TYPES = ['impression', 'click'];
const PLACEMENTS = ['lobby', 'table', 'video'];

class AdError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function startOfDay(ms) {
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function viewerOf(client) {
  return {
    key: client.playerId ? `player:${client.playerId}` : `client:${client.clientId}`,
    playerId: client.playerId ?? null,
    clientId: client.clientId
  };
}

class AdStore {
  // persist: { save(view), saveEvent(event) }, both may return a promise
  // catalog: the ads players can see (AdCatalog); defaults to the built-in ads
  constructor({ persist = {}, now = Date.now, catalog = new AdCatalog() } = {}) {
    this.persist = persist;
    this.now = now;
    this.catalog = catalog;
    // viewer key -> { watched: [finish times today], lastAdId, active: view | null }
    this.viewers = new Map();
    // "viewer|type|placement|adId" -> last time it was recorded
    this.recentEvents = new Map();
  }

  // Finished views from the database, so a restart doesn't reset today's limit
  load(views) {
    for (const view of views) {
      if (view.status !== 'completed' || !view.completedAt) continue;
      const entry = this._entry(view.viewerKey);
      entry.watched.push(new Date(view.completedAt).getTime());
      entry.watched.sort((a, b) => a - b);
      entry.lastAdId = view.adId;
    }
  }

  status(client) {
    const entry = this._entry(viewerOf(client).key);
    this._forgetYesterday(entry);

    const watchedToday = entry.watched.length;
    const last = entry.watched[watchedToday - 1];
    const gapEnds = last ? last + AD_GAP_MS : 0;

    let nextAt = null;
    if (watchedToday >= ADS_PER_DAY) nextAt = startOfDay(this.now()) + 24 * 60 * 60 * 1000;
    else if (gapEnds > this.now()) nextAt = gapEnds;

    return {
      reward: AD_REWARD,
      perDay: ADS_PER_DAY,
      watchedToday,
      remaining: Math.max(0, ADS_PER_DAY - watchedToday),
      nextAt
    };
  }

  // Starts a view. Picks the next ad in the rotation unless a valid adId is asked for.
  start(client, { adId } = {}) {
    const viewer = viewerOf(client);
    const status = this.status(client);

    if (status.remaining === 0) {
      throw new AdError('daily_limit', `That's all ${ADS_PER_DAY} ads for today. Come back tomorrow.`);
    }
    if (status.nextAt) {
      const seconds = Math.ceil((status.nextAt - this.now()) / 1000);
      throw new AdError('too_soon', `Next ad in ${seconds}s.`);
    }

    const entry = this._entry(viewer.key);
    const requested = this.catalog.find(adId);
    const ad = requested?.kind === 'video' && requested.status === 'active' ? requested : this._nextAd(entry.lastAdId);
    if (!ad) throw new AdError('no_ads', 'No video ads are available right now. Check back later.');
    if (entry.active) this._finish(entry.active, 'abandoned');

    const view = {
      viewId: crypto.randomBytes(8).toString('hex'),
      viewerKey: viewer.key,
      playerId: viewer.playerId,
      clientId: viewer.clientId,
      adId: ad.id,
      reward: 0,
      status: 'started',
      startedAt: new Date(this.now()),
      completedAt: null
    };
    entry.active = view;
    entry.lastAdId = ad.id;
    this._save(view);

    // The browser gets the ad itself, so a just-added ad plays even before its catalog updates
    return { viewId: view.viewId, adId: ad.id, durationMs: ad.durationMs, ad: publicAd(ad) };
  }

  // The video ended in the browser. Pays out if enough time really passed.
  complete(client, { viewId } = {}) {
    const entry = this._entry(viewerOf(client).key);
    const view = entry.active;

    if (!view || view.viewId !== viewId || this._isStale(view)) {
      throw new AdError('no_ad', 'That ad expired. Start a new one.');
    }

    // Still paid if an admin archived the ad while it was playing
    const durationMs = this.catalog.find(view.adId)?.durationMs ?? 0;
    const watchedMs = this.now() - view.startedAt.getTime();
    if (watchedMs < durationMs - AD_GRACE_MS) {
      throw new AdError('too_early', 'Watch the whole ad to get your chips.');
    }

    view.reward = AD_REWARD;
    this._finish(view, 'completed');
    entry.active = null;
    entry.watched.push(this.now());

    return { reward: AD_REWARD, status: this.status(client) };
  }

  // Closed early: no reward, and it doesn't count toward the limit
  abandon(client, { viewId } = {}) {
    const entry = this._entry(viewerOf(client).key);
    if (entry.active && entry.active.viewId === viewId) {
      this._finish(entry.active, 'abandoned');
      entry.active = null;
    }
    return { status: this.status(client) };
  }

  // A banner was shown, or an ad's link was clicked. Returns { recorded }:
  // false when it repeats one from a moment ago (not saved twice).
  track(client, { adId, type, placement } = {}) {
    if (!EVENT_TYPES.includes(type) || !PLACEMENTS.includes(placement)) {
      throw new AdError('invalid_event', 'Unknown ad event.');
    }
    const ad = this.catalog.find(adId);
    if (!ad) throw new AdError('no_ad', 'Unknown ad.');

    const viewer = viewerOf(client);
    const key = `${viewer.key}|${type}|${placement}|${ad.id}`;
    const last = this.recentEvents.get(key);
    const gap = type === 'impression' ? IMPRESSION_GAP_MS : CLICK_GAP_MS;
    if (last !== undefined && this.now() - last < gap) return { recorded: false };

    this.recentEvents.set(key, this.now());
    this._forgetOldEvents();
    Promise.resolve(this.persist.saveEvent?.({
      adId: ad.id,
      type,
      placement,
      viewerKey: viewer.key,
      createdAt: new Date(this.now())
    })).catch(error => console.error('Ad event save failed:', error.message));
    return { recorded: true };
  }

  // Keeps the repeat check from growing forever
  _forgetOldEvents() {
    if (this.recentEvents.size < 5000) return;
    const cutoff = this.now() - IMPRESSION_GAP_MS;
    for (const [key, time] of this.recentEvents) {
      if (time < cutoff) this.recentEvents.delete(key);
    }
  }

  // The next active video ad after the one this viewer saw last
  _nextAd(lastAdId) {
    const videos = this.catalog.active('video');
    if (videos.length === 0) return null;
    const last = videos.findIndex(ad => ad.id === lastAdId);
    return videos[(last + 1) % videos.length];
  }

  _entry(key) {
    if (!this.viewers.has(key)) this.viewers.set(key, { watched: [], lastAdId: null, active: null });
    return this.viewers.get(key);
  }

  _forgetYesterday(entry) {
    const today = startOfDay(this.now());
    entry.watched = entry.watched.filter(time => time >= today);
    if (entry.active && this._isStale(entry.active)) {
      this._finish(entry.active, 'abandoned');
      entry.active = null;
    }
  }

  _isStale(view) {
    return this.now() - view.startedAt.getTime() > STALE_VIEW_MS;
  }

  _finish(view, status) {
    view.status = status;
    view.completedAt = new Date(this.now());
    this._save(view);
  }

  _save(view) {
    Promise.resolve(this.persist.save?.({ ...view }))
      .catch(error => console.error('Ad view save failed:', error.message));
  }
}

module.exports = { AdStore, AdError, startOfDay };
