const test = require('node:test');
const assert = require('node:assert/strict');
const { AdStore } = require('../realtime/adStore');
const { AD_REWARD, ADS_PER_DAY, AD_GAP_MS, VIDEO_ADS, findAd } = require('../../shared/ads.js');

const guest = { clientId: 'guest-0001' };
const player = { clientId: 'browser-01', playerId: 'player-1' };

// A store with a clock the test moves by hand. Starts at noon so a day boundary is far away.
function newAds() {
  const clock = { now: new Date(2026, 10, 16, 12, 0, 0).getTime() };
  const saved = [];
  const ads = new AdStore({ now: () => clock.now, persist: { save: view => saved.push(view) } });
  return { ads, clock, saved };
}

// Starts an ad and lets it play to the end
function watch(ads, clock, client) {
  const view = ads.start(client);
  clock.now += view.durationMs;
  return ads.complete(client, { viewId: view.viewId });
}

test('a finished ad pays the reward and is saved for ad revenue', () => {
  const { ads, clock, saved } = newAds();

  const result = watch(ads, clock, guest);

  assert.equal(result.reward, AD_REWARD);
  assert.equal(result.status.watchedToday, 1);
  assert.equal(result.status.remaining, ADS_PER_DAY - 1);
  assert.deepEqual(saved.map(v => v.status), ['started', 'completed']);
  assert.equal(saved[1].reward, AD_REWARD);
  assert.equal(saved[1].viewerKey, 'client:guest-0001');
});

test('closing an ad early pays nothing', () => {
  const { ads, clock } = newAds();
  const view = ads.start(guest);

  clock.now += 3000;
  assert.throws(() => ads.complete(guest, { viewId: view.viewId }), { code: 'too_early' });

  ads.abandon(guest, { viewId: view.viewId });
  assert.throws(() => ads.complete(guest, { viewId: view.viewId }), { code: 'no_ad' });
  assert.equal(ads.status(guest).watchedToday, 0, 'an abandoned ad does not count');
});

test('ads need a 30 second break between them', () => {
  const { ads, clock } = newAds();
  watch(ads, clock, guest);

  assert.throws(() => ads.start(guest), { code: 'too_soon' });
  assert.equal(ads.status(guest).nextAt, clock.now + AD_GAP_MS);

  clock.now += AD_GAP_MS;
  assert.doesNotThrow(() => ads.start(guest));
});

test('only five ads a day, then the limit resets at midnight', () => {
  const { ads, clock } = newAds();

  for (let i = 0; i < ADS_PER_DAY; i++) {
    watch(ads, clock, player);
    clock.now += AD_GAP_MS;
  }

  assert.equal(ads.status(player).remaining, 0);
  assert.throws(() => ads.start(player), { code: 'daily_limit' });

  clock.now = new Date(2026, 10, 17, 0, 0, 1).getTime();
  assert.equal(ads.status(player).remaining, ADS_PER_DAY);
});

test('limits are per viewer, and ads rotate', () => {
  const { ads, clock } = newAds();
  const first = ads.start(player).adId;
  clock.now += findAd(first).durationMs;

  // Another viewer is not blocked by the first one's ad
  assert.doesNotThrow(() => ads.start(guest));

  const second = ads.start(player).adId;
  assert.notEqual(second, first);
  assert.ok(VIDEO_ADS.some(ad => ad.id === second));
});

test('today\'s finished ads from the database still count after a restart', () => {
  const { ads, clock } = newAds();
  ads.load([
    { viewerKey: 'player:player-1', status: 'completed', completedAt: new Date(clock.now - 60_000), adId: 'spark-social' },
    { viewerKey: 'player:player-1', status: 'abandoned', completedAt: new Date(clock.now - 30_000), adId: 'spark-social' }
  ]);

  assert.equal(ads.status(player).watchedToday, 1);
});
