import React from 'react';

// Ad slots from the Figma lobby. Fixed size, never animated or overlapped:
// the app makes money from these, so keep their position and size stable.
const ADS = [
  {
    id: 'shareair',
    image: '/assets/ads/ad-shareair.png',
    title: 'Your food stinks.',
    text: 'Secondhand smoke is costing restaurants guests.'
  },
  {
    id: 'social',
    image: '/assets/ads/ad-social.png',
    title: 'Boost your social presence.',
    text: 'Captivate audiences with social media magic.'
  }
];

export default function AdBanner() {
  return (
    <aside className="ad-banner" aria-label="Advertisements">
      {ADS.map(ad => (
        <div key={ad.id} className={`ad-slot ad-${ad.id}`}>
          <div className="ad-image" style={{ backgroundImage: `url(${ad.image})` }} />
          <div className="ad-copy">
            <span className="ad-label">ADVERTISEMENT</span>
            <strong>{ad.title}</strong>
            <span className="ad-text">{ad.text}</span>
          </div>
          <a className="ad-cta" href="#" onClick={event => event.preventDefault()}>
            Learn more →
          </a>
        </div>
      ))}
    </aside>
  );
}
