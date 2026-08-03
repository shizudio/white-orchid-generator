'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { groupImagesBySession } from '@/lib/media-taxonomy.mjs';

// (Media organization — client ruling 2026-07-29) The taxonomy is activity-based:
// generated | uploaded ("the midjourney tag is outdated"). /api/images maps any
// legacy stored value to this vocabulary, so this page never sees the old tags.
// Consent stays an orthogonal dimension: 'na' (no identifiable people) carries NO
// badge — the old source-implying "Midjourney" label is gone.
const CONSENT_BADGE = {
  cleared: { label: 'Consent ✓', color: '#2B5040', bg: 'rgba(43,80,64,0.12)' },
  pending: { label: 'Consent pending', color: '#C9A030', bg: 'rgba(201,160,48,0.12)' },
  blocked: { label: 'No consent', color: '#CC3333', bg: 'rgba(204,51,51,0.1)' },
};

const SOURCE_LABEL = {
  generated: 'Generated',
  uploaded: 'Uploaded',
};

export default function LibraryPage() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ sourceType: 'all', consent: 'all', search: '' });
  const [signedUrls, setSignedUrls] = useState({});
  // (By activity — "the system can auto group them base on the activity")
  const [view, setView] = useState('all'); // 'all' | 'activity'
  const [sessionsById, setSessionsById] = useState({});
  // (Delete — "i should also be able to easily delete them")
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmIds, setConfirmIds] = useState(null); // array of ids awaiting the confirm dialog
  const [deleting, setDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState('');

  useEffect(() => {
    fetch('/api/images')
      .then(r => r.json())
      .then(data => {
        // Tolerate the graceful-degradation shape ({ configured:false }): treat a
        // non-array as an empty library rather than crashing on .forEach/.filter.
        const list = Array.isArray(data) ? data : [];
        setImages(list);
        setLoading(false);
        // URLs are pre-signed server-side and included in the response
        const map = {};
        list.forEach(img => { if (img.url) map[img.storage_path] = img.url; });
        setSignedUrls(map);
      })
      .catch(() => setLoading(false));
    // Session titles for the "By activity" headers — one fetch, joined client-side.
    // Both the visible list and the archived tail, so older lineage still names itself.
    Promise.all([
      fetch('/api/sessions').then(r => r.json()).catch(() => ({})),
      fetch('/api/sessions?archived=1').then(r => r.json()).catch(() => ({})),
    ]).then(([recent, archived]) => {
      const map = {};
      for (const s of [...(recent?.sessions || []), ...(archived?.sessions || [])]) {
        if (s?.id) map[s.id] = { title: s.title, updated_at: s.updated_at };
      }
      setSessionsById(map);
    }).catch(() => {});
  }, []);

  const filtered = images.filter(img => {
    if (filter.sourceType !== 'all' && img.source_type !== filter.sourceType) return false;
    if (filter.consent !== 'all' && img.consent_status !== filter.consent) return false;
    if (filter.search && !img.filename.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  const activityGroups = useMemo(
    () => (view === 'activity' ? groupImagesBySession(filtered, sessionsById) : []),
    [view, filtered, sessionsById],
  );

  const toggleSelected = id => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Deletion is PERMANENT (storage object + row), so the confirm dialog is
  // required — never a one-tap destroy.
  const performDelete = async ids => {
    setDeleting(true);
    setDeleteNotice('');
    const gone = [];
    for (const id of ids) {
      try {
        const res = await fetch(`/api/images?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (data?.deleted) gone.push(id);
      } catch { /* reported below via the count */ }
    }
    setImages(prev => prev.filter(img => !gone.includes(img.id)));
    setSelected(new Set());
    setSelectMode(false);
    setConfirmIds(null);
    setDeleting(false);
    if (gone.length < ids.length) {
      setDeleteNotice(`Deleted ${gone.length} of ${ids.length} — the rest couldn't be removed just now. Please try again.`);
    }
  };

  const cardActions = img => ({
    selectMode,
    isSelected: selected.has(img.id),
    onToggleSelect: () => toggleSelected(img.id),
    onDelete: () => setConfirmIds([img.id]),
  });

  const renderGrid = list => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
      {list.map(img => (
        <ImageCard key={img.id} img={img} url={signedUrls[img.storage_path]} {...cardActions(img)} />
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--tw-smoke)' }}>
      <Nav section="library" />
      <style>{`
        .library-card-del{position:absolute;top:8px;right:8px;z-index:2;width:26px;height:26px;border-radius:13px;border:none;background:rgba(45,45,45,0.82);color:#fff;font-size:13px;line-height:1;cursor:pointer;display:grid;place-items:center;opacity:0;transition:opacity 120ms ease}
        .library-card:hover .library-card-del,.library-card:focus-within .library-card-del{opacity:1}
        @media(hover:none){.library-card-del{opacity:1}}
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header + filters */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 400, color: 'var(--fg-strong)', letterSpacing: '-0.01em', marginBottom: 4 }}>Asset Library</h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#6B6560' }}>{images.length} image{images.length !== 1 ? 's' : ''} stored</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => { setSelectMode(m => !m); setSelected(new Set()); }}
              aria-pressed={selectMode}
              style={{ padding: '10px 20px', background: selectMode ? 'var(--tw-burnham)' : 'transparent', color: selectMode ? '#fff' : 'var(--tw-burnham)', border: '1.5px solid var(--tw-burnham)', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer' }}>
              {selectMode ? 'Done' : 'Select'}
            </button>
            {selectMode && selected.size > 0 && (
              <button
                onClick={() => setConfirmIds([...selected])}
                style={{ padding: '10px 20px', background: '#CC3333', color: '#fff', border: 'none', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer' }}>
                Delete {selected.size}
              </button>
            )}
            <Link href="/upload" style={{ padding: '11px 24px', background: 'var(--tw-tangerine)', color: '#fff', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
              + Upload
            </Link>
          </div>
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
            options={[{ value: 'all', label: 'All' }, { value: 'generated', label: 'Generated' }, { value: 'uploaded', label: 'Uploaded' }]}
            onChange={v => setFilter(f => ({ ...f, sourceType: v }))}
          />
          <FilterChips
            label="Consent"
            value={filter.consent}
            options={[{ value: 'all', label: 'All' }, { value: 'na', label: 'N/A' }, { value: 'cleared', label: 'Cleared' }, { value: 'pending', label: 'Pending' }, { value: 'blocked', label: 'Blocked' }]}
            onChange={v => setFilter(f => ({ ...f, consent: v }))}
          />
          <FilterChips
            label="View"
            value={view}
            options={[{ value: 'all', label: 'All' }, { value: 'activity', label: 'By activity' }]}
            onChange={setView}
          />
        </div>

        {deleteNotice && (
          <p role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#CC3333', marginBottom: 16 }}>{deleteNotice}</p>
        )}

        {/* Grid / activity groups */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', fontFamily: 'var(--font-ui)', color: 'var(--tw-burnham)', fontSize: 13, letterSpacing: 2 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState hasImages={images.length > 0} />
        ) : view === 'activity' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {activityGroups.map(group => (
              <section key={group.sessionId || 'unlinked'}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 400, color: 'var(--fg-strong)' }}>{group.title}</h2>
                  {group.newestAt > 0 && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#6B6560' }}>
                      {new Date(group.newestAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#6B6560' }}>
                    {group.items.length} image{group.items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {group.sessionId === null && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#6B6560', margin: '0 0 12px' }}>
                    These images were added before activity tracking, so they aren't linked to a post.
                  </p>
                )}
                {renderGrid(group.items)}
              </section>
            ))}
          </div>
        ) : (
          renderGrid(filtered)
        )}
      </div>

      {/* Delete confirm dialog — deletion is permanent, so this is required. */}
      {confirmIds && (
        <div role="dialog" aria-modal="true" aria-label="Confirm delete"
          onClick={() => !deleting && setConfirmIds(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(37,45,40,0.55)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: '24px 26px', maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700, color: 'var(--tw-jet)', marginBottom: 8 }}>
              Delete {confirmIds.length === 1 ? 'this image' : `${confirmIds.length} images`}?
            </div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#6B6560', lineHeight: 1.55, marginBottom: 18 }}>
              This permanently deletes {confirmIds.length === 1 ? 'the image' : 'these images'} from your library. This can't be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmIds(null)} disabled={deleting}
                style={{ padding: '9px 18px', background: 'transparent', color: 'var(--tw-burnham)', border: '1.5px solid rgba(184,176,168,0.6)', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' }}>
                Keep
              </button>
              <button onClick={() => performDelete(confirmIds)} disabled={deleting}
                style={{ padding: '9px 18px', background: '#CC3333', color: '#fff', border: 'none', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: deleting ? 'wait' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageCard({ img, url, selectMode, isSelected, onToggleSelect, onDelete }) {
  const badge = CONSENT_BADGE[img.consent_status] || null;   // 'na' carries no badge (source-neutral)
  const isBlocked = img.consent_status === 'blocked';

  const card = (
    <div className="library-card" style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${isSelected ? 'var(--tw-burnham)' : isBlocked ? 'rgba(204,51,51,0.3)' : 'rgba(184,176,168,0.3)'}`, position: 'relative', boxShadow: isSelected ? '0 0 0 2px rgba(43,80,64,0.25)' : 'none' }}>
      {!selectMode && (
        <button type="button" className="library-card-del" aria-label={`Delete ${img.filename}`} title="Delete this image (permanent)"
          onClick={e => { e.stopPropagation(); onDelete(); }}>✕</button>
      )}
      {selectMode && (
        <div aria-hidden="true" style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 24, height: 24, borderRadius: 12, border: `2px solid ${isSelected ? 'var(--tw-burnham)' : 'rgba(255,255,255,0.9)'}`, background: isSelected ? 'var(--tw-burnham)' : 'rgba(45,45,45,0.35)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, lineHeight: 1 }}>
          {isSelected ? '✓' : ''}
        </div>
      )}
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
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: 1, color: '#6B6560', textTransform: 'uppercase' }}>{SOURCE_LABEL[img.source_type] || '—'}</span>
          {badge && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 7px', borderRadius: 4 }}>{badge.label}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#aaa' }}>
            {new Date(img.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          {!selectMode && url && !isBlocked && (
            <a className="library-save-action" aria-label={`Save ${img.filename}`} href={url} download={img.filename} target="_blank" rel="noreferrer"
              style={{ fontFamily: 'var(--font-syne)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tw-burnham)', background: 'var(--tw-celadon-soft)', padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer', textDecoration: 'none' }}>
              ↓ Save
            </a>
          )}
        </div>
      </div>
    </div>
  );

  // In select mode the whole card is one big toggle target.
  if (selectMode) {
    return (
      <button type="button" onClick={onToggleSelect} aria-pressed={isSelected} aria-label={`${isSelected ? 'Deselect' : 'Select'} ${img.filename}`}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        {card}
      </button>
    );
  }
  return card;
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
        {hasImages ? 'Try clearing your filters.' : 'Upload your first image to get started — generated photos land here automatically too.'}
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
