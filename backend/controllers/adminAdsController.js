const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const AdView = require('../models/AdView');
const AdEvent = require('../models/AdEvent');
const { MIN_VIDEO_MS, MAX_VIDEO_MS } = require('../../shared/ads.js');

// A4 Ad revenue (admin only, see routes/admin.js): totals for a date range,
// and managing the ads players see. The catalog lives in app.locals.adCatalog.

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'ads');
const MEDIA_TYPES = {
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'image/png': { ext: 'png', kind: 'banner' },
  'image/jpeg': { ext: 'jpg', kind: 'banner' },
  'image/webp': { ext: 'webp', kind: 'banner' }
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const RANGES = ['today', '7d', '30d', 'all'];

// Start of the range in server time (midnight today, 6 days before, 29 days before)
function rangeStart(range, now = new Date()) {
  if (range === 'all') return new Date(0);
  const days = { today: 0, '7d': 6, '30d': 29 }[range];
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
}

// Length of an MP4 from its "mvhd" box, in ms (null if it can't be read)
function mp4DurationMs(buffer) {
  const at = buffer.indexOf('mvhd');
  if (at < 0 || at + 32 > buffer.length) return null;
  const version = buffer[at + 4];
  const timescale = version === 1 ? buffer.readUInt32BE(at + 24) : buffer.readUInt32BE(at + 16);
  const duration = version === 1 ? Number(buffer.readBigUInt64BE(at + 28)) : buffer.readUInt32BE(at + 20);
  if (!timescale || !duration) return null;
  return Math.round((duration / timescale) * 1000);
}

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function catalogOf(req) {
  return req.app.locals.adCatalog;
}

function sendError(res, error, fallback) {
  if (error.code) {
    return res.status(error.code === 'not_found' ? 404 : 400).json({ message: error.message, code: error.code });
  }
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
}

// GET /api/admin/ads/summary?range=today|7d|30d|all
async function getAdSummary(req, res) {
  try {
    const range = RANGES.includes(req.query?.range) ? req.query.range : '7d';
    const since = rangeStart(range);

    const [viewRows, eventRows] = await Promise.all([
      AdView.aggregate([
        { $match: { startedAt: { $gte: since } } },
        { $group: { _id: { adId: '$adId', status: '$status' }, count: { $sum: 1 }, chips: { $sum: '$reward' } } }
      ]),
      AdEvent.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { adId: '$adId', type: '$type', placement: '$placement' }, count: { $sum: 1 } } }
      ])
    ]);

    const perAd = {};
    const statsFor = adId => {
      perAd[adId] ??= { started: 0, finished: 0, closedEarly: 0, impressions: 0, clicks: 0 };
      return perAd[adId];
    };
    const totals = {
      videoStarted: 0,
      videoFinished: 0,
      videoClosedEarly: 0,
      bannerImpressions: 0,
      bannerClicks: 0,
      videoClicks: 0,
      chipsPaid: 0
    };

    for (const row of viewRows) {
      const stats = statsFor(row._id.adId);
      stats.started += row.count;
      totals.videoStarted += row.count;
      if (row._id.status === 'completed') {
        stats.finished += row.count;
        totals.videoFinished += row.count;
        totals.chipsPaid += row.chips;
      } else if (row._id.status === 'abandoned') {
        stats.closedEarly += row.count;
        totals.videoClosedEarly += row.count;
      }
    }

    for (const row of eventRows) {
      const stats = statsFor(row._id.adId);
      const isVideo = row._id.placement === 'video';
      if (row._id.type === 'impression') {
        stats.impressions += row.count;
        if (!isVideo) totals.bannerImpressions += row.count;
      } else {
        stats.clicks += row.count;
        if (isVideo) totals.videoClicks += row.count;
        else totals.bannerClicks += row.count;
      }
    }

    res.status(200).json({
      range,
      since,
      totals: {
        ...totals,
        clicks: totals.bannerClicks + totals.videoClicks,
        finishRate: percent(totals.videoFinished, totals.videoStarted),
        bannerClickRate: percent(totals.bannerClicks, totals.bannerImpressions)
      },
      perAd
    });
  } catch (error) {
    sendError(res, error, 'Unable to load ad revenue.');
  }
}

// GET /api/admin/ads (active and archived)
function listAds(req, res) {
  res.status(200).json(catalogOf(req).all());
}

// POST /api/admin/ads { kind, sponsor, headline, tagline?, shortTitle?, link?, mediaUrl, posterUrl?, durationMs? }
// For an uploaded video, the length is read from the file on the server.
async function createAd(req, res) {
  try {
    const input = { ...req.body };
    const uploaded = /^\/uploads\/ads\/([\w-]+\.mp4)$/.exec(String(input.mediaUrl ?? ''));
    if (input.kind === 'video' && uploaded) {
      const file = await fs.readFile(path.join(UPLOAD_DIR, uploaded[1]));
      input.durationMs = mp4DurationMs(file);
    }
    res.status(201).json(catalogOf(req).create(input));
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(400).json({ message: 'Upload the video again.' });
    sendError(res, error, 'Unable to save the ad.');
  }
}

// PATCH /api/admin/ads/:adId { sponsor?, headline?, tagline?, shortTitle?, link?, status? }
function updateAd(req, res) {
  try {
    res.status(200).json(catalogOf(req).update(req.params.adId, req.body ?? {}));
  } catch (error) {
    sendError(res, error, 'Unable to update the ad.');
  }
}

// POST /api/admin/ads/media  (raw body: an MP4 up to 50 MB, or a PNG/JPEG/WebP up to 5 MB)
// -> { url, kind, durationMs }
async function uploadAdMedia(req, res) {
  try {
    const type = MEDIA_TYPES[String(req.get('content-type') ?? '').split(';')[0].trim()];
    const body = req.body;
    if (!type || !Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ message: 'Upload an MP4 video or a PNG, JPEG or WebP image.' });
    }
    if (type.kind === 'banner' && body.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ message: 'Banner images can be up to 5 MB.' });
    }

    let durationMs = 0;
    if (type.kind === 'video') {
      durationMs = mp4DurationMs(body);
      if (!durationMs) return res.status(400).json({ message: 'That file is not a playable MP4 video.' });
      if (durationMs < MIN_VIDEO_MS || durationMs > MAX_VIDEO_MS) {
        return res.status(400).json({ message: `Video ads must be ${MIN_VIDEO_MS / 1000} to ${MAX_VIDEO_MS / 1000} seconds long.` });
      }
    }

    const name = `${crypto.randomBytes(8).toString('hex')}.${type.ext}`;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, name), body);
    res.status(201).json({ url: `/uploads/ads/${name}`, kind: type.kind, durationMs });
  } catch (error) {
    sendError(res, error, 'Unable to upload the file.');
  }
}

module.exports = {
  getAdSummary,
  listAds,
  createAd,
  updateAd,
  uploadAdMedia,
  mp4DurationMs,
  rangeStart,
  UPLOAD_DIR
};
