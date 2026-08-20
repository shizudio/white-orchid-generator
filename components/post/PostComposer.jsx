'use client';

/* ─────────────────────────────────────────────────────────────────────────
   THE USER APP — docs/template-system-spec.md §8.

   BUILT FRESH. This file imports NOTHING from components/Generator.jsx (§4:
   "DO NOT SUBTRACT IT FROM Generator.jsx"). The admin app keeps running,
   untouched; the only shared code is the render core.

   THE RATIFIED COMPOSITION (client ruling 2026-08-18, amended same day). Two
   panes, one viewport, no page scroll:
     · LEFT  — a ~420px column with its OWN scroll: template selector, the copy
               fields, colour, mark, photo; "Download all" anchored at the
               bottom of the panel so it never scrolls out of reach. The column
               is USER-RESIZABLE (320–560px) by a grip on its right edge, and
               the chosen width survives a reload.
     · RIGHT — never scrolls. THREE + ONE, grouped by family:
                 row 1  portrait · story · square, on a COMMON HEIGHT baseline
                 row 2  landscape alone, centred across the full row
               The common baseline is not eyeballed: each cell's flex-grow IS
               its aspect ratio (0.8 / 0.5625 / 1.0), so the three widths land
               in aspect proportion and a `contain` fit therefore resolves to
               the SAME painted height for all three — differing widths, one
               baseline. Landscape gets a whole row, so it renders larger than
               it ever did in a uniform 2×2. Per-format download is a hover
               control on the cell (always visible on touch, and whenever it is
               disabled) instead of four permanent buttons.

   WHAT IS PERMANENTLY ABSENT (§3 non-goals): drag, pan, rotate, any font-size
   control, free colour picking, layout editing, AI photo generation. When a
   need cannot be expressed as a slot value the answer is "the designer will
   make a template" — never "add a control." The first control added here
   outside the template contract is the beginning of a rebuild of the thing
   being escaped.

   THE ONE AMENDMENT (client ruling 2026-08-18): a photo slot, and with it the
   backdrop check. §10 retired runtime contrast guards because colour pairs are
   pre-verified — a photo she picks cannot be. So the render core measures the
   real backdrop and this surface REFUSES: the affected dimensions go on hold
   and export is blocked, in the same idiom §7.2 already uses for over-budget.
   No advisor dot, no "apply fix", no auto-substitution. Prevention, not
   negotiation.
   ───────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DIMENSIONS, slotConstraint } from '@/lib/templates/template-contract.mjs';
import { renderTemplate } from '@/lib/render-core/render-template.mjs';
import { TEMPLATES, TEMPLATE_LABEL_HEADLINE } from '@/lib/templates/index.mjs';
import { resolveLogoAsset, templateLogoVariants } from '@/lib/templates/logo-assets.mjs';
import LibraryPicker from '@/components/LibraryPicker';

const TEMPLATE = TEMPLATE_LABEL_HEADLINE;
const DIM_ORDER = ['portrait', 'story', 'square', 'landscape'];
// The 3 + 1 split: the tall family share a row and a height baseline; the wide
// one gets its own. Authored here, not derived — same discipline as the rest.
const TALL_ROW = ['portrait', 'story', 'square'];
const WIDE_ROW = ['landscape'];

// The resizable panel. A range, not a free-for-all: below 320 the fields stop
// being writable, above 560 the previews start losing the viewport.
const PANEL_MIN = 320;
const PANEL_MAX = 560;
const PANEL_DEFAULT = 420;
const PANEL_KEY = 'wo-post-panel-width';
const clampPanel = (n) => Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(n)));

// Short names for prose. DIMENSIONS[].label carries the ratio ("Story 9:16"),
// which reads badly inside a sentence.
const DIM_SHORT = { portrait: 'Portrait', story: 'Story', square: 'Square', landscape: 'Landscape' };

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

/** "Story", "Story and Square", "Story, Square and Landscape". */
function listNames(ids) {
  const names = ids.map((d) => DIM_SHORT[d] || d);
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function PostComposer() {
  const textSlots = TEMPLATE.paintOrder;
  const logoVariants = useMemo(() => templateLogoVariants(TEMPLATE), []);

  const [values, setValues] = useState(() => {
    const v = {};
    for (const s of textSlots) v[s] = SEED[s] ?? '';
    return v;
  });
  const [colourPairId, setColourPairId] = useState(TEMPLATE.colourPairs[0].id);
  const [logoPosition, setLogoPosition] = useState(TEMPLATE.allowedLogoPositions[0]);
  // null === "whatever the colour class implies" — the default the template has
  // always drawn. An explicit pick is honoured as made, never substituted.
  const [logoVariantId, setLogoVariantId] = useState(null);
  const [truths, setTruths] = useState({});
  const [logoImage, setLogoImage] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  // ── THE RESIZABLE PANEL (client amendment 2026-08-18) ─────────────────────
  // Chrome, not design: this moves the boundary between the two panes and
  // nothing on the canvas. It is the ONE pointer-drag in this app, and the
  // boundary guard names it explicitly rather than loosening (§3 still bans
  // dragging anything that renders).
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const shellRef = useRef(null);
  const resizeFrom = useRef(null);

  // Restore her width AFTER mount — reading localStorage during render would
  // make the server and client markup disagree.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(PANEL_KEY));
      if (Number.isFinite(saved) && saved > 0) setPanelWidth(clampPanel(saved));
    } catch { /* private mode — the default is a fine answer */ }
  }, []);
  const rememberPanel = (px) => { try { localStorage.setItem(PANEL_KEY, String(px)); } catch { /* ignore */ } };

  function startPanelResize(event) {
    const shell = shellRef.current;
    if (!shell) return;
    event.preventDefault();
    resizeFrom.current = { x: event.clientX, width: panelWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function movePanelResize(event) {
    const from = resizeFrom.current;
    if (!from) return;
    setPanelWidth(clampPanel(from.width + (event.clientX - from.x)));
  }
  function endPanelResize(event) {
    if (!resizeFrom.current) return;
    resizeFrom.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    rememberPanel(panelWidth);
  }
  function nudgePanel(event) {
    const step = event.shiftKey ? 48 : 16;
    let next = null;
    if (event.key === 'ArrowLeft') next = panelWidth - step;
    else if (event.key === 'ArrowRight') next = panelWidth + step;
    else if (event.key === 'Home') next = PANEL_MIN;
    else if (event.key === 'End') next = PANEL_MAX;
    if (next == null) return;
    event.preventDefault();
    const w = clampPanel(next);
    setPanelWidth(w);
    rememberPanel(w);
  }

  // ── THE PHOTO (client amendment). Library pick or upload — never generated.
  const [photo, setPhoto] = useState(null);          // { src, filename, origin }
  const [photoImage, setPhotoImage] = useState(null);
  const [photoNote, setPhotoNote] = useState(null);  // honest degradation line
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // §8.1 requirement 2 — VISIBLY REVERTIBLE. Her original is kept alongside the
  // rewrite until she takes or discards it; nothing is overwritten silently.
  const [improve, setImprove] = useState({ slot: null, busy: false, original: null, improved: null, note: null });

  const canvasRefs = useRef({});
  const pair = useMemo(
    () => TEMPLATE.colourPairs.find((p) => p.id === colourPairId) || TEMPLATE.colourPairs[0],
    [colourPairId],
  );

  // The mark to draw: the template's sanctioned set, resolved through the
  // contract layer. Real assets only (law 3) — an id with no file is dropped
  // there rather than drawn as a hole.
  const logoChoice = useMemo(
    () => resolveLogoAsset(TEMPLATE, pair.klass, logoVariantId),
    [pair, logoVariantId],
  );

  useEffect(() => {
    let alive = true;
    setLogoImage(null);
    if (!logoChoice?.src) return undefined;
    const img = new Image();
    img.onload = () => { if (alive) setLogoImage(img); };
    img.onerror = () => { if (alive) setLogoImage(null); };
    img.src = logoChoice.src;
    return () => { alive = false; };
  }, [logoChoice?.src]);

  // The photo. crossOrigin is REQUIRED, not cosmetic: the backdrop check reads
  // pixels back, and a tainted canvas cannot be read (nor exported). A photo
  // that will not load cross-origin is reported, never silently dropped.
  useEffect(() => {
    let alive = true;
    setPhotoImage(null);
    if (!photo?.src) return undefined;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (alive) setPhotoImage(img); };
    img.onerror = () => {
      if (!alive) return;
      setPhotoImage(null);
      setPhotoNote('That photo could not be loaded here. Try another one.');
    };
    img.src = photo.src;
    return () => { alive = false; };
  }, [photo?.src]);

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
    for (const dimId of DIM_ORDER) {
      const canvas = canvasRefs.current[dimId];
      if (!canvas) continue;
      const dim = DIMENSIONS[dimId];
      if (canvas.width !== dim.w || canvas.height !== dim.h) { canvas.width = dim.w; canvas.height = dim.h; }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      next[dimId] = renderTemplate(ctx, TEMPLATE, dimId, {
        ...values,
        colourPairId,
        logoPosition,
        logoImage,
        logoInk: logoChoice?.ink || null,
        photoImage,
      });
    }
    setTruths(next);
  }, [values, colourPairId, logoPosition, logoImage, logoChoice, photoImage]);

  useEffect(() => { paint(); }, [paint, fontsReady]);

  // ── WHAT IS ON HOLD ───────────────────────────────────────────────────────
  // Two refusals share one idiom (§7.2): a hard break that busts the fixed box,
  // and a backdrop the ink cannot be read against. Both are MEASURED off the
  // render truth, never counted or guessed, and both block export for exactly
  // the dimensions that failed — the others still download.
  const blocked = useMemo(() => {
    const perDim = {};
    const perSlot = {};
    const contrastDims = [];
    const contrastTextDims = [];
    const contrastLogoDims = [];
    let unreadable = false;
    for (const dimId of DIM_ORDER) {
      const truth = truths[dimId];
      if (!truth) continue;
      const over = truth.overBudgetSlots || [];
      const failed = truth.contrastFailures || [];
      if (over.length) for (const s of over) (perSlot[s] ||= []).push(dimId);
      if (failed.length) {
        contrastDims.push(dimId);
        if (failed.some((s) => s !== 'logo')) contrastTextDims.push(dimId);
        if (failed.includes('logo')) contrastLogoDims.push(dimId);
        const rows = [...Object.values(truth.backdrop?.slots || {}), truth.backdrop?.logo].filter(Boolean);
        if (rows.some((r) => r.unreadable)) unreadable = true;
      }
      if (over.length || failed.length) perDim[dimId] = { breaks: over, contrast: failed };
    }
    return {
      perDim, perSlot,
      any: Object.keys(perDim).length > 0,
      breakDims: DIM_ORDER.filter((d) => perDim[d]?.breaks.length),
      contrastDims, contrastTextDims, contrastLogoDims, unreadable,
    };
  }, [truths]);

  // The honest remedy, and it is honest in both directions: with a LIGHT field
  // the ink is dark, so a darker colour pair rescues it; with a DARK field the
  // ink is ivory and a lighter pair does. Naming the wrong one would be M4.
  const colourAdvice = pair.klass === 'dark' ? 'a lighter colour' : 'a darker colour';

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

  // ── PHOTO: pick from the library, or bring one in ─────────────────────────
  // NO generation here (money law, and §3: staff PICK photos, they do not
  // prompt for them). Both paths end in the same place: a real image.
  function chooseFromLibrary(img) {
    setLibraryOpen(false);
    if (!img?.url) { setPhotoNote('That library image has no file behind it.'); return; }
    setPhotoNote(null);
    setPhoto({ src: img.url, filename: img.filename || 'library photo', origin: 'library' });
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = '';
    if (!file) return;
    // Show it immediately from the device — a same-origin blob URL, which also
    // keeps the canvas readable for the backdrop check.
    const localSrc = URL.createObjectURL(file);
    setPhotoNote(null);
    setPhoto({ src: localSrc, filename: file.name, origin: 'upload' });

    // Then persist it to the library, fire-and-forget, in the 'uploaded'
    // vocabulary with session lineage when this device has a session
    // (localStorage 'wo-current-session' — the key lib/sessions.js owns).
    // Graceful-degradation contract: an unconfigured cloud is SAID, not hidden,
    // and never blocks the photo she can already see.
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source_type', 'uploaded');
      let sid = null;
      try { sid = localStorage.getItem('wo-current-session'); } catch { sid = null; }
      if (sid) fd.append('session_id', sid);
      const res = await fetch('/api/images', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (data?.configured === false) setPhotoNote('Saved on this device only — the photo library is not connected.');
      else if (!res.ok) setPhotoNote('Your photo is in the design, but it could not be added to the library.');
    } catch {
      setPhotoNote('Your photo is in the design, but it could not be added to the library.');
    } finally {
      setUploading(false);
    }
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoNote(null);
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

  const allBlocked = Object.keys(blocked.perDim).length === DIM_ORDER.length;

  return (
    <main style={S.page}>
      {/* (M9 — the desktop regression and its mirror) Inline styles cannot carry
          a media query or :hover, so the layout's structural rules live here
          rather than leaking user-app styling into the shared globals.css the
          admin app also reads. Two panes at desktop; below 900px it stacks and
          the page is allowed to scroll, because a phone has no second pane. */}
      <style>{`
        .wo-post-shell { display: grid; grid-template-columns: var(--wo-panel-w, 420px) minmax(0, 1fr); height: 100dvh; overflow: hidden; }
        .wo-panel { position: relative; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line, rgba(37,78,72,0.18)); background: var(--bg, #F5F6E7); }

        /* The resize grip. touch-action:none is what makes a touch drag a drag
           instead of a page scroll; it is focusable so the width is reachable
           without a pointer at all. */
        .wo-grip { position: absolute; top: 0; right: -5px; width: 11px; height: 100%; z-index: 5;
                   padding: 0; border: none; background: transparent; cursor: col-resize; touch-action: none; }
        /* The visible bar is a real child element rather than a ::after with a
           generated content string. A quote character inside a style element is
           serialised as an entity by the server and NOT decoded by the parser,
           so React sees the two texts disagree and throws the whole page away on
           hydration. Nothing in this block may contain a quote. */
        .wo-grip-bar { position: absolute; top: 50%; left: 4px; width: 3px; height: 46px;
                       margin-top: -23px; border-radius: 2px; background: var(--line, rgba(37,78,72,0.18)); transition: background 120ms ease; }
        .wo-grip:hover .wo-grip-bar, .wo-grip:focus-visible .wo-grip-bar { background: var(--fg-strong, #254E48); }
        .wo-grip:focus-visible { outline: 2px solid var(--fg-strong, #254E48); outline-offset: -2px; }
        .wo-panel-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 20px 20px 12px; display: flex; flex-direction: column; gap: 20px; }
        .wo-panel-foot { flex: 0 0 auto; padding: 14px 20px 18px; border-top: 1px solid var(--line, rgba(37,78,72,0.18)); background: var(--bg, #F5F6E7); display: flex; flex-direction: column; gap: 8px; }

        /* THREE + ONE. Two equal rows; the tall family shares the first. */
        .wo-stage { min-width: 0; min-height: 0; overflow: hidden;
                    display: flex; flex-direction: column; gap: 18px; padding: 22px; }
        .wo-row { display: flex; min-width: 0; min-height: 0; gap: 18px; justify-content: center; align-items: stretch; }
        .wo-row-tall { flex: 1 1 0; }
        .wo-row-wide { flex: 1 1 0; }
        /* flex-grow IS the aspect ratio, so the three widths land in aspect
           proportion — which is exactly the condition under which a contain
           fit resolves to the SAME height for all three. The common baseline is
           a consequence of the numbers, not a hand-tuned height. */
        .wo-cell-portrait { flex: 0.8 1 0; }
        .wo-cell-story { flex: 0.5625 1 0; }
        .wo-cell-square { flex: 1 1 0; }
        .wo-cell-landscape { flex: 1 1 0; }
        .wo-cell { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column;
                   align-items: center; justify-content: flex-end; margin: 0; padding-bottom: 32px; }
        /* The caption is taken OUT OF FLOW deliberately. In flow, its
           min-content width becomes the floor for the whole cell, the three
           cells stop being distributed in aspect proportion, and the common
           baseline quietly drifts by a pixel or two. Absolutely positioned, it
           cannot influence the width the baseline depends on.
           (No quote characters anywhere in this block — see the grip note.) */
        .wo-cell figcaption { position: absolute; left: 0; right: 0; bottom: 0; height: 30px;
                              display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
                              gap: 2px; overflow: hidden; }
        .wo-cap-line { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wo-cell-frame { position: relative; flex: 1 1 0; min-height: 0; width: 100%;
                         display: flex; align-items: center; justify-content: center; }
        /* CONTAIN-fitted: proportional CELLS, true aspect ratios inside them.
           The ratio is DECLARED rather than left to the intrinsic size of the
           canvas element, because sizing a replaced element from its intrinsic
           dimensions rounds — and that rounding is exactly what knocks the
           three tall previews a pixel or two off their shared baseline. */
        .wo-cell-frame canvas { max-width: 100%; max-height: 100%; width: auto; height: auto; display: block;
                                border-radius: 6px; border: 1px solid var(--line, rgba(37,78,72,0.14)); }
        /* An empty box that lands on EXACTLY the same rect as the canvas: the
           same contain maths (inset 0, auto margins, the same declared ratio,
           both max constraints). The hover control hangs off this, so it sits
           on the picture — on landscape the cell is far wider than the render,
           and a button pinned to the cell would float in space beside it. */
        .wo-shot-anchor { position: absolute; inset: 0; margin: auto; width: auto; height: auto;
                          max-width: 100%; max-height: 100%; pointer-events: none; }
        /* Per-format download: a hover control on the cell. Always visible on
           touch (no hover to reveal it) and always visible when DISABLED — a
           control that is refusing must be readable, per the ratified
           disabled/hover affordance precedent. */
        .wo-cell-dl { position: absolute; right: 8px; bottom: 8px; opacity: 0; pointer-events: auto; transition: opacity 120ms ease; }
        .wo-cell:hover .wo-cell-dl, .wo-cell-dl:focus-visible { opacity: 1; }
        .wo-cell-dl:disabled { opacity: 1; }
        @media (hover: none) { .wo-cell-dl { opacity: 1; } }

        @media (max-width: 900px) {
          .wo-post-shell { grid-template-columns: 1fr; height: auto; min-height: 100dvh; overflow: visible; }
          .wo-panel { border-right: none; border-bottom: 1px solid var(--line, rgba(37,78,72,0.18)); }
          .wo-panel-scroll { overflow: visible; }
          .wo-grip { display: none; }
          .wo-stage { overflow: visible; padding: 18px; gap: 14px; }
          .wo-row { flex-wrap: wrap; }
          .wo-row-tall, .wo-row-wide { flex: 0 0 auto; }
          .wo-cell { min-height: 220px; }
          .wo-cell-portrait, .wo-cell-story, .wo-cell-square { flex: 1 1 30%; }
          .wo-cell-landscape { flex: 1 1 100%; }
        }
      `}</style>

      <div className="wo-post-shell" ref={shellRef} style={{ '--wo-panel-w': `${panelWidth}px` }}>
        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        <aside className="wo-panel" aria-label="Your words and choices">
          <div className="wo-panel-scroll">
            {/* TEMPLATE SELECTOR. One template exists, so the menu lists one —
                but the control is REAL: it opens, shows the current template as
                selected, and closes. A chevron that does nothing would be a dead
                control (M4); this is the affordance template two arrives into. */}
            <div style={S.field}>
              <span style={S.label}>Template</span>
              <div style={S.menuWrap}>
                <button
                  type="button"
                  onClick={() => setTemplateMenuOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={templateMenuOpen}
                  style={S.selector}
                >
                  <span style={S.selectorName}>{TEMPLATE.name}</span>
                  <span aria-hidden="true" style={{ ...S.chevron, transform: templateMenuOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
                </button>
                {templateMenuOpen && (
                  <>
                    <div onClick={() => setTemplateMenuOpen(false)} style={S.menuScreen} />
                    <ul role="listbox" aria-label="Templates" style={S.menu}>
                      {TEMPLATES.map((t) => (
                        <li key={t.id} role="option" aria-selected={t.id === TEMPLATE.id}>
                          <button
                            type="button"
                            onClick={() => setTemplateMenuOpen(false)}
                            style={{ ...S.menuItem, ...(t.id === TEMPLATE.id ? S.menuItemOn : null) }}
                          >
                            <span style={S.menuItemName}>{t.name}{t.id === TEMPLATE.id ? ' ✓' : ''}</span>
                            <span style={S.menuItemPurpose}>{t.purpose}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <p style={S.hint}>{TEMPLATE.purpose}</p>
            </div>

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

            {/* ── THE MARK: which one, and where. Both are slot values from the
                template's own allowlists — never a drag, never an upload. */}
            <div style={S.field}>
              <span style={S.label}>The mark</span>
              <div style={S.marks}>
                <button
                  type="button" onClick={() => setLogoVariantId(null)} aria-pressed={logoVariantId === null}
                  title="Whichever mark suits the colour you picked"
                  style={{ ...S.markTile, ...(logoVariantId === null ? S.markTileOn : null) }}
                >
                  <span style={S.markAuto}>Auto</span>
                </button>
                {logoVariants.map((v) => (
                  <button
                    key={v.id} type="button" onClick={() => setLogoVariantId(v.id)} aria-pressed={logoVariantId === v.id}
                    title={`${v.label} · ${v.colour}`}
                    style={{
                      ...S.markTile,
                      ...(logoVariantId === v.id ? S.markTileOn : null),
                      background: v.colour === 'ivory' ? 'var(--fg-strong, #254E48)' : 'rgba(255,255,255,0.7)',
                    }}
                  >
                    <img src={v.src} alt={`${v.label}, ${v.colour}`} style={S.markImg} />
                  </button>
                ))}
              </div>
              <p style={S.hint}>
                {logoVariantId === null
                  ? `Auto uses the ${logoChoice?.label || 'brand'} mark that suits ${pair.label}.`
                  : 'Your pick is used as-is. If it disappears on this design, you will be told.'}
              </p>
            </div>

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

            {/* ── PHOTO (optional). Pick one, or bring one in. Never generated. */}
            {TEMPLATE.slots.photo?.present && (
              <div style={S.field}>
                <span style={S.label}>Photo (optional)</span>
                {photo ? (
                  <div style={S.photoRow}>
                    <img src={photo.src} alt="" style={S.photoThumb} />
                    <div style={S.photoMeta}>
                      <span style={S.photoName}>{photo.filename}</span>
                      <button type="button" onClick={removePhoto} style={S.linkBtn}>Remove photo</button>
                    </div>
                  </div>
                ) : (
                  <p style={S.hint}>No photo — the tile stays a plain colour field.</p>
                )}
                <div style={S.row}>
                  <button type="button" onClick={() => setLibraryOpen(true)} style={S.ghostBtn}>Choose from library</button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={S.ghostBtn}>
                    {uploading ? 'Adding…' : 'Upload a photo'}
                  </button>
                  <input
                    ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload}
                    style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}
                  />
                </div>
                {photoNote && <p role="status" style={S.note}>{photoNote}</p>}
              </div>
            )}
          </div>

          {/* Anchored at the BOTTOM of the panel — never scrolls out of reach. */}
          <div className="wo-panel-foot">
            <button type="button" onClick={downloadAll} disabled={allBlocked} style={{ ...S.primaryBtn, opacity: allBlocked ? 0.5 : 1 }}>
              Download all sizes
            </button>
            {blocked.breakDims.length > 0 && (
              <p role="status" style={S.warn}>
                {blocked.breakDims.map((d) => DIMENSIONS[d].label).join(', ')} {blocked.breakDims.length > 1 ? 'are' : 'is'} on hold until the line breaks fit.
              </p>
            )}
            {blocked.contrastTextDims.length > 0 && (
              <p role="status" style={S.warn}>
                This photo makes the words hard to read in {listNames(blocked.contrastTextDims)} — try a different photo, or {colourAdvice}.
              </p>
            )}
            {blocked.contrastLogoDims.length > 0 && (
              <p role="status" style={S.warn}>
                {photo
                  ? `This photo makes the mark hard to see in ${listNames(blocked.contrastLogoDims)} — try a different photo, or ${colourAdvice}.`
                  : `This mark disappears on the ${pair.label} field in ${listNames(blocked.contrastLogoDims)} — pick a different mark, or ${colourAdvice}.`}
              </p>
            )}
            {blocked.unreadable && (
              <p role="status" style={S.warn}>
                This photo could not be checked for readability, so it cannot be downloaded. Try another photo.
              </p>
            )}
          </div>

          {/* The grip. role=separator with a live value is what makes the width
              announceable and keyboard-reachable; ArrowLeft/Right (and
              Home/End) move it without a pointer at all. */}
          <button
            type="button"
            className="wo-grip"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the panel"
            aria-valuenow={panelWidth}
            aria-valuemin={PANEL_MIN}
            aria-valuemax={PANEL_MAX}
            onPointerDown={startPanelResize}
            onPointerMove={movePanelResize}
            onPointerUp={endPanelResize}
            onPointerCancel={endPanelResize}
            onKeyDown={nudgePanel}
          >
            <span className="wo-grip-bar" aria-hidden="true" />
          </button>
        </aside>

        {/* ── RIGHT: ALL FOUR DIMENSIONS, TOGETHER (§5). NEVER SCROLLS. ────── */}
        <section className="wo-stage" aria-label="Your post in all four sizes">
          {[TALL_ROW, WIDE_ROW].map((row, i) => (
            <div key={i === 0 ? 'tall' : 'wide'} className={`wo-row ${i === 0 ? 'wo-row-tall' : 'wo-row-wide'}`}>
              {row.map((dimId) => {
                const dim = DIMENSIONS[dimId];
                const isBlocked = !!blocked.perDim[dimId];
                const truth = truths[dimId];
                return (
                  <figure key={dimId} className={`wo-cell wo-cell-${dimId}`}>
                    <div className="wo-cell-frame">
                      <canvas
                        ref={(el) => { canvasRefs.current[dimId] = el; }}
                        style={{ aspectRatio: `${dim.w} / ${dim.h}`, opacity: isBlocked ? 0.45 : 1 }}
                      />
                      <div className="wo-shot-anchor" style={{ aspectRatio: `${dim.w} / ${dim.h}` }}>
                        <button
                          type="button" className="wo-cell-dl" onClick={() => download(dimId)} disabled={isBlocked}
                          style={{ ...S.smallBtn, ...(isBlocked ? S.smallBtnOff : S.smallBtnOn) }}
                        >
                          {isBlocked ? 'On hold' : 'Download'}
                        </button>
                      </div>
                    </div>
                    <figcaption style={S.caption}>
                      <span className="wo-cap-line" style={S.captionLabel}>{dim.label}</span>
                      {truth && (
                        <span className="wo-cap-line" style={S.truth}>
                          {truth.width}×{truth.height}
                          {slotConstraint(TEMPLATE, 'heading', dimId) ? ` · heading ${truth.slots.heading?.paintedPx}px` : ''}
                        </span>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ))}
        </section>
      </div>

      {libraryOpen && (
        <LibraryPicker onSelect={chooseFromLibrary} onClose={() => setLibraryOpen(false)} />
      )}
    </main>
  );
}

/* ── Styles. Brand tokens from app/globals.css; nothing invented here. ────── */
const S = {
  page: { background: 'var(--bg, #F5F6E7)' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { fontFamily: 'var(--font-syne)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-strong, #254E48)' },
  counter: { fontFamily: 'var(--font-body)', fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  input: { fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.5, color: 'var(--fg-strong, #254E48)', background: '#fff', border: '1.5px solid', borderRadius: 12, padding: '9px 11px', resize: 'vertical', outline: 'none' },
  hint: { fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-muted, #6b6f6b)', margin: 0 },
  warn: { fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--tw-tangerine, #F6644E)', margin: 0 },
  note: { fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-muted, #6b6f6b)', margin: '2px 0 0' },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  improve: { border: '1px solid var(--line, rgba(37,78,72,0.18))', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.6)' },
  compare: { display: 'grid', gridTemplateColumns: '1fr', gap: 10 },
  compareCol: { display: 'flex', flexDirection: 'column', gap: 2 },
  compareLabel: { fontFamily: 'var(--font-syne)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-muted, #6b6f6b)' },
  compareText: { fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-strong, #254E48)', margin: 0, whiteSpace: 'pre-wrap' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, padding: '0 14px', borderRadius: 22, border: '1px solid var(--line, rgba(37,78,72,0.18))', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg-strong, #254E48)', cursor: 'pointer' },
  chipOn: { background: 'var(--fg-strong, #254E48)', color: '#F5F6E7', border: '1px solid var(--fg-strong, #254E48)' },
  swatch: { minHeight: 44, minWidth: 80, padding: '0 14px', borderRadius: 22, border: 'none', fontFamily: 'var(--font-body)', fontSize: 13.5, cursor: 'pointer' },
  primaryBtn: { minHeight: 44, padding: '0 20px', borderRadius: 22, border: 'none', background: 'var(--fg-strong, #254E48)', color: '#F5F6E7', fontFamily: 'var(--font-body)', fontSize: 15, cursor: 'pointer' },
  ghostBtn: { minHeight: 44, padding: '0 14px', borderRadius: 22, border: '1px solid var(--line, rgba(37,78,72,0.18))', background: 'transparent', color: 'var(--fg-strong, #254E48)', fontFamily: 'var(--font-body)', fontSize: 13.5, cursor: 'pointer' },
  linkBtn: { alignSelf: 'flex-start', padding: 0, border: 'none', background: 'none', color: 'var(--tw-tangerine, #F6644E)', fontFamily: 'var(--font-body)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' },
  smallBtn: { minHeight: 30, padding: '0 12px', borderRadius: 15, fontFamily: 'var(--font-body)', fontSize: 12.5, cursor: 'pointer', border: '1px solid var(--line, rgba(37,78,72,0.18))' },
  smallBtnOn: { background: 'var(--fg-strong, #254E48)', color: '#F5F6E7', border: '1px solid var(--fg-strong, #254E48)' },
  smallBtnOff: { background: 'var(--tw-tangerine, #F6644E)', color: '#fff', border: '1px solid var(--tw-tangerine, #F6644E)', cursor: 'not-allowed' },
  caption: { fontFamily: 'var(--font-syne)', fontSize: 11.5, fontWeight: 500, letterSpacing: '0.04em', color: 'var(--fg-strong, #254E48)' },
  captionLabel: { lineHeight: 1.2 },
  truth: { fontFamily: 'var(--font-body)', fontSize: 10.5, lineHeight: 1.2, letterSpacing: 0, color: 'var(--fg-muted, #6b6f6b)' },

  // Template selector
  menuWrap: { position: 'relative' },
  selector: { width: '100%', minHeight: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--line, rgba(37,78,72,0.18))', background: '#fff', cursor: 'pointer' },
  selectorName: { fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--fg-strong, #254E48)' },
  chevron: { fontSize: 13, color: 'var(--fg-muted, #6b6f6b)', transition: 'transform 140ms ease' },
  menuScreen: { position: 'fixed', inset: 0, zIndex: 40 },
  menu: { position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 41, margin: 0, padding: 6, listStyle: 'none', background: '#fff', border: '1px solid var(--line, rgba(37,78,72,0.18))', borderRadius: 12, boxShadow: '0 10px 30px rgba(37,78,72,0.16)' },
  menuItem: { width: '100%', display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left', padding: '10px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer' },
  menuItemOn: { background: 'rgba(37,78,72,0.07)' },
  menuItemName: { fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--fg-strong, #254E48)' },
  menuItemPurpose: { fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.45, color: 'var(--fg-muted, #6b6f6b)' },

  // Mark picker
  marks: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  markTile: { width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, borderRadius: 12, border: '1.5px solid var(--line, rgba(37,78,72,0.18))', background: 'rgba(255,255,255,0.7)', cursor: 'pointer' },
  markTileOn: { border: '2px solid var(--fg-strong, #254E48)', boxShadow: '0 0 0 2px rgba(37,78,72,0.12)' },
  markImg: { maxWidth: '100%', maxHeight: '100%', display: 'block' },
  markAuto: { fontFamily: 'var(--font-syne)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-strong, #254E48)' },

  // Photo
  photoRow: { display: 'flex', gap: 10, alignItems: 'center' },
  photoThumb: { width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line, rgba(37,78,72,0.18))' },
  photoMeta: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  photoName: { fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg-strong, #254E48)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
