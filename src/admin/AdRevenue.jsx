import React, { useCallback, useEffect, useState } from 'react';
import { MAX_VIDEO_MS, MIN_VIDEO_MS } from '../../shared/ads.js';
import { mediaSrc } from '../ads/catalog.js';
import { BANNER_SLOTS } from '../lobby/AdBanner.jsx';
import { adminRequest, adminUpload } from './adminApi.js';
import './adRevenue.css';

// A4 Ad revenue: what players did with the ads (counts, no money) for a date range,
// and the ads themselves: add a video (upload or link) or banner, edit text and link,
// archive or restore. Archived ads stop showing but keep their stats.

const number = value => new Intl.NumberFormat().format(value || 0);

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' }
];

const UPLOAD_TYPES = {
  video: 'video/mp4',
  banner: 'image/png,image/jpeg,image/webp'
};

function seconds(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="admin-segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'active' : ''}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value, note }) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{value == null ? '—' : number(value)}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

// Reads a video's length in the browser (used for pasted links; uploads are measured on the server too)
export function readVideoLength(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const timer = setTimeout(() => reject(new Error('That video took too long to load.')), 15000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      resolve(Math.round(video.duration * 1000));
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(new Error("That video couldn't be loaded. Check the link points to an MP4 file."));
    };
    video.src = src;
  });
}

function lengthProblem(durationMs) {
  if (!Number.isFinite(durationMs)) return "Couldn't read the video's length.";
  if (durationMs < MIN_VIDEO_MS || durationMs > MAX_VIDEO_MS) {
    return `Video ads must be ${MIN_VIDEO_MS / 1000} to ${MAX_VIDEO_MS / 1000} seconds long (this one is ${seconds(durationMs)}).`;
  }
  return '';
}

function isWebLink(value) {
  return /^https?:\/\/\S+\.\S+/i.test(value);
}

