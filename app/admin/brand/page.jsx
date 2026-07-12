'use client';
import { useState, useEffect, useRef } from 'react';
import Nav from '@/components/Nav';

// ── Decorative-asset classification (Declutter item 7) ───────────────────────
// Mirrors the classifier the editor used for its (now removed) free-form
// uploader: sample where the ink sits to decide frame / strip / corner /
// center, so + Add places the asset sensibly on first tap.
function classifyOverlayImage(img) {
  const N = 64;
  const ratio = (img.width / img.height) || 1;
  try {
    const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const x = cv.getContext('2d');
    const s = Math.min(N / img.width, N / img.height);
    const dw = img.width * s, dh = img.height * s;
    x.drawImage(img, (N - dw) / 2, (N - dh) / 2, dw, dh);
    const d = x.getImageData(0, 0, N, N).data;
    let minX = N, minY = N, maxX = 0, maxY = 0, ink = 0;
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      if (d[(yy * N + xx) * 4 + 3] > 20) { ink++; if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
    }
    if (ink === 0) return { kind: 'center', ratio };
    const bw = maxX - minX, bh = maxY - minY, coverage = ink / (N * N);
    const edges = (minX <= 2 ? 1 : 0) + (minY <= 2 ? 1 : 0) + (maxX >= N - 3 ? 1 : 0) + (maxY >= N - 3 ? 1 : 0);
    let centerInk = 0, centerN = 0;
    for (let yy = Math.floor(N * 0.35); yy < N * 0.65; yy++) for (let xx = Math.floor(N * 0.35); xx < N * 0.65; xx++) { centerN++; if (d[(yy * N + xx) * 4 + 3] > 20) centerInk++; }
    const hollow = centerInk / centerN < 0.15;
    if (edges >= 4 && hollow) return { kind: 'frame', ratio };
    if (edges >= 3) return { kind: 'frame', ratio };
    if (bw >= N * 0.7 && bh <= N * 0.45) return { kind: 'strip', ratio };
    if (bh >= N * 0.7 && bw <= N * 0.45) return { kind: 'strip', ratio };
    if (coverage < 0.2) return { kind: 'corner', ratio };
    return { kind: 'center', ratio };
  } catch { return { kind: 'center', ratio }; }
}

