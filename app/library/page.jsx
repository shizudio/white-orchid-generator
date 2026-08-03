'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { groupImagesByActivity, imageActivityLabel, NOT_CATEGORIZED_KEY } from '@/lib/activity-labels.mjs';

// (Media organization — client ruling 2026-07-29) The taxonomy is activity-based:
// generated | uploaded ("the midjourney tag is outdated"). /api/images maps any
// legacy stored value to this vocabulary, so this page never sees the old tags.
// (Consent removed — client ruling 2026-08-03: "remove the consent category")
// consent_status still arrives on rows (dormant DB column) and is IGNORED here:
// no filter, no badges, no blocked gating.
// (By activity — client ruling 2026-08-03) the view groups by DETECTED activity
// (metadata.activity, written by the vision categorizer or the owner), not by
// session lineage; lineage stays recorded on rows.
const SOURCE_LABEL = {
  generated: 'Generated',
  uploaded: 'Uploaded',
};

export default function LibraryPage() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ sourceType: 'all', search: '' });
  const [signedUrls, setSignedUrls] = useState({});
  const [view, setView] = useState('all'); // 'all' | 'activity'
  // (Delete — "i should also be able to easily delete them")
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmIds, setConfirmIds] = useState(null); // array of ids awaiting the confirm dialog
  const [deleting, setDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState('');
  // (Categorize — a user-invoked PAID action; never runs on its own)
  const [catRun, setCatRun] = useState(null); // { done, total } while running
  const [catNotice, setCatNotice] = useState('');
  // (Change group — owner relabel; pinned against future categorize runs)
  const [regroupImg, setRegroupImg] = useState(null);

  const loadImages = useCallback(() => {
    return fetch('/api/images')
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
        return list;
      })
      .catch(() => { setLoading(false); return []; });
  }, []);

  useEffect(() => { loadImages(); }, [loadImages]);

  const filtered = images.filter(img => {
    if (filter.sourceType !== 'all' && img.source_type !== filter.sourceType) return false;
    if (filter.search && !img.filename.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  const activityGroups = useMemo(
    () => (view === 'activity' ? groupImagesByActivity(filtered) : []),
    [view, filtered],
  );
  // Honest count for the button: the WHOLE library's unlabeled rows (the run
  // processes everything unlabeled, not just what the current filters show).
  const unlabeledCount = useMemo(
    () => images.filter(img => !imageActivityLabel(img)).length,
    [images],
  );
  const existingLabels = useMemo(
    () => groupImagesByActivity(images).filter(g => g.categorized).map(g => g.label),
    [images],
  );

  // Batch loop: POST /api/images/categorize until remaining === 0. Spends AI
  // credits, so it only ever runs from the button tap; the admin key travels the
  // same way as the brand-library flow (localStorage 'wo-admin-key' →
  // x-wo-admin-key header).
  const runCategorize = async () => {
    setCatNotice('');
    let adminKey = '';
    try { adminKey = localStorage.getItem('wo-admin-key') || ''; } catch {}
    if (!adminKey) {
      setCatNotice("Categorizing needs the owner admin key on this device. In the browser console, run: localStorage.setItem('wo-admin-key', '<your key>') — then try again.");
      return;
    }
    const total = unlabeledCount;
    setCatRun({ done: 0, total });
    let done = 0;
    const skippedAll = [];
    try {
      for (;;) {
        const res = await fetch('/api/images/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-wo-admin-key': adminKey },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) { await new Promise(r => setTimeout(r, 5000)); continue; } // rate-limited → wait and retry
        if (res.status === 403) { setCatNotice('That admin key is wrong — nothing was categorized.'); break; }
        if (data?.configured === false) { setCatNotice('Categorizing isn’t available on this server yet (AI key or storage not configured). Nothing was spent.'); break; }
        if (!res.ok) { setCatNotice(`Categorizing stopped: ${data?.error || res.statusText}. Already-labeled photos are saved.`); break; }
        done += (data.labeled?.length || 0) + (data.skipped?.length || 0);
        skippedAll.push(...(data.skipped || []));
        setCatRun({ done: Math.min(done, total), total });
        if (!data.remaining) {
          setCatNotice(skippedAll.length
            ? `Done — ${done - skippedAll.length} photo${done - skippedAll.length === 1 ? '' : 's'} categorized. ${skippedAll.length} couldn’t be read and stayed uncategorized: ${skippedAll.map(s => s.filename || s.id).slice(0, 3).join(', ')}${skippedAll.length > 3 ? '…' : ''}`
            : `Done — ${done} photo${done === 1 ? '' : 's'} categorized.`);
          break;
        }
      }
    } catch (err) {
      setCatNotice(`Categorizing stopped: ${err?.message || 'network error'}. Already-labeled photos are saved.`);
    }
    await loadImages(); // regroup live with whatever got labeled
    setCatRun(null);
  };

  // Owner relabel — writes metadata.activity with authorship 'owner' (pinned).
  const applyRegroup = async (img, label) => {
    try {
      const res = await fetch(`/api/images?id=${encodeURIComponent(img.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityLabel: label }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.image) {
        setImages(prev => prev.map(i => (i.id === img.id ? { ...i, metadata: data.image.metadata } : i)));
        setRegroupImg(null);
        return;
      }
      setCatNotice(`Couldn’t move that photo: ${data?.error || res.statusText}`);
    } catch (err) {
      setCatNotice(`Couldn’t move that photo: ${err?.message || 'network error'}`);
    }
    setRegroupImg(null);
  };

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
    // "Change group" only in the By-activity view, only on labeled cards.
    onChangeGroup: view === 'activity' && imageActivityLabel(img) ? () => setRegroupImg(img) : null,
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
            label="View"
            value={view}
            options={[{ value: 'all', label: 'All' }, { value: 'activity', label: 'By activity' }]}
            onChange={setView}
          />
        </div>

        {deleteNotice && (
          <p role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#CC3333', marginBottom: 16 }}>{deleteNotice}</p>
        )}

        {/* Categorize control — an honest, user-invoked PAID action. */}
        {view === 'activity' && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 24, background: '#fff', border: '1.5px solid rgba(184,176,168,0.4)', borderRadius: 12, padding: '14px 18px' }}>
            {catRun ? (
              <span role="status" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--tw-burnham)' }}>
                Categorizing… {catRun.done} of {catRun.total}
              </span>
            ) : unlabeledCount > 0 ? (
              <>
                <button
                  onClick={runCategorize}
                  style={{ padding: '10px 22px', background: 'var(--tw-burnham)', color: '#fff', border: 'none', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer' }}>
                  Categorize {unlabeledCount} image{unlabeledCount !== 1 ? 's' : ''}
                </button>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#6B6560', lineHeight: 1.5 }}>
                  Uses AI credits to look at each photo and name its activity. New photos aren’t labeled automatically — they’re categorized next time you run it.
                </span>
              </>
            ) : (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#6B6560' }}>
                Every photo is categorized. New photos are categorized next time you run it.
              </span>
            )}
            {catNotice && (
              <span role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tw-burnham)', flexBasis: '100%' }}>{catNotice}</span>
            )}
          </div>
        )}

        {/* Grid / activity groups */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', fontFamily: 'var(--font-ui)', color: 'var(--tw-burnham)', fontSize: 13, letterSpacing: 2 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState hasImages={images.length > 0} />
        ) : view === 'activity' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {activityGroups.map(group => (
              <section key={group.key}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 400, color: 'var(--fg-strong)', textTransform: group.categorized ? 'capitalize' : 'none' }}>{group.label}</h2>
                  {group.newestAt > 0 && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#6B6560' }}>
                      {new Date(group.newestAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#6B6560' }}>
                    {group.items.length} image{group.items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {group.key === NOT_CATEGORIZED_KEY && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#6B6560', margin: '0 0 12px' }}>
                    These photos haven’t been looked at yet — the Categorize button above sorts them into activity groups.
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

      {/* Change-group dialog — pick an existing group or type a new label. */}
      {regroupImg && (
        <div role="dialog" aria-modal="true" aria-label="Change activity group"
          onClick={() => setRegroupImg(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(37,45,40,0.55)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <RegroupDialog
            img={regroupImg}
            labels={existingLabels}
            onPick={label => applyRegroup(regroupImg, label)}
            onClose={() => setRegroupImg(null)}
          />
        </div>
      )}

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

function RegroupDialog({ img, labels, onPick, onClose }) {
  const [custom, setCustom] = useState('');
  const current = imageActivityLabel(img);
  const others = labels.filter(l => l !== current);
  return (
    <div onClick={e => e.stopPropagation()}
      style={{ background: '#fff', borderRadius: 14, padding: '24px 26px', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700, color: 'var(--tw-jet)', marginBottom: 4 }}>
        Move to a different group
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: '#6B6560', lineHeight: 1.5, marginBottom: 14 }}>
        {img.filename} is in <strong style={{ textTransform: 'capitalize' }}>{current}</strong>. Your choice sticks — automatic categorizing never changes it back.
      </p>
      {others.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {others.map(label => (
            <button key={label} onClick={() => onPick(label)}
              style={{ padding: '7px 13px', borderRadius: 40, border: '1.5px solid rgba(184,176,168,0.5)', background: 'transparent', color: 'var(--tw-jet)', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3, textTransform: 'capitalize' }}>
              {label}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); if (custom.trim()) onPick(custom); }}
        style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          aria-label="New group name"
          placeholder="Or type a new group…"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          style={{ flex: 1, padding: '9px 14px', border: '1.5px solid rgba(184,176,168,0.5)', borderRadius: 10, fontSize: 13, fontFamily: 'var(--font-body)', background: '#fff', outline: 'none' }}
        />
        <button type="submit" disabled={!custom.trim()}
          style={{ padding: '9px 18px', background: custom.trim() ? 'var(--tw-burnham)' : '#ccc', color: '#fff', border: 'none', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: custom.trim() ? 'pointer' : 'not-allowed' }}>
          Move
        </button>
      </form>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onClose}
          style={{ padding: '9px 18px', background: 'transparent', color: 'var(--tw-burnham)', border: '1.5px solid rgba(184,176,168,0.6)', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ImageCard({ img, url, selectMode, isSelected, onToggleSelect, onDelete, onChangeGroup }) {
  const card = (
    <div className="library-card" style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${isSelected ? 'var(--tw-burnham)' : 'rgba(184,176,168,0.3)'}`, position: 'relative', boxShadow: isSelected ? '0 0 0 2px rgba(43,80,64,0.25)' : 'none' }}>
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
          <img src={url} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 32 }}>🖼</div>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--tw-jet)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.filename}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: 1, color: '#6B6560', textTransform: 'uppercase' }}>{SOURCE_LABEL[img.source_type] || '—'}</span>
          {!selectMode && onChangeGroup && (
            <button type="button" onClick={e => { e.stopPropagation(); onChangeGroup(); }}
              aria-label={`Change group for ${img.filename}`}
              style={{ fontFamily: 'var(--font-syne)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tw-burnham)', background: 'transparent', border: '1px solid rgba(43,80,64,0.35)', padding: '3px 9px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}>
              Change group
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#aaa' }}>
            {new Date(img.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          {!selectMode && url && (
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
