import React, { useEffect } from 'react';
import { mediaSrc, useAdCatalog } from '../ads/catalog.js';
import { trackAd } from '../realtime/useTables.js';

// Ad slots from the Figma lobby. Fixed size, never animated or overlapped:
// the app makes money from these, so keep their position and size stable.
// The banners come from the ad catalog (admins manage them in Ad revenue); the 2 newest active ones show.
export const BANNER_SLOTS = 2;

// The banners for a placement, reporting one impression each time they're shown (A4)
export function useBanners(placement) {
  const banners = useAdCatalog('banner').slice(0, BANNER_SLOTS);
  const ids = banners.map(ad => ad.id).join(',');

  useEffect(() => {
    banners.forEach(ad => trackAd(ad.id, 'impression', placement));
  }, [ids, placement]);

  return banners;
}

// "Learn more" opens the sponsor's site in a new tab and counts a click.
// Ads without a link don't get the button.
export function AdLink({ ad, placement, className = 'ad-cta', children }) {
  if (!ad.link) return null;
  return (
    <a
      className={className}
      href={ad.link}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => trackAd(ad.id, 'click', placement)}
      aria-label={`Learn more about ${ad.sponsor} (opens in a new tab)`}
    >
      {children}
    </a>
  );
}

export default function AdBanner() {
  const banners = useBanners('lobby');

  return (
    <aside className="ad-banner" aria-label="Advertisements">
      {banners.map(ad => (
        <div key={ad.id} className={`ad-slot ad-${ad.id}`}>
          <div className="ad-image" style={{ backgroundImage: `url(${mediaSrc(ad.mediaUrl)})` }} />
          <div className="ad-copy">
            <span className="ad-label">ADVERTISEMENT</span>
            <strong>{ad.headline}</strong>
            <span className="ad-text">{ad.tagline}</span>
          </div>
          <AdLink ad={ad} placement="lobby">Learn more →</AdLink>
        </div>
      ))}
    </aside>
  );
}
