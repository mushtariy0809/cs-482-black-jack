import React from 'react';
import { ADS } from '../lobby/AdBanner.jsx';
import './table.css';

// Right-hand ad column on the table screen (Figma "Bet" 3:1135).
// Fixed size, never animated or covered: it sits above every table overlay.
export default function TableAds() {
  return (
    <aside className="table-ads" aria-label="Advertisements">
      {ADS.map(ad => (
        <div key={ad.id} className={`table-ad ad-${ad.id}`}>
          <span className="ad-label">ADVERTISEMENT</span>
          <div className="table-ad-image" style={{ backgroundImage: `url(${ad.image})` }} />
          <strong>{ad.tableTitle}</strong>
          <a className="ad-cta" href="#" onClick={event => event.preventDefault()}>
            Learn more
          </a>
        </div>
      ))}
      <span className="table-ads-note">Sponsored</span>
    </aside>
  );
}
