// Video ads a player can watch for free chips (U21 "Watch ads").
// Shared by the browser (src/ads/AdPlayer.jsx plays them) and the server
// (backend/realtime/adStore.js checks the limits and pays the reward).
// Plain ES module with no imports, like rules.js.
//
// The clips are Mixkit stock video under its free license
// (https://mixkit.co/license/#videoFree). The sponsors are made up.

export const AD_REWARD = 100;
export const ADS_PER_DAY = 5;
// Wait between two ads, counted from when the last one finished
export const AD_GAP_MS = 30 * 1000;
// Network hiccups or a slow start shouldn't cost the reward
export const AD_GRACE_MS = 1500;

export const VIDEO_ADS = Object.freeze([
  {
    id: 'shareair-dining',
    sponsor: 'ShareAir',
    headline: 'Your food stinks.',
    tagline: 'Smoke-free air keeps guests at the table.',
    video: '/assets/ads/videos/shareair-dining.mp4',
    poster: '/assets/ads/videos/shareair-dining.jpg',
    durationMs: 16700
  },
  {
    id: 'spark-social',
    sponsor: 'Spark Social',
    headline: 'Boost your reach.',
    tagline: 'Social media people actually stop scrolling for.',
    video: '/assets/ads/videos/spark-social.mp4',
    poster: '/assets/ads/videos/spark-social.jpg',
    durationMs: 15000
  },
  {
    id: 'daybreak-coffee',
    sponsor: 'Daybreak Roasters',
    headline: 'Long night at the table?',
    tagline: 'Small-batch espresso, roasted this week.',
    video: '/assets/ads/videos/daybreak-coffee.mp4',
    poster: '/assets/ads/videos/daybreak-coffee.jpg',
    durationMs: 13200
  },
  {
    id: 'driftwood-travel',
    sponsor: 'Driftwood Getaways',
    headline: 'Trade the felt for sand.',
    tagline: 'Beach weekends, planned for you.',
    video: '/assets/ads/videos/driftwood-travel.mp4',
    poster: '/assets/ads/videos/driftwood-travel.jpg',
    durationMs: 13600
  }
]);

// Video ads must be this long (a shorter one isn't worth the chips, a longer one is too much to ask)
export const MIN_VIDEO_MS = 5 * 1000;
export const MAX_VIDEO_MS = 60 * 1000;

// Banner ads in the lobby and the table's ad column. shortTitle is used in the narrow table column.
export const BANNER_ADS = Object.freeze([
  {
    id: 'shareair',
    sponsor: 'ShareAir',
    headline: 'Your food stinks.',
    shortTitle: 'Your food stinks.',
    tagline: 'Secondhand smoke is costing restaurants guests.',
    image: '/assets/ads/ad-shareair.png'
  },
  {
    id: 'social',
    sponsor: 'Spark Social',
    headline: 'Boost your social presence.',
    shortTitle: 'Boost your reach.',
    tagline: 'Captivate audiences with social media magic.',
    image: '/assets/ads/ad-social.png'
  }
]);

// Built-in ads in the shape the server's ad catalog uses (and sends to the browser).
// Admins can archive them or add new ones in the Ad revenue tab.
export const BUILT_IN_ADS = Object.freeze([
  ...VIDEO_ADS.map(ad => ({
    id: ad.id,
    kind: 'video',
    sponsor: ad.sponsor,
    headline: ad.headline,
    tagline: ad.tagline,
    shortTitle: '',
    mediaUrl: ad.video,
    posterUrl: ad.poster,
    link: '',
    durationMs: ad.durationMs
  })),
  ...BANNER_ADS.map(ad => ({
    id: ad.id,
    kind: 'banner',
    sponsor: ad.sponsor,
    headline: ad.headline,
    tagline: ad.tagline,
    shortTitle: ad.shortTitle,
    mediaUrl: ad.image,
    posterUrl: '',
    link: '',
    durationMs: 0
  }))
]);

export function findAd(id) {
  return BUILT_IN_ADS.find(ad => ad.id === id && ad.kind === 'video') ?? null;
}
