import React from 'react';
import { AdLink, useBanners } from '../lobby/AdBanner.jsx';
import { mediaSrc } from '../ads/catalog.js';
import './table.css';

// Right-hand ad column on the table screen (Figma "Bet" 3:1135).
// Fixed size, never animated or covered: it sits above every table overlay.
export default function TableAds() {
  const banners = useBanners('table');

  return (
    <aside className="table-ads" aria-label="Advertisements">
      {banners.map(ad => (
        <div key={ad.id} className={`table-ad ad-${ad.id}`}>
          <span className="ad-label">ADVERTISEMENT</span>
          <div className="table-ad-image" style={{ backgroundImage: `url(${mediaSrc(ad.mediaUrl)})` }} />
          <strong>{ad.shortTitle || ad.headline}</strong>
          <AdLink ad={ad} placement="table">Learn more</AdLink>
        </div>
      ))}
      <span className="table-ads-note">Sponsored</span>
    </aside>
  );
}
