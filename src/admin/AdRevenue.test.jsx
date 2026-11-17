import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdRevenue from './AdRevenue.jsx';
import { mockFetch } from '../test/setup.js';

vi.mock('../realtime/useTables.js', () => ({
  useTables: () => ({ adCatalog: null }),
  trackAd: vi.fn(),
  SOCKET_URL: 'http://localhost:5000'
}));

const API = 'http://localhost:5000/api/admin';
const summary = range => ({
  range,
  totals: {
    videoStarted: 10, videoFinished: 8, videoClosedEarly: 2, bannerImpressions: 340,
    bannerClicks: 17, videoClicks: 3, chipsPaid: 800, clicks: 20, finishRate: 80, bannerClickRate: 5
  },
  perAd: { 'spark-social': { started: 6, finished: 5, closedEarly: 1, impressions: 0, clicks: 3 } }
});
const ads = [
  { id: 'spark-social', kind: 'video', sponsor: 'Spark Social', headline: 'Boost your reach.', mediaUrl: '/assets/ads/videos/spark-social.mp4', posterUrl: '', link: 'https://spark.example.com', durationMs: 15000, status: 'active', createdAt: '1970-01-01T00:00:00Z' },
  { id: 'daybreak-coffee', kind: 'video', sponsor: 'Daybreak Roasters', headline: 'Long night?', mediaUrl: '/assets/ads/videos/daybreak-coffee.mp4', posterUrl: '', link: '', durationMs: 13200, status: 'archived', createdAt: '1970-01-01T00:00:00Z' },
  { id: 'shareair', kind: 'banner', sponsor: 'ShareAir', headline: 'Your food stinks.', mediaUrl: '/assets/ads/ad-shareair.png', posterUrl: '', link: '', durationMs: 0, status: 'active', createdAt: '1970-01-01T00:00:00Z' }
];

describe('AdRevenue (A4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows totals for the chosen range and lists active video ads with their stats', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch([
      { url: `${API}/ads/summary?range=7d`, body: summary('7d') },
      { url: `${API}/ads/summary?range=today`, body: summary('today') },
      { url: `${API}/ads`, body: ads }
    ]);
    render(<AdRevenue token="t" />);

    const totals = await screen.findByLabelText('Ad totals');
    expect(within(totals).getByText('8')).toBeInTheDocument();
    expect(within(totals).getByText(/80% of 10 started/)).toBeInTheDocument();
    expect(within(totals).getByText('340')).toBeInTheDocument();
    expect(within(totals).getByText('800')).toBeInTheDocument();

    const row = (await screen.findByText('Spark Social')).closest('tr');
    expect(within(row).getByText('5 finished · 6 started · 3 clicks')).toBeInTheDocument();
    expect(screen.queryByText('Daybreak Roasters')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(fetch).toHaveBeenCalledWith(`${API}/ads/summary?range=today`, expect.anything());
  });

  it('archives an ad, and shows archived ads to restore them', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch([
      { url: `${API}/ads/summary?range=7d`, body: summary('7d') },
      { url: `${API}/ads`, body: ads },
      { url: `${API}/ads/spark-social`, method: 'PATCH', body: { ...ads[0], status: 'archived' } }
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdRevenue token="t" />);

    await user.click(await screen.findByRole('button', { name: 'Archive Spark Social' }));
    expect(window.confirm).toHaveBeenCalled();
    const patch = fetch.mock.calls.find(([url]) => url.endsWith('/ads/spark-social'));
    expect(JSON.parse(patch[1].body)).toEqual({ status: 'archived' });
    expect(await screen.findByText(/Spark Social archived/)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Show archived/));
    expect(screen.getByRole('button', { name: 'Restore Daybreak Roasters' })).toBeInTheDocument();
  });

  it('adds a banner from an image link', async () => {
    const user = userEvent.setup();
    const created = { ...ads[2], id: 'cafe-abc123', sponsor: 'Corner Cafe', headline: 'Coffee after cards', mediaUrl: 'https://cdn.example.com/cafe.png', link: 'https://cafe.example.com', createdAt: new Date().toISOString() };
    const fetch = mockFetch([
      { url: `${API}/ads/summary?range=7d`, body: summary('7d') },
      { url: `${API}/ads`, body: ads },
      { url: `${API}/ads`, method: 'POST', body: created }
    ]);
    render(<AdRevenue token="t" />);

    await user.click(await screen.findByRole('button', { name: /Banners/ }));
    await user.click(screen.getByRole('button', { name: '+ New ad' }));
    const form = screen.getByRole('form', { name: 'New ad' });
    await user.click(within(form).getByRole('button', { name: 'Paste link' }));
    await user.type(within(form).getByLabelText('Image link'), 'https://cdn.example.com/cafe.png');
    await user.type(within(form).getByLabelText(/Sponsor/), 'Corner Cafe');

    // Missing headline is caught before anything is sent
    await user.click(within(form).getByRole('button', { name: 'Publish ad' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Enter a headline.');

    await user.type(within(form).getByLabelText(/Headline/), 'Coffee after cards');
    await user.type(within(form).getByLabelText(/Link/), 'cafe.example.com');
    await user.click(within(form).getByRole('button', { name: 'Publish ad' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('https://');

    await user.clear(within(form).getByLabelText(/Link/));
    await user.type(within(form).getByLabelText(/Link/), 'https://cafe.example.com');
    await user.click(within(form).getByRole('button', { name: 'Publish ad' }));

    const post = fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({ kind: 'banner', sponsor: 'Corner Cafe', mediaUrl: 'https://cdn.example.com/cafe.png', durationMs: 0 });
    expect(await screen.findByText('Corner Cafe is live.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New ad' })).not.toBeInTheDocument();
  });
});
