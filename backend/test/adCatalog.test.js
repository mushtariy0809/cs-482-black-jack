const test = require('node:test');
const assert = require('node:assert/strict');
const { AdCatalog } = require('../realtime/adCatalog');
const { BUILT_IN_ADS } = require('../../shared/ads.js');

const video = {
  kind: 'video',
  sponsor: 'Lucky Sneakers',
  headline: 'Run the table.',
  tagline: 'New colors this week.',
  mediaUrl: 'https://cdn.example.com/sneakers.mp4',
  durationMs: 15000,
  link: 'https://example.com/sneakers'
};

test('starts with the built-in videos and banners, all active', () => {
  const catalog = new AdCatalog();
  assert.equal(catalog.publicList().length, BUILT_IN_ADS.length);
  assert.equal(catalog.active('video').length, 4);
  assert.equal(catalog.active('banner').length, 2);
});

test('saved ads replace the defaults; built-ins missing from the database get saved', () => {
  const saved = [];
  const catalog = new AdCatalog({ persist: { save: ad => saved.push(ad.id) } });
  catalog.load([{ _id: 'shareair', ...BUILT_IN_ADS.find(ad => ad.id === 'shareair'), status: 'archived' }]);

  assert.equal(catalog.find('shareair').status, 'archived');
  assert.ok(!catalog.publicList().some(ad => ad.id === 'shareair'));
  assert.equal(saved.length, BUILT_IN_ADS.length - 1);
});

test('admins add ads; bad links, media and lengths are refused', () => {
  const catalog = new AdCatalog();
  const changes = [];
  catalog.on('changed', () => changes.push(1));

  const ad = catalog.create(video);
  assert.match(ad.id, /^lucky-sneakers-[0-9a-f]{6}$/);
  assert.equal(catalog.active('video')[0].id, ad.id, 'newest first');
  assert.equal(changes.length, 1);

  assert.throws(() => catalog.create({ ...video, link: 'javascript:alert(1)' }), { code: 'invalid_link' });
  assert.throws(() => catalog.create({ ...video, mediaUrl: '/etc/passwd' }), { code: 'invalid_media' });
  assert.throws(() => catalog.create({ ...video, durationMs: 90000 }), { code: 'invalid_duration' });
  assert.throws(() => catalog.create({ ...video, sponsor: '  ' }), { code: 'invalid_ad' });
  assert.throws(() => catalog.create({ ...video, kind: 'popup' }), { code: 'invalid_ad' });
  assert.doesNotThrow(() => catalog.create({ kind: 'banner', sponsor: 'Cafe', headline: 'Coffee', mediaUrl: '/uploads/ads/abc123.png' }));
});

test('archiving hides an ad from players; restoring brings it back', () => {
  const catalog = new AdCatalog();
  catalog.update('spark-social', { status: 'archived', link: 'https://example.com/spark' });
  assert.ok(!catalog.publicList().some(ad => ad.id === 'spark-social'));
  assert.equal(catalog.find('spark-social').link, 'https://example.com/spark');

  catalog.update('spark-social', { status: 'active' });
  assert.ok(catalog.publicList().some(ad => ad.id === 'spark-social'));
  assert.throws(() => catalog.update('nope', { status: 'archived' }), { code: 'not_found' });
  assert.throws(() => catalog.update('spark-social', { status: 'deleted' }), { code: 'invalid_ad' });
});