export default function BrandKitPage() {
  const [kit, setKit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // (Declutter item 7) Official decorative assets — uploaded HERE (owner-only
  // surface), served to everyone in the editor's + Add → Shapes/Decoration.
  const [assets, setAssets] = useState([]);
  const [assetsConfigured, setAssetsConfigured] = useState(true);
  const [assetNote, setAssetNote] = useState('');
  const [assetBusy, setAssetBusy] = useState(false);
  const assetInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/brand').then(r => r.json()).then(d => { if (d.error) setError(d.error); else setKit(d); });
    fetch('/api/brand-assets').then(r => r.json()).then(d => {
      setAssetsConfigured(d?.configured !== false);
      setAssets(Array.isArray(d?.assets) ? d.assets : []);
    }).catch(() => setAssetsConfigured(false));
  }, []);

  const uploadAsset = async (file) => {
    if (!file || assetBusy) return;
    if (!/image\/(svg\+xml|png)/.test(file.type)) { setAssetNote('Please choose an SVG or PNG file.'); return; }
    if (file.size > 300 * 1024) { setAssetNote('Keep decorative assets under ~300KB.'); return; }
    setAssetBusy(true); setAssetNote('');
    try {
      const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = dataUrl; });
      const { kind, ratio } = img ? classifyOverlayImage(img) : { kind: 'center', ratio: 1 };
      const name = file.name.replace(/\.[^.]+$/, '');
      const res = await fetch('/api/brand-assets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dataUrl, kind, ratio }),
      });
      const d = await res.json().catch(() => ({}));
      if (d?.asset?.src) { setAssets(prev => [d.asset, ...prev]); setAssetNote('Added — it’s now in the studio’s Shapes inspector (＋ Add shape) for everyone.'); }
      else if (d?.configured === false) { setAssetsConfigured(false); setAssetNote(d.error || 'Cloud storage isn’t configured — assets can’t be shared yet.'); }
      else setAssetNote(d?.error || 'That upload didn’t go through — please try again.');
    } finally {
      setAssetBusy(false);
    }
  };

  const deleteAsset = async (id) => {
    setAssets(prev => prev.filter(a => a.id !== id));
    try { await fetch(`/api/brand-assets?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch { /* list already updated */ }
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    const res = await fetch('/api/brand', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colors: kit.colors, font_heading: kit.font_heading, font_body: kit.font_body, font_ui: kit.font_ui, guardrails: kit.guardrails }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.error) setError(d.error); else { setKit(d); setSaved(true); setTimeout(() => setSaved(false), 3000); }
  };

  const updateColor = (i, field, val) => {
    const colors = [...kit.colors];
    colors[i] = { ...colors[i], [field]: val };
    setKit({ ...kit, colors });
  };

  if (error) return <div style={{ padding: 40, color: 'var(--tw-tangerine)', fontFamily: 'var(--font-body)' }}>{error}</div>;
  if (!kit) return <div style={{ padding: 40, fontFamily: 'var(--font-syne)', color: 'var(--tw-burnham)', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 12 }}>Loading…</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Nav section="brand kit" />
      <div className="brand-kit-content" style={{ maxWidth: 760, margin: '0 auto', padding: '56px 32px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-syne)', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 12 }}>Admin</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, color: 'var(--fg-strong)', lineHeight: 1.05, marginBottom: 12 }}>Brand kit</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.6, maxWidth: 480 }}>
            The single source of truth for all visual output. Changes here apply to every post generated by school staff.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', marginBottom: 48 }} />

        {/* Colour palette */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-syne)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 20 }}>Colour palette</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {kit.colors.map((c, i) => (
              <div className="brand-color-row" key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-raised)', borderRadius: 'var(--radius-md)', padding: '10px 16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-xs)' }}>
                <div className="brand-color-swatch" style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: c.hex, flexShrink: 0, border: '1px solid var(--line)' }} />
                <input aria-label={`${c.label} hex colour`} value={c.hex} onChange={e => updateColor(i, 'hex', e.target.value)}
                  className="brand-color-hex"
                  style={{ width: 100, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'monospace', color: 'var(--fg-strong)', background: 'var(--bg)', outline: 'none' }} />
                <input aria-label={`Colour ${i + 1} name`} value={c.label} onChange={e => updateColor(i, 'label', e.target.value)}
                  className="brand-color-label"
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 14, fontFamily: 'var(--font-body)', color: 'var(--fg-strong)', background: 'var(--bg)', outline: 'none' }} />
                <select aria-label={`${c.label} role`} value={c.role} onChange={e => updateColor(i, 'role', e.target.value)}
                  className="brand-color-role"
                  style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--fg-strong)', background: 'var(--bg)', outline: 'none', width: 120 }}>
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                  <option value="accent">Accent</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>
            ))}
          </div>
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', marginBottom: 48 }} />

        {/* Typography */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-syne)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 20 }}>Typography</div>
          <div className="brand-type-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[['Heading / serif', 'font_heading', 'Romie'], ['Body', 'font_body', 'Fira Sans'], ['UI / labels', 'font_ui', 'Syne']].map(([label, key, placeholder]) => (
              <div key={key}>
                <div style={{ fontFamily: 'var(--font-syne)', fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 8 }}>{label}</div>
                <input aria-label={label} value={kit[key]} onChange={e => setKit({ ...kit, [key]: e.target.value })} placeholder={placeholder}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 14, fontFamily: 'var(--font-body)', color: 'var(--fg-strong)', background: 'var(--bg)', outline: 'none' }} />
              </div>
            ))}
          </div>
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', marginBottom: 48 }} />

        {/* Shapes & decorative assets — the owner uploads official SVG/PNG marks
            here; they appear in the editor's Shapes inspector (＋ Add shape) for
            everyone, usable as a photo frame, a solid fill, or an outline. The
            editor itself no longer has an uploader (born-clean: only real assets). */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-syne)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 8 }}>Shapes &amp; decorative assets</div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6, marginBottom: 16, maxWidth: 520 }}>
            Official shapes and decoration marks (SVG or PNG). Anything uploaded here becomes available to every staff member in the studio’s Shapes inspector (＋ Add shape) — usable as a photo frame, a solid fill, or an outline. This is the only place new shape art enters the brand.
          </p>
          <input ref={assetInputRef} type="file" accept="image/svg+xml,image/png" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(f); e.target.value = ''; }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 12 }}>
            <button type="button" onClick={() => assetInputRef.current?.click()} disabled={assetBusy}
              style={{ aspectRatio: '1/1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: '1px dashed var(--line)', borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)', cursor: assetBusy ? 'wait' : 'pointer',
                fontFamily: 'var(--font-syne)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>＋</span>
              {assetBusy ? 'Uploading…' : 'Upload SVG/PNG'}
            </button>
            {assets.map(a => (
              <div key={a.id} style={{ position: 'relative' }}>
                <div style={{ aspectRatio: '1/1', display: 'grid', placeItems: 'center', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)', padding: 10, overflow: 'hidden' }}>
                  <img src={a.src} alt={a.name} style={{ maxWidth: '100%', maxHeight: '78%', objectFit: 'contain' }} />
                </div>
                <button type="button" title={`Remove ${a.name}`} aria-label={`Remove ${a.name}`} onClick={() => deleteAsset(a.id)}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: 'var(--fg-strong)', color: '#fff', fontSize: 12, lineHeight: '20px', cursor: 'pointer', padding: 0 }}>×</button>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 6, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              </div>
            ))}
          </div>
          {!assetsConfigured && (
            <p role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 12 }}>
              Cloud storage isn’t configured, so shared decorative assets are unavailable — the studio keeps its built-in petal shapes.
            </p>
          )}
          {assetNote && assetsConfigured && (
            <p role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tw-celadon-deep)', marginTop: 12 }}>{assetNote}</p>
          )}
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', marginBottom: 48 }} />

        {/* Guardrails */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-syne)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 8 }}>Content guardrails</div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6, marginBottom: 16 }}>
            Shown to staff before export. Consent rules, tone-of-voice standards, anything to check before posting.
          </p>
          <textarea aria-label="Content guardrails" value={kit.guardrails} onChange={e => setKit({ ...kit, guardrails: e.target.value })}
            style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', fontSize: 14, fontFamily: 'var(--font-body)', color: 'var(--fg-strong)', background: 'var(--bg)', outline: 'none', resize: 'vertical', minHeight: 120, lineHeight: 1.6 }} />
        </section>

        {/* Save */}
        <div className="brand-save-row" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={save} disabled={saving}
            style={{ padding: '14px 40px', background: saving ? 'var(--tw-ash)' : 'var(--tw-burnham)', color: saving ? 'var(--fg-muted)' : '#fff', border: 'none', borderRadius: 'var(--radius-2xl)', fontFamily: 'var(--font-syne)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 140ms' }}>
            {saving ? 'Saving…' : 'Save brand kit'}
          </button>
          {saved && <span style={{ fontFamily: 'var(--font-syne)', fontSize: 12, fontWeight: 600, color: 'var(--tw-celadon-deep)', letterSpacing: '0.06em' }}>✓ Saved</span>}
          {error && <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tw-tangerine)' }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}
