import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// No real audio in tests
vi.mock('../sound/SoundManager.js', () => ({
  play: vi.fn(),
  preload: vi.fn(),
  setMusic: vi.fn(),
  installUiSounds: vi.fn(),
  getSettings: () => ({ muted: true, volume: 0.5 }),
  updateSettings: vi.fn(),
  useSoundSettings: () => ({ muted: true, volume: 0.5 })
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Replaces window.fetch with a list of canned responses, matched by URL in order.
// Each route: { url: string | RegExp, method?, status?, body }
export function mockFetch(routes) {
  const fetch = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const route = routes.find(r =>
      (r.method ?? 'GET') === method && (typeof r.url === 'string' ? url === r.url : r.url.test(url))
    );
    if (!route) throw new Error(`Unexpected fetch: ${method} ${url}`);
    if (route.networkError) throw new TypeError('Failed to fetch');
    const status = route.status ?? 200;
    return { ok: status < 400, status, json: async () => route.body };
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