// Add a new ad, or edit an existing one's text, link and sponsor
function AdForm({ token, ad, defaultKind, onSaved, onCancel }) {
  const editing = Boolean(ad);
  const [kind, setKind] = useState(ad?.kind ?? defaultKind);
  const [source, setSource] = useState('upload');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [mediaLink, setMediaLink] = useState('');
  const [durationMs, setDurationMs] = useState(null);
  const [fields, setFields] = useState({
    sponsor: ad?.sponsor ?? '',
    headline: ad?.headline ?? '',
    tagline: ad?.tagline ?? '',
    shortTitle: ad?.shortTitle ?? '',
    link: ad?.link ?? ''
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Free the preview's object URL when it changes
  useEffect(() => () => preview.startsWith('blob:') && URL.revokeObjectURL(preview), [preview]);

  const set = name => event => {
    setFields(current => ({ ...current, [name]: event.target.value }));
    setError('');
  };

  async function pickFile(event) {
    const picked = event.target.files?.[0] ?? null;
    setError('');
    setDurationMs(null);
    setFile(picked);
    if (!picked) return setPreview('');
    const url = URL.createObjectURL(picked);
    setPreview(url);
    if (kind === 'video') {
      try {
        setDurationMs(await readVideoLength(url));
      } catch (lengthError) {
        setError(lengthError.message);
      }
    }
  }

  function switchKind(next) {
    setKind(next);
    setFile(null);
    setPreview('');
    setMediaLink('');
    setDurationMs(null);
    setError('');
  }

  function problem() {
    if (!fields.sponsor.trim()) return 'Enter the sponsor name.';
    if (!fields.headline.trim()) return 'Enter a headline.';
    if (fields.link.trim() && !isWebLink(fields.link.trim())) return 'The link must start with https:// or http://';
    if (editing) return '';
    if (source === 'upload' && !file) return kind === 'video' ? 'Choose an MP4 video.' : 'Choose a banner image.';
    if (source === 'link' && !isWebLink(mediaLink.trim())) return 'Paste a link that starts with https://';
    if (kind === 'video' && source === 'upload') return lengthProblem(durationMs);
    return '';
  }

  async function save(event) {
    event.preventDefault();
    const found = problem();
    if (found) return setError(found);

    setBusy(true);
    setError('');
    try {
      const body = {
        sponsor: fields.sponsor,
        headline: fields.headline,
        tagline: fields.tagline,
        shortTitle: kind === 'banner' ? fields.shortTitle : '',
        link: fields.link.trim()
      };

      if (editing) {
        onSaved(await adminRequest(token, `/ads/${encodeURIComponent(ad.id)}`, { method: 'PATCH', body: JSON.stringify(body) }), 'Ad updated.');
        return;
      }

      let mediaUrl = mediaLink.trim();
      let length = durationMs;
      if (source === 'upload') {
        const uploaded = await adminUpload(token, file);
        mediaUrl = uploaded.url;
        length = uploaded.durationMs;
      } else if (kind === 'video') {
        length = await readVideoLength(mediaUrl);
        const tooLong = lengthProblem(length);
        if (tooLong) throw new Error(tooLong);
      }

      const created = await adminRequest(token, '/ads', {
        method: 'POST',
        body: JSON.stringify({ ...body, kind, mediaUrl, durationMs: kind === 'video' ? length : 0 })
      });
      onSaved(created, `${created.sponsor} is live.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  const previewSrc = source === 'upload' ? preview : mediaLink.trim();

  return (
    <form className="admin-panel admin-ad-form" onSubmit={save} noValidate aria-label={editing ? `Edit ${ad.sponsor}` : 'New ad'}>
      <div className="admin-section-heading">
        <div>
          <h2>{editing ? `Edit ${ad.sponsor}` : 'New ad'}</h2>
          <p className="admin-panel-subtitle">
            {editing
              ? 'Change the words and the link. To use a different video or image, add a new ad and archive this one.'
              : 'It goes live for players as soon as you save.'}
          </p>
        </div>
      </div>

      {!editing && (
        <div className="admin-ad-form-row">
          <Segmented
            label="Ad type"
            value={kind}
            onChange={switchKind}
            options={[{ id: 'video', label: 'Video ad' }, { id: 'banner', label: 'Banner' }]}
          />
          <Segmented
            label="Media source"
            value={source}
            onChange={next => {
              setSource(next);
              setError('');
            }}
            options={[{ id: 'upload', label: 'Upload file' }, { id: 'link', label: 'Paste link' }]}
          />
        </div>
      )}

      <div className="admin-ad-form-grid">
        <div className="admin-ad-form-fields">
          {!editing && (source === 'upload' ? (
            <label className="admin-ad-field">
              {kind === 'video' ? 'Video (MP4, 5–60 seconds, up to 50 MB)' : 'Image (PNG, JPEG or WebP, up to 5 MB)'}
              <input type="file" accept={UPLOAD_TYPES[kind]} onChange={pickFile} />
            </label>
          ) : (
            <label className="admin-ad-field">
              {kind === 'video' ? 'Video link (MP4)' : 'Image link'}
              <input
                type="url"
                value={mediaLink}
                placeholder="https://"
                onChange={event => {
                  setMediaLink(event.target.value);
                  setError('');
                }}
              />
            </label>
          ))}

          <label className="admin-ad-field">
            Sponsor *
            <input value={fields.sponsor} onChange={set('sponsor')} maxLength={40} placeholder="Daybreak Roasters" />
          </label>
          <label className="admin-ad-field">
            Headline *
            <input value={fields.headline} onChange={set('headline')} maxLength={60} placeholder="Long night at the table?" />
          </label>
          <label className="admin-ad-field">
            Tagline
            <input value={fields.tagline} onChange={set('tagline')} maxLength={120} placeholder="Small-batch espresso, roasted this week." />
          </label>
          {kind === 'banner' && (
            <label className="admin-ad-field">
              Short title (table column)
              <input value={fields.shortTitle} onChange={set('shortTitle')} maxLength={30} placeholder="Uses the headline if empty" />
            </label>
          )}
          <label className="admin-ad-field">
            Link {kind === 'video' ? '("Visit sponsor" button)' : '("Learn more" button)'}
            <input type="url" value={fields.link} onChange={set('link')} placeholder="https://sponsor.example.com" />
          </label>
        </div>

        <div className="admin-ad-preview" aria-label="Preview">
          {editing && (ad.kind === 'video'
            ? <video src={mediaSrc(ad.mediaUrl)} poster={mediaSrc(ad.posterUrl) || undefined} muted controls preload="metadata" />
            : <img src={mediaSrc(ad.mediaUrl)} alt="" />)}
          {!editing && previewSrc && (kind === 'video'
            ? <video src={previewSrc} muted controls preload="metadata" />
            : <img src={previewSrc} alt="" />)}
          {!editing && !previewSrc && <span className="admin-empty">Preview shows here</span>}
          {!editing && kind === 'video' && durationMs != null && <small>Length {seconds(durationMs)}</small>}
        </div>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-ad-form-actions">
        <button type="button" className="admin-quiet-button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? (source === 'upload' && !editing ? 'Uploading…' : 'Saving…') : editing ? 'Save changes' : 'Publish ad'}
        </button>
      </div>
    </form>
  );
}

function statsText(ad, stats) {
  const s = stats ?? { started: 0, finished: 0, impressions: 0, clicks: 0 };
  if (ad.kind === 'video') {
    return `${number(s.finished)} finished · ${number(s.started)} started${s.clicks ? ` · ${number(s.clicks)} clicks` : ''}`;
  }
  return `${number(s.impressions)} shown · ${number(s.clicks)} clicks`;
}

function AdRow({ ad, stats, showing, onEdit, onToggle, busy }) {
  const archived = ad.status === 'archived';
  return (
    <tr className={archived ? 'admin-ad-archived' : ''}>
      <td>
        <div className="admin-ad-cell">
          <span className="admin-ad-thumb">
            {ad.kind === 'video'
              ? <video src={mediaSrc(ad.mediaUrl)} poster={mediaSrc(ad.posterUrl) || undefined} muted preload="metadata" aria-hidden="true" />
              : <img src={mediaSrc(ad.mediaUrl)} alt="" />}
          </span>
          <span>
            <strong>{ad.sponsor}</strong>
            <small>{ad.headline}{ad.kind === 'video' && ad.durationMs ? ` · ${seconds(ad.durationMs)}` : ''}</small>
          </span>
        </div>
      </td>
      <td className="admin-ad-link">
        {ad.link
          ? <a href={ad.link} target="_blank" rel="noopener noreferrer">{ad.link.replace(/^https?:\/\//, '')}</a>
          : <span className="admin-muted">No link</span>}
      </td>
      <td>{statsText(ad, stats)}</td>
      <td>
        <span className={`admin-status ${archived ? 'admin-status-archived' : 'admin-status-active'}`}>
          {archived ? 'Archived' : showing ? 'Showing' : 'Active'}
        </span>
      </td>
      <td className="admin-ad-actions">
        <button type="button" className="admin-quiet-button" onClick={() => onEdit(ad)} disabled={busy}>Edit</button>
        <button
          type="button"
          className={archived ? 'admin-quiet-button' : 'admin-table-action'}
          onClick={() => onToggle(ad)}
          disabled={busy}
          aria-label={`${archived ? 'Restore' : 'Archive'} ${ad.sponsor}`}
        >
          {archived ? 'Restore' : 'Archive'}
        </button>
      </td>
    </tr>
  );
}

export default function AdRevenue({ token }) {
  const [range, setRange] = useState('7d');
  const [summary, setSummary] = useState(null);
  const [ads, setAds] = useState(null);
  const [kind, setKind] = useState('video');
  const [showArchived, setShowArchived] = useState(false);
  // null, 'new', or the ad being edited
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await adminRequest(token, `/ads/summary?range=${range}`));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [token, range]);

  const loadAds = useCallback(async () => {
    try {
      setAds(await adminRequest(token, '/ads'));
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [token]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  function saved(ad, text) {
    setAds(current => [ad, ...(current ?? []).filter(item => item.id !== ad.id)]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    setEditing(null);
    setKind(ad.kind);
    setMessage(text);
  }

  async function toggle(ad) {
    const archiving = ad.status === 'active';
    const activeVideos = (ads ?? []).filter(item => item.kind === 'video' && item.status === 'active');
    if (archiving && ad.kind === 'video' && activeVideos.length === 1
      && !window.confirm('This is the last active video ad. Players won’t be able to watch ads for chips until you add or restore one. Archive it anyway?')) {
      return;
    }
    setBusyId(ad.id);
    setMessage('');
    try {
      const updated = await adminRequest(token, `/ads/${encodeURIComponent(ad.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: archiving ? 'archived' : 'active' })
      });
      setAds(current => current.map(item => (item.id === updated.id ? updated : item)));
      setMessage(archiving ? `${ad.sponsor} archived. Its stats stay in the totals.` : `${ad.sponsor} is live again.`);
    } catch (toggleError) {
      setMessage(toggleError.message);
    } finally {
      setBusyId(null);
    }
  }

  const totals = summary?.totals;
  const ofKind = (ads ?? []).filter(ad => ad.kind === kind);
  const archivedCount = ofKind.filter(ad => ad.status === 'archived').length;
  const shown = ofKind.filter(ad => showArchived || ad.status === 'active');
  // Banners in the lobby and table: the newest active ones fill the slots
  const showingIds = new Set((ads ?? []).filter(ad => ad.kind === 'banner' && ad.status === 'active').slice(0, BANNER_SLOTS).map(ad => ad.id));
  const count = k => (ads ?? []).filter(ad => ad.kind === k && ad.status === 'active').length;

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <h1>Ad revenue</h1>
          <p>How players respond to the ads, and the ads they see</p>
        </div>
        <div className="admin-ad-heading-actions">
          <Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />
          <button className="admin-quiet-button" onClick={loadSummary} disabled={loading}>
            {loading ? 'Updating…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}

      <section className="admin-metrics" aria-label="Ad totals">
        <Metric
          label="Videos finished"
          value={totals?.videoFinished}
          note={totals ? `${totals.finishRate}% of ${number(totals.videoStarted)} started · ${number(totals.videoClosedEarly)} closed early` : 'Watched to the end'}
        />
        <Metric label="Banner impressions" value={totals?.bannerImpressions} note="Times a lobby or table banner was shown" />
        <Metric
          label="Ad clicks"
          value={totals?.clicks}
          note={totals ? `${number(totals.bannerClicks)} on banners (${totals.bannerClickRate}%) · ${number(totals.videoClicks)} on videos` : 'Learn more + Visit sponsor'}
        />
        <Metric label="Chips paid out" value={totals?.chipsPaid} note="Rewards for finished videos" />
      </section>

      {editing && (
        <AdForm
          key={editing === 'new' ? `new-${kind}` : editing.id}
          token={token}
          ad={editing === 'new' ? null : editing}
          defaultKind={kind}
          onSaved={saved}
          onCancel={() => setEditing(null)}
        />
      )}

      <section className="admin-panel admin-ads-panel">
        <div className="admin-section-heading admin-ads-toolbar">
          <div>
            <h2>Ads</h2>
            <p className="admin-panel-subtitle">
              {kind === 'video'
                ? 'Players get chips for watching these to the end. They take turns.'
                : `The ${BANNER_SLOTS} newest active banners show in the lobby and next to the table.`}
            </p>
          </div>
          <div className="admin-ads-controls">
            <Segmented
              label="Ad type"
              value={kind}
              onChange={setKind}
              options={[
                { id: 'video', label: `Video ads (${count('video')})` },
                { id: 'banner', label: `Banners (${count('banner')})` }
              ]}
            />
            <label className="admin-ads-archived-toggle">
              <input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />
              Show archived ({archivedCount})
            </label>
            <button type="button" className="primary admin-ads-new" onClick={() => setEditing('new')}>+ New ad</button>
          </div>
        </div>

        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr><th>Ad</th><th>Link</th><th>{RANGES.find(r => r.id === range).label}</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {shown.map(ad => (
                <AdRow
                  key={ad.id}
                  ad={ad}
                  stats={summary?.perAd?.[ad.id]}
                  showing={showingIds.has(ad.id)}
                  onEdit={setEditing}
                  onToggle={toggle}
                  busy={busyId === ad.id}
                />
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan="5" className="admin-empty">
                    {ads ? `No ${showArchived ? '' : 'active '}${kind === 'video' ? 'video ads' : 'banners'}.` : 'Loading ads…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {message && <p className="admin-feedback" role="status">{message}</p>}
      </section>

      <p className="admin-footnote">Counts only (no money). Banner impressions are counted once per minute per player per placement. Archived ads keep their stats.</p>
    </>
  );
}
