'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';

const CONSENT_BADGE = {
  na:      { label: 'Midjourney', color: '#2B5040', bg: 'rgba(43,80,64,0.1)' },
  cleared: { label: 'Consent ✓', color: '#2B5040', bg: 'rgba(43,80,64,0.12)' },
  pending: { label: 'Consent pending', color: '#C9A030', bg: 'rgba(201,160,48,0.12)' },
  blocked: { label: 'No consent', color: '#CC3333', bg: 'rgba(204,51,51,0.1)' },
};

const SOURCE_LABEL = {
  midjourney_render: 'Midjourney',
  real_photo: 'Real photo',
};

export default function LibraryPage() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ sourceType: 'all', consent: 'all', search: '' });
  const [signedUrls, setSignedUrls] = useState({});

  useEffect(() => {
    fetch('/api/images')
      .then(r => r.json())
      .then(data => {
        setImages(data);
        setLoading(false);
        // URLs are pre-signed server-side and included in the response
        const map = {};
        data.forEach(img => { if (img.url) map[img.storage_path] = img.url; });
        setSignedUrls(map);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = images.filter(img => {
    if (filter.sourceType !== 'all' && img.source_type !== filter.sourceType) return false;
    if (filter.consent !== 'all' && img.consent_status !== filter.consent) return false;
    if (filter.search && !img.filename.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--tw-smoke)' }}>
      <Nav section="library" />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header + filters */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 400, color: 'var(--fg-strong)', letterSpacing: '-0.01em', marginBottom: 4 }}>Asset Library</h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#6B6560' }}>{images.length} image{images.length !== 1 ? 's' : ''} stored</p>
          </div>
          <Link href="/upload" style={{ padding: '11px 24px', background: 'var(--tw-tangerine)', color: '#fff', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
            + Upload
          </Link>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            aria-label="Search image library by filename"
            placeholder="Search by filename…"
            value={filter.search}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            style={{ padding: '9px 14px', border: '1.5px solid rgba(184,176,168,0.5)', borderRadius: 10, fontSize: 13, fontFamily: 'var(--font-body)', background: '#fff', outline: 'none', width: 220 }}
          />
          <FilterChips
            label="Type"
            value={filter.sourceType}
            options={[{ value: 'all', label: 'All types' }, { value: 'midjourney_render', label: 'Midjourney' }, { value: 'real_photo', label: 'Real photo' }]}
            onChange={v => setFilter(f => ({ ...f, sourceType: v }))}
          />
          <FilterChips
            label="Consent"
            value={filter.consent}
            options={[{ value: 'all', label: 'All' }, { value: 'na', label: 'N/A' }, { value: 'cleared', label: 'Cleared' }, { value: 'pending', label: 'Pending' }, { value: 'blocked', label: 'Blocked' }]}
            onChange={v => setFilter(f => ({ ...f, consent: v }))}
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', fontFamily: 'var(--font-ui)', color: 'var(--tw-burnham)', fontSize: 13, letterSpacing: 2 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState hasImages={images.length > 0} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {filtered.map(img => (
              <ImageCard key={img.id} img={img} url={signedUrls[img.storage_path]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageCard({ img, url }) {
  const badge = CONSENT_BADGE[img.consent_status] || CONSENT_BADGE.na;
  const isBlocked = img.consent_status === 'blocked';

  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${isBlocked ? 'rgba(204,51,51,0.3)' : 'rgba(184,176,168,0.3)'}`, position: 'relative' }}>
      {/* Image */}
      <div style={{ aspectRatio: '1/1', background: '#f5f5f0', position: 'relative', overflow: 'hidden' }}>
        {url ? (
          <img src={url} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: isBlocked ? 'grayscale(0.5) opacity(0.6)' : 'none' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 32 }}>🖼</div>
        )}
        {isBlocked && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(204,51,51,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(204,51,51,0.9)', color: '#fff', padding: '6px 12px', borderRadius: 6, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Consent required</div>
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--tw-jet)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.filename}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: 1, color: '#6B6560', textTransform: 'uppercase' }}>{SOURCE_LABEL[img.source_type]}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 7px', borderRadius: 4 }}>{badge.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#aaa' }}>
            {new Date(img.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          {url && !isBlocked && (
            <a className="library-save-action" aria-label={`Save ${img.filename}`} href={url} download={img.filename} target="_blank" rel="noreferrer"
              style={{ fontFamily: 'var(--font-syne)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tw-burnham)', background: 'var(--tw-celadon-soft)', padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer', textDecoration: 'none' }}>
              ↓ Save
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChips({ label, value, options, onChange }) {
  return (
    <fieldset className="library-filter-group" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontFamily: 'var(--font-syne)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)', marginBottom: 6 }}>{label}</legend>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(opt => (
          <button key={opt.value} aria-pressed={value === opt.value} onClick={() => onChange(opt.value)}
            style={{ padding: '7px 13px', borderRadius: 40, border: `1.5px solid ${value === opt.value ? 'var(--tw-burnham)' : 'rgba(184,176,168,0.5)'}`, background: value === opt.value ? 'var(--tw-burnham)' : 'transparent', color: value === opt.value ? '#fff' : 'var(--tw-jet)', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3 }}>
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function EmptyState({ hasImages }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 24px', background: '#fff', borderRadius: 16, border: '1.5px dashed rgba(184,176,168,0.5)' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>📷</div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--tw-burnham)', marginBottom: 8 }}>
        {hasImages ? 'No images match your filters' : 'No images yet'}
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#6B6560', maxWidth: 360, margin: '0 auto 24px' }}>
        {hasImages ? 'Try clearing your filters.' : 'Upload your first Midjourney render or school photo to get started.'}
      </p>
      {!hasImages && (
        <Link href="/upload" style={{ padding: '11px 28px', background: 'var(--tw-tangerine)', color: '#fff', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
          Upload Images →
        </Link>
      )}
    </div>
  );
}

const navLink = { fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2, color: 'var(--tw-celadon)', textTransform: 'uppercase' };
