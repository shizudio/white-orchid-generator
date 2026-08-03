'use client';
import { useState, useEffect } from 'react';

// (Brand Style DNA — docs/brand-style-dna-spec.md §2) Multi-select anchor
// picker for the Distill pass. Own component rather than LibraryPicker:
// LibraryPicker's contract is single-select-and-close (onSelect fires and the
// modal is done), which cannot express "pick 3–8, then confirm" unmodified —
// and modifying it is off-limits (concurrent Library work). Reads the same
// GET /api/images and keeps the same visual voice.
const MIN_ANCHORS = 3;
const MAX_ANCHORS = 8;

export default function StyleAnchorPicker({ onConfirm, onClose }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState([]); // ordered image ids

  useEffect(() => {
    fetch('/api/images')
      .then(r => r.json())
      .then(data => { setImages(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (img) => {
    setPicked(prev => prev.includes(img.id)
      ? prev.filter(id => id !== img.id)
      : prev.length >= MAX_ANCHORS ? prev : [...prev, img.id]);
  };

  const confirm = () => {
    if (picked.length < MIN_ANCHORS) return;
    const byId = new Map(images.map(i => [i.id, i]));
    onConfirm(picked.map(id => byId.get(id)).filter(Boolean));
  };

  const ready = picked.length >= MIN_ANCHORS;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(37,78,72,0.5)', zIndex: 200 }} />

      {/* Modal */}
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(680px, 94vw)', maxHeight: '78vh', background: 'var(--bg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, color: 'var(--fg-strong)' }}>Choose anchor photos</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-subtle)', marginTop: 2 }}>
              Pick {MIN_ANCHORS}–{MAX_ANCHORS} photos that look the way your brand should always look.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--fg-subtle)', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
        </div>

        {/* Grid */}
        <div style={{ overflowY: 'auto', padding: 24, flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'var(--font-syne)', fontSize: 12, letterSpacing: '0.1em', color: 'var(--fg-subtle)', textTransform: 'uppercase' }}>Loading…</div>
          ) : images.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-subtle)' }}>
              No images in the library yet. Upload some first.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {images.map(img => {
                const idx = picked.indexOf(img.id);
                const on = idx >= 0;
                return (
                  <button key={img.id} onClick={() => toggle(img)} aria-pressed={on}
                    style={{ position: 'relative', background: 'var(--bg-raised)', border: on ? '2px solid var(--tw-burnham)' : '1.5px solid var(--line)', borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                    <div style={{ aspectRatio: '1/1', background: 'var(--bg-soft)', overflow: 'hidden', opacity: !on && picked.length >= MAX_ANCHORS ? 0.4 : 1 }}>
                      {img.url
                        ? <img src={img.url} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--tw-ash)' }}>🖼</div>
                      }
                    </div>
                    {on && (
                      <span style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: 'var(--tw-burnham)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-syne)', fontSize: 11, fontWeight: 700 }}>{idx + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)' }}>
            {picked.length} of {MAX_ANCHORS} chosen{picked.length < MIN_ANCHORS ? ` — pick at least ${MIN_ANCHORS}` : ''}
          </span>
          <button onClick={confirm} disabled={!ready}
            style={{ padding: '10px 26px', background: ready ? 'var(--tw-burnham)' : 'var(--tw-ash)', color: ready ? '#fff' : 'var(--fg-muted)', border: 'none', borderRadius: 'var(--radius-2xl)', fontFamily: 'var(--font-syne)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: ready ? 'pointer' : 'not-allowed' }}>
            Distill from {picked.length || '…'} photos
          </button>
        </div>
      </div>
    </>
  );
}
