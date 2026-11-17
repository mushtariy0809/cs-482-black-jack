import { BUILT_IN_ADS } from '../../shared/ads.js';
import { SOCKET_URL, useTables } from '../realtime/useTables.js';

// The ads players see (A4): managed by admins in the Ad revenue tab and sent by the
// server. Until the server answers (or while it's down) the built-in ads are shown.

// kind: 'video' | 'banner'
export function useAdCatalog(kind) {
  const { adCatalog } = useTables();
  return (adCatalog ?? BUILT_IN_ADS).filter(ad => ad.kind === kind);
}

// Files uploaded by an admin live on the game server; built-in ones ship with the site
export function mediaSrc(url) {
  if (!url) return '';
  return url.startsWith('/uploads/') ? `${SOCKET_URL}${url}` : url;
}
