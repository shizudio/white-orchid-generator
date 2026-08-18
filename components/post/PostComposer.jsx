'use client';

/* ─────────────────────────────────────────────────────────────────────────
   THE USER APP — docs/template-system-spec.md §8.

   BUILT FRESH. This file imports NOTHING from components/Generator.jsx (§4:
   "DO NOT SUBTRACT IT FROM Generator.jsx"). The admin app keeps running,
   untouched; the only shared code is the render core.

   NO GALLERY in v1 (orchestrator ruling): one template makes a gallery
   meaningless, and it would force the front-door question prematurely. The
   route opens directly on template one's fill surface.

   WHAT IS PERMANENTLY ABSENT (§3 non-goals): drag, pan, zoom, rotate, any
   font-size control, free colour picking, layout editing. When a need cannot be
   expressed as a slot value the answer is "the designer will make a template" —
   never "add a control." The first control added here outside the template
   contract is the beginning of a rebuild of the thing being escaped.
   ───────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DIMENSIONS, slotConstraint } from '@/lib/templates/template-contract.mjs';
import { renderTemplate } from '@/lib/render-core/render-template.mjs';
import { TEMPLATE_LABEL_HEADLINE } from '@/lib/templates/index.mjs';

const TEMPLATE = TEMPLATE_LABEL_HEADLINE;
const DIM_ORDER = ['portrait', 'story', 'square', 'landscape'];

const FIELD_LABELS = {
  eyebrow: { label: 'Small label', hint: 'A few words in capitals, like OUR BELIEF' },
  heading: { label: 'The line that carries the post', hint: 'One sentence. This is the big serif type.' },
  body: { label: 'A short line underneath', hint: 'Optional — the practical detail.' },
};

const LOGO_LABELS = {
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'top-right': 'Top right',
  'top-left': 'Top left',
};

const SEED = {
  eyebrow: 'OUR BELIEF',
  heading: 'Every child is capable of leading their own day',
  body: 'Enrolling now for the autumn term',
};

export default function PostComposer() {
  const textSlots = TEMPLATE.paintOrder;

  const [values, setValues] = useState(() => {
    const v = {};
    for (const s of textSlots) v[s] = SEED[s] ?? '';
    return v;
  });
  const [colourPairId, setColourPairId] = useState(TEMPLATE.colourPairs[0].id);
  const [logoPosition, setLogoPosition] = useState(TEMPLATE.allowedLogoPositions[0]);
  const [truths, setTruths] = useState({});
  const [logos, setLogos] = useState({ light: null, dark: null });
  const [fontsReady, setFontsReady] = useState(false);

  // §8.1 requirement 2 — VISIBLY REVERTIBLE. Her original is kept alongside the
  // rewrite until she takes or discards it; nothing is overwritten silently.
  const [improve, setImprove] = useState({ slot: null, busy: false, original: null, improved: null, note: null });

  const canvasRefs = useRef({});
  const pair = useMemo(
    () => TEMPLATE.colourPairs.find((p) => p.id === colourPairId) || TEMPLATE.colourPairs[0],
    [colourPairId],
  );

  // Brand marks — real assets only (law 3), one per colour class.
  useEffect(() => {
    let alive = true;
    const load = (src) => new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
    Promise.all([load(TEMPLATE.logoAssets.light), load(TEMPLATE.logoAssets.dark)])
      .then(([light, dark]) => { if (alive) setLogos({ light, dark }); });
    return () => { alive = false; };
  }, []);

  // Webfonts must be decoded before the first paint or the wrap measures against
  // a fallback face and the four renders disagree with the baked budgets.
  useEffect(() => {
    let alive = true;
    if (typeof document === 'undefined' || !document.fonts) { setFontsReady(true); return undefined; }
    document.fonts.ready.then(() => { if (alive) setFontsReady(true); });
    return () => { alive = false; };
  }, []);

  // ── THE FOUR RENDERS. All four are shown together (§5). ───────────────────
  const paint = useCallback(() => {
    const next = {};
    const logoImage = pair.klass === 'dark' ? logos.dark : logos.light;
    for (const dimId of DIM_ORDER) {
      const canvas = canvasRefs.current[dimId];
      if (!canvas) continue;
      const dim = DIMENSIONS[dimId];
      if (canvas.width !== dim.w || canvas.height !== dim.h) { canvas.width = dim.w; canvas.height = dim.h; }
      const ctx = canvas.getContext('2d');
      next[dimId] = renderTemplate(ctx, TEMPLATE, dimId, { ...values, colourPairId, logoPosition, logoImage });
    }
    setTruths(next);
  }, [values, colourPairId, logoPosition, logos, pair]);

  useEffect(() => { paint(); }, [paint, fontsReady]);

  // ── §7.2 OVER-BUDGET → EXPORT BLOCKED for the affected dimension ──────────
  // maxLength is the primary guard; a hard break can still push copy past
  // maxLines while under the budget, so this second, MEASURED check decides.
  const blocked = useMemo(() => {
    const perDim = {};
    const perSlot = {};
    for (const [dimId, truth] of Object.entries(truths)) {
      const over = truth?.overBudgetSlots || [];
      if (over.length) {
        perDim[dimId] = over;
        for (const s of over) (perSlot[s] ||= []).push(dimId);
      }
    }
    return { perDim, perSlot, any: Object.keys(perDim).length > 0 };
  }, [truths]);

  const setSlot = (slot, text) => setValues((v) => ({ ...v, [slot]: text }));

  // ── ONE-CLICK IMPROVE (§8.1). A PAID call — the only one in this app. ──────
  async function runImprove(slot) {
    const original = values[slot];
    if (!original.trim() || improve.busy) return;
    setImprove({ slot, busy: true, original, improved: null, note: null });
    try {
      const res = await fetch('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, text: original, templateId: TEMPLATE.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.configured && data.improved) {
        setImprove({ slot, busy: false, original, improved: data.improved, note: null });
      } else {
        // Graceful degradation: an honest line, her words untouched, and the
        // offline tidy offered rather than silently applied.
        setImprove({
          slot, busy: false, original,
          improved: data.fallback || null,
          note: data.reason || 'Improve is not available right now. Your words are unchanged.',
        });
      }
    } catch {
      setImprove({ slot, busy: false, original, improved: null, note: 'Could not reach the writing service. Your words are unchanged.' });
    }
  }
  function acceptImprove() {
    if (!improve.slot || !improve.improved) return;
    setSlot(improve.slot, improve.improved);
    setImprove({ slot: null, busy: false, original: null, improved: null, note: null });
  }
  function discardImprove() {
    // One tap back to exactly what she wrote — nothing was overwritten anyway.
    setImprove({ slot: null, busy: false, original: null, improved: null, note: null });
  }

  // ── EXPORT ────────────────────────────────────────────────────────────────
  function download(dimId) {
    if (blocked.perDim[dimId]) return;
    const canvas = canvasRefs.current[dimId];
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `white-orchid-${TEMPLATE.id}-${dimId}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }
  function downloadAll() {
    for (const dimId of DIM_ORDER) if (!blocked.perDim[dimId]) download(dimId);
  }

  return (
    <main style={S.page}>
      {/* (M9 — the desktop regression and its mirror) The two-column split is a
          desktop affordance; below 900px it stacks. Inline styles cannot carry a
          media query, so the ONE responsive rule lives here rather than leaking
          user-app styling into the shared globals.css the admin app also reads. */}
      <style>{`
        .wo-post-split { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 40px; align-items: start; }
        .wo-post-previews { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; align-items: start; }
        @media (max-width: 900px) {
          .wo-post-split { grid-template-columns: 1fr; gap: 28px; }
          .wo-post-previews { gap: 16px; }
        }
      `}</style>
      <header style={S.header}>
        <div>
          <h1 style={S.title}>{TEMPLATE.name}</h1>
          <p style={S.purpose}>{TEMPLATE.purpose}</p>
        </div>
      </header>

      <div className="wo-post-split" style={S.split}>
        {/* ── FILL ─────────────────────────────────────────────────────────── */}
        <section style={S.panel} aria-label="Your words">
          {textSlots.map((slot) => {
            const budget = TEMPLATE.slots[slot].charBudget;
            const used = values[slot].length;
            const meta = FIELD_LABELS[slot] || { label: slot, hint: '' };
            const breaksIn = blocked.perSlot[slot] || [];
            const showImprove = improve.slot === slot;
            return (
              <div key={slot} style={S.field}>
                <div style={S.fieldHead}>
                  <label htmlFor={`slot-${slot}`} style={S.label}>{meta.label}</label>
                  <span style={{ ...S.counter, color: used >= budget ? 'var(--tw-tangerine, #F6644E)' : 'var(--fg-muted, #6b6f6b)' }}>
                    {used}/{budget}
                  </span>
                </div>
                <textarea
                  id={`slot-${slot}`}
                  value={values[slot]}
                  maxLength={budget}
                  rows={slot === 'heading' ? 3 : 2}
                  onChange={(e) => setSlot(slot, e.target.value)}
                  style={{ ...S.input, borderColor: breaksIn.length ? 'var(--tw-tangerine, #F6644E)' : 'var(--line, rgba(37,78,72,0.18))' }}
                />
                <p style={S.hint}>{meta.hint}</p>

                {breaksIn.length > 0 && (
                  <p role="status" style={S.warn}>
                    Your line breaks make this too tall for {breaksIn.map((d) => DIMENSIONS[d].label).join(' and ')}.
                    Remove a break to download {breaksIn.length > 1 ? 'those sizes' : 'that size'}.
                  </p>
                )}

                <div style={S.row}>
                  <button type="button" onClick={() => runImprove(slot)} disabled={improve.busy || !values[slot].trim()} style={S.ghostBtn}>
                    {improve.busy && improve.slot === slot ? 'Improving…' : 'Improve this line'}
                  </button>
                </div>

                {showImprove && !improve.busy && (
                  <div style={S.improve}>
                    {improve.note && <p style={S.note}>{improve.note}</p>}
                    <div style={S.compare}>
                      <div style={S.compareCol}>
                        <span style={S.compareLabel}>What you wrote</span>
                        <p style={S.compareText}>{improve.original}</p>
                      </div>
                      {improve.improved && (
                        <div style={S.compareCol}>
                          <span style={S.compareLabel}>Suggested</span>
                          <p style={S.compareText}>{improve.improved}</p>
                        </div>
                      )}
                    </div>
                    <div style={S.row}>
                      {improve.improved && (
                        <button type="button" onClick={acceptImprove} style={S.primaryBtn}>Use the suggestion</button>
                      )}
                      <button type="button" onClick={discardImprove} style={S.ghostBtn}>Keep my words</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Pre-verified pairs ONLY — no colour picking (§3). */}
          <div style={S.field}>
            <span style={S.label}>Colour</span>
            <div style={S.chips}>
              {TEMPLATE.colourPairs.map((p) => (
                <button
                  key={p.id} type="button" onClick={() => setColourPairId(p.id)}
                  aria-pressed={p.id === colourPairId}
                  title={`${p.label} — contrast ${p.contrast}:1`}
                  style={{ ...S.swatch, background: p.bg, color: p.ink, outline: p.id === colourPairId ? '2px solid var(--fg-strong, #254E48)' : '1px solid rgba(37,78,72,0.18)' }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Logo position from the template's allowlist — never a drag (§3). */}
          <div style={S.field}>
            <span style={S.label}>Where the mark sits</span>
            <div style={S.chips}>
              {TEMPLATE.allowedLogoPositions.map((p) => (
                <button
                  key={p} type="button" onClick={() => setLogoPosition(p)} aria-pressed={p === logoPosition}
                  style={{ ...S.chip, ...(p === logoPosition ? S.chipOn : null) }}
                >
                  {LOGO_LABELS[p] || p}
                </button>
              ))}
            </div>
          </div>

          <div style={S.field}>
            <button type="button" onClick={downloadAll} disabled={blocked.any && Object.keys(blocked.perDim).length === DIM_ORDER.length} style={S.primaryBtn}>
              Download all sizes
            </button>
            {blocked.any && (
              <p style={S.warn}>
                {Object.keys(blocked.perDim).map((d) => DIMENSIONS[d].label).join(', ')} {Object.keys(blocked.perDim).length > 1 ? 'are' : 'is'} on hold until the line breaks fit.
              </p>
            )}
          </div>
        </section>

        {/* ── ALL FOUR DIMENSIONS, TOGETHER (§5) ───────────────────────────── */}
        <section className="wo-post-previews" style={S.previews} aria-label="Your post in all four sizes">
          {DIM_ORDER.map((dimId) => {
            const dim = DIMENSIONS[dimId];
            const isBlocked = !!blocked.perDim[dimId];
            const truth = truths[dimId];
            return (
              <figure key={dimId} style={S.preview}>
                <canvas
                  ref={(el) => { canvasRefs.current[dimId] = el; }}
                  style={{ ...S.canvas, aspectRatio: `${dim.w} / ${dim.h}`, opacity: isBlocked ? 0.45 : 1 }}
                />
                <figcaption style={S.caption}>
                  <span>{dim.label}</span>
                  <button type="button" onClick={() => download(dimId)} disabled={isBlocked} style={S.smallBtn}>
                    {isBlocked ? 'On hold' : 'Download'}
                  </button>
                </figcaption>
                {truth && (
                  <span style={S.truth}>
                    {truth.width}×{truth.height}
                    {slotConstraint(TEMPLATE, 'heading', dimId) ? ` · heading ${truth.slots.heading?.paintedPx}px` : ''}
                  </span>
                )}
              </figure>
            );
          })}
        </section>
      </div>
    </main>
  );
}

/* ── Styles. Brand tokens from app/globals.css; nothing invented here. ────── */
const S = {
  page: { minHeight: '100vh', background: 'var(--bg, #F5F6E7)', padding: '32px 24px 64px' },
  header: { maxWidth: 1280, margin: '0 auto 28px' },
  title: { fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 400, color: 'var(--fg-strong, #254E48)', margin: 0 },
  purpose: { fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.55, color: 'var(--fg-muted, #6b6f6b)', margin: '8px 0 0', maxWidth: 640 },
  // grid columns/gap come from the .wo-post-split rule above (media-query aware).
  split: { maxWidth: 1280, margin: '0 auto' },
  panel: { display: 'flex', flexDirection: 'column', gap: 26, minWidth: 0 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { fontFamily: 'var(--font-syne)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-strong, #254E48)' },
  counter: { fontFamily: 'var(--font-body)', fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  input: { fontFamily: 'var(--font-body)', fontSize: 16, lineHeight: 1.5, color: 'var(--fg-strong, #254E48)', background: '#fff', border: '1.5px solid', borderRadius: 12, padding: '10px 12px', resize: 'vertical', outline: 'none' },
  hint: { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted, #6b6f6b)', margin: 0 },
  warn: { fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--tw-tangerine, #F6644E)', margin: '4px 0 0' },
  note: { fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-muted, #6b6f6b)', margin: '0 0 8px' },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  improve: { border: '1px solid var(--line, rgba(37,78,72,0.18))', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.6)' },
  compare: { display: 'grid', gridTemplateColumns: '1fr', gap: 10 },
  compareCol: { display: 'flex', flexDirection: 'column', gap: 2 },
  compareLabel: { fontFamily: 'var(--font-syne)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-muted, #6b6f6b)' },
  compareText: { fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.5, color: 'var(--fg-strong, #254E48)', margin: 0, whiteSpace: 'pre-wrap' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, padding: '0 16px', borderRadius: 22, border: '1px solid var(--line, rgba(37,78,72,0.18))', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-strong, #254E48)', cursor: 'pointer' },
  chipOn: { background: 'var(--fg-strong, #254E48)', color: '#F5F6E7', borderColor: 'var(--fg-strong, #254E48)' },
  swatch: { minHeight: 44, minWidth: 88, padding: '0 16px', borderRadius: 22, border: 'none', fontFamily: 'var(--font-body)', fontSize: 14, cursor: 'pointer' },
  primaryBtn: { minHeight: 44, padding: '0 20px', borderRadius: 22, border: 'none', background: 'var(--fg-strong, #254E48)', color: '#F5F6E7', fontFamily: 'var(--font-body)', fontSize: 15, cursor: 'pointer' },
  ghostBtn: { minHeight: 44, padding: '0 16px', borderRadius: 22, border: '1px solid var(--line, rgba(37,78,72,0.18))', background: 'transparent', color: 'var(--fg-strong, #254E48)', fontFamily: 'var(--font-body)', fontSize: 14, cursor: 'pointer' },
  smallBtn: { minHeight: 32, padding: '0 12px', borderRadius: 16, border: '1px solid var(--line, rgba(37,78,72,0.18))', background: 'transparent', color: 'var(--fg-strong, #254E48)', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer' },
  previews: { minWidth: 0 },
  preview: { margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  canvas: { width: '100%', height: 'auto', display: 'block', borderRadius: 8, border: '1px solid var(--line, rgba(37,78,72,0.14))' },
  caption: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontFamily: 'var(--font-syne)', fontSize: 12, fontWeight: 500, letterSpacing: '0.04em', color: 'var(--fg-strong, #254E48)' },
  truth: { fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-muted, #6b6f6b)' },
};
