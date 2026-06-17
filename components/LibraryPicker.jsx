'use client';
import { useState, useEffect } from 'react';

const CONSENT_BADGE = {
  na:      { label: 'Midjourney', color: 'var(--tw-celadon-deep)', bg: 'var(--tw-celadon-soft)' },
  cleared: { label: 'Cleared', color: 'var(--tw-celadon-deep)', bg: 'var(--tw-celadon-soft)' },
  pending: { label: 'Pending', color: '#C9A030', bg: 'rgba(201,160,48,0.12)' },
  blocked: { label: 'Blocked', color: '#CC3333', bg: 'rgba(204,51,51,0.1)' },
};

export default function LibraryPicker({ onSelect, onClose }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/images')
      .then(r => r.json())
      .then(data => { setImages(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = images.filter(img =>
    img.consent_status !== 'blocked' &&
    (!search || img.filename.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(37,78,72,0.5)', zIndex: 200, backdropFilter: 'none' }} />

      {/* Modal */}
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(680px, 94vw)', maxHeight: '78vh', background: 'var(--bg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, color: 'var(--fg-strong)' }}>Your library</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-subtle)', marginTop: 2 }}>Blocked images are hidden. Click to use.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--fg-subtle)', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <input
            placeholder="Search by filename…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ width: '100%', padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-body)', background: 'var(--bg-raised)', outline: 'none', color: 'var(--fg-strong)' }}
          />
        </div>

        {/* Grid */}
        <div style={{ overflowY: 'auto', padding: 24, flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'var(--font-syne)', fontSize: 12, letterSpacing: '0.1em', color: 'var(--fg-subtle)', textTransform: 'uppercase' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-subtle)' }}>
              {images.length === 0 ? 'No images in library yet. Upload some first.' : 'No images match your search.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {filtered.map(img => (
                <button key={img.id} onClick={() => onSelect(img)}
                  style={{ background: 'var(--bg-raised)', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'border-color 140ms, box-shadow 140ms' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--tw-burnham)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ aspectRatio: '1/1', background: 'var(--bg-soft)', overflow: 'hidden' }}>
                    {img.url
                      ? <img src={img.url} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--tw-ash)' }}>🖼</div>
                    }
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--fg-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{img.filename}</div>
                    <span style={{ fontFamily: 'var(--font-syne)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: CONSENT_BADGE[img.consent_status]?.color, background: CONSENT_BADGE[img.consent_status]?.bg, padding: '2px 6px', borderRadius: 'var(--radius-xs)' }}>
                      {CONSENT_BADGE[img.consent_status]?.label}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
