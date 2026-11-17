const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const AdView = require('../models/AdView');
const AdEvent = require('../models/AdEvent');
const { AdCatalog } = require('../realtime/adCatalog');
const {
  getAdSummary,
  createAd,
  updateAd,
  uploadAdMedia,
  mp4DurationMs,
  rangeStart,
  UPLOAD_DIR
} = require('../controllers/adminAdsController');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

const SAMPLE_VIDEO = path.join(__dirname, '..', '..', 'public', 'assets', 'ads', 'videos', 'spark-social.mp4');

test('reads the length of an MP4 from the file itself', () => {
  assert.equal(mp4DurationMs(fs.readFileSync(SAMPLE_VIDEO)), 15000);
  assert.equal(mp4DurationMs(Buffer.from('not a video')), null);
});

test('date ranges start at midnight', () => {
  const now = new Date(2026, 10, 17, 15, 30);
  assert.equal(rangeStart('today', now).getTime(), new Date(2026, 10, 17).getTime());
  assert.equal(rangeStart('7d', now).getTime(), new Date(2026, 10, 11).getTime());
  assert.equal(rangeStart('all', now).getTime(), 0);
});

test('summary adds up video views, banner impressions, clicks and chips for the range', async t => {
  let viewMatch = null;
  t.mock.method(AdView, 'aggregate', async pipeline => {
    viewMatch = pipeline[0].$match;
    return [
      { _id: { adId: 'spark-social', status: 'completed' }, count: 3, chips: 300 },
      { _id: { adId: 'spark-social', status: 'abandoned' }, count: 1, chips: 0 },
      { _id: { adId: 'daybreak-coffee', status: 'started' }, count: 1, chips: 0 }
    ];
  });
  t.mock.method(AdEvent, 'aggregate', async () => [
    { _id: { adId: 'shareair', type: 'impression', placement: 'lobby' }, count: 40 },
    { _id: { adId: 'shareair', type: 'impression', placement: 'table' }, count: 10 },
    { _id: { adId: 'shareair', type: 'click', placement: 'lobby' }, count: 5 },
    { _id: { adId: 'spark-social', type: 'click', placement: 'video' }, count: 2 }
  ]);

  const res = response();
  await getAdSummary({ query: { range: 'today' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.range, 'today');
  assert.ok(viewMatch.startedAt.$gte instanceof Date);
  assert.deepEqual(res.body.totals, {
    videoStarted: 5,
    videoFinished: 3,
    videoClosedEarly: 1,
    bannerImpressions: 50,
    bannerClicks: 5,
    videoClicks: 2,
    chipsPaid: 300,
    clicks: 7,
    finishRate: 60,
    bannerClickRate: 10
  });
  assert.deepEqual(res.body.perAd['spark-social'], { started: 4, finished: 3, closedEarly: 1, impressions: 0, clicks: 2 });
  assert.equal(res.body.perAd.shareair.impressions, 50);
});

test('an unknown range falls back to the last 7 days', async t => {
  t.mock.method(AdView, 'aggregate', async () => []);
  t.mock.method(AdEvent, 'aggregate', async () => []);
  const res = response();
  await getAdSummary({ query: { range: 'forever' } }, res);
  assert.equal(res.body.range, '7d');
  assert.equal(res.body.totals.finishRate, 0);
});

test('uploading a video saves it and reports its length; other files are refused', async t => {
  const video = fs.readFileSync(SAMPLE_VIDEO);
  const written = [];
  t.mock.method(fs.promises, 'mkdir', async () => {});
  t.mock.method(fs.promises, 'writeFile', async (file, body) => written.push({ file, size: body.length }));

  const res = response();
  await uploadAdMedia({ get: () => 'video/mp4', body: video }, res);
  assert.equal(res.statusCode, 201);
  assert.match(res.body.url, /^\/uploads\/ads\/[0-9a-f]{16}\.mp4$/);
  assert.equal(res.body.durationMs, 15000);
  assert.equal(written[0].file, path.join(UPLOAD_DIR, path.basename(res.body.url)));

  const wrongType = response();
  await uploadAdMedia({ get: () => 'application/pdf', body: Buffer.from('%PDF') }, wrongType);
  assert.equal(wrongType.statusCode, 400);

  const notMp4 = response();
  await uploadAdMedia({ get: () => 'video/mp4', body: Buffer.from('nope') }, notMp4);
  assert.equal(notMp4.statusCode, 400);
  assert.match(notMp4.body.message, /not a playable MP4/);
});

test('creating, editing and archiving ads goes through the catalog', async t => {
  const catalog = new AdCatalog();
  const req = body => ({ app: { locals: { adCatalog: catalog } }, body, params: {} });

  t.mock.method(fs.promises, 'readFile', async () => fs.readFileSync(SAMPLE_VIDEO));
  const created = response();
  await createAd(req({ kind: 'video', sponsor: 'Lucky', headline: 'Hi', mediaUrl: '/uploads/ads/abc123.mp4', durationMs: 1 }), created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.durationMs, 15000, 'uploaded videos use the length read on the server');

  const bad = response();
  await createAd(req({ kind: 'banner', sponsor: 'X', headline: 'Y', mediaUrl: 'ftp://nope' }), bad);
  assert.equal(bad.statusCode, 400);

  const archived = response();
  await updateAd({ ...req({ status: 'archived' }), params: { adId: created.body.id } }, archived);
  assert.equal(archived.body.status, 'archived');

  const missing = response();
  await updateAd({ ...req({ status: 'archived' }), params: { adId: 'nope' } }, missing);
  assert.equal(missing.statusCode, 404);
});
