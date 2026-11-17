const crypto = require('crypto');
const EventEmitter = require('events');
const { BUILT_IN_ADS, MIN_VIDEO_MS, MAX_VIDEO_MS } = require('../../shared/ads.js');

// Every ad players can see (A4): video ads (watched for chips) and banner ads
// (lobby + table column). Admins add, edit, archive and restore them in the
// Ad revenue tab. Archived ads stop showing but keep their stats.
//
// Kept in memory (players read it constantly) and saved through persist.save(ad).
// Emits 'changed' after every change so the server can send the new list to players.

const KINDS = ['video', 'banner'];
const STATUSES = ['active', 'archived'];
// Built-in clips in public/assets, files uploaded by an admin, or a full http(s) URL
const LOCAL_MEDIA = /^\/(assets|uploads)\/ads\/[\w./-]+\.(mp4|png|jpe?g|webp)$/i;

class AdError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function text(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

// The fields an admin may set, checked and cleaned. kind is fixed once the ad exists.
function cleanFields(input, { kind, creating }) {
  const out = {};

  if (creating || input.sponsor !== undefined) {
    out.sponsor = text(input.sponsor, 40);
    if (!out.sponsor) throw new AdError('invalid_ad', 'Enter the sponsor name.');
  }
  if (creating || input.headline !== undefined) {
    out.headline = text(input.headline, 60);
    if (!out.headline) throw new AdError('invalid_ad', 'Enter a headline.');
  }
  if (creating || input.tagline !== undefined) out.tagline = text(input.tagline, 120);
  if (creating || input.shortTitle !== undefined) out.shortTitle = text(input.shortTitle, 30);

  if (creating || input.link !== undefined) {
    out.link = String(input.link ?? '').trim().slice(0, 500);
    if (out.link && !isHttpUrl(out.link)) {
      throw new AdError('invalid_link', 'The link must start with https:// or http://');
    }
  }

  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new AdError('invalid_ad', 'Status must be active or archived.');
    out.status = input.status;
  }

  if (creating) {
    out.mediaUrl = String(input.mediaUrl ?? '').trim();
    if (!LOCAL_MEDIA.test(out.mediaUrl) && !isHttpUrl(out.mediaUrl)) {
      throw new AdError('invalid_media', kind === 'video' ? 'Upload an MP4 or paste a video link.' : 'Upload an image or paste an image link.');
    }
    out.posterUrl = String(input.posterUrl ?? '').trim();
    if (out.posterUrl && !LOCAL_MEDIA.test(out.posterUrl) && !isHttpUrl(out.posterUrl)) out.posterUrl = '';

    out.durationMs = 0;
    if (kind === 'video') {
      const duration = Math.round(Number(input.durationMs));
      if (!Number.isFinite(duration) || duration < MIN_VIDEO_MS || duration > MAX_VIDEO_MS) {
        throw new AdError('invalid_duration', `Video ads must be ${MIN_VIDEO_MS / 1000} to ${MAX_VIDEO_MS / 1000} seconds long.`);
      }
      out.durationMs = duration;
    }
  }

  return out;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'ad';
}

// What players' browsers get (active ads only)
function publicAd(ad) {
  return {
    id: ad.id,
    kind: ad.kind,
    sponsor: ad.sponsor,
    headline: ad.headline,
    tagline: ad.tagline,
    shortTitle: ad.shortTitle,
    mediaUrl: ad.mediaUrl,
    posterUrl: ad.posterUrl,
    link: ad.link,
    durationMs: ad.durationMs
  };
}

class AdCatalog extends EventEmitter {
  // persist: { save(ad) } and may return a promise
  constructor({ persist = {}, now = Date.now } = {}) {
    super();
    this.persist = persist;
    this.now = now;
    this.ads = new Map();
    // Tests and a fresh database start with the built-in ads
    for (const ad of BUILT_IN_ADS) this._put({ ...ad, status: 'active', builtIn: true, createdAt: new Date(0) });
  }

  // Ads saved in the database replace the defaults. Built-ins missing from the
  // database (a fresh install) are saved so admins can manage them too.
  load(docs) {
    for (const doc of docs) {
      const ad = { ...doc, id: String(doc._id ?? doc.id) };
      delete ad._id;
      delete ad.__v;
      this._put(ad);
    }
    const saved = new Set(docs.map(doc => String(doc._id ?? doc.id)));
    for (const ad of this.ads.values()) {
      if (!saved.has(ad.id)) this._save(ad);
    }
  }

  // Newest first, built-ins last
  all() {
    return [...this.ads.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  find(id) {
    return this.ads.get(String(id)) ?? null;
  }

  active(kind) {
    return this.all().filter(ad => ad.status === 'active' && (!kind || ad.kind === kind));
  }

  publicList() {
    return this.active().map(publicAd);
  }

  create(input = {}) {
    const kind = input.kind;
    if (!KINDS.includes(kind)) throw new AdError('invalid_ad', 'Choose a video ad or a banner ad.');

    const fields = cleanFields(input, { kind, creating: true });
    let id = `${slug(fields.sponsor)}-${crypto.randomBytes(3).toString('hex')}`;
    while (this.ads.has(id)) id = `${slug(fields.sponsor)}-${crypto.randomBytes(3).toString('hex')}`;

    const ad = { id, kind, ...fields, status: 'active', builtIn: false, createdAt: new Date(this.now()) };
    this._put(ad);
    this._save(ad);
    this.emit('changed');
    return ad;
  }

  // Text, link and status (archive / restore). The video or image itself can't be swapped:
  // add a new ad and archive the old one, so each ad's stats stay about one piece of media.
  update(id, input = {}) {
    const ad = this.find(id);
    if (!ad) throw new AdError('not_found', 'That ad no longer exists.');

    Object.assign(ad, cleanFields(input, { kind: ad.kind, creating: false }));
    this._save(ad);
    this.emit('changed');
    return ad;
  }

  _put(ad) {
    this.ads.set(ad.id, ad);
  }

  _save(ad) {
    Promise.resolve(this.persist.save?.({ ...ad }))
      .catch(error => console.error('Ad save failed:', error.message));
  }
}

module.exports = { AdCatalog, AdError, publicAd };
