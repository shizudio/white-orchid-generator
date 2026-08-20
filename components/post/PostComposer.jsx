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
import {
  DIMENSIONS, TEXT_SLOTS, slotConstraint, PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX,
} from '@/lib/templates/template-contract.mjs';
import { renderTemplate, templateOffersTextToggle } from '@/lib/render-core/render-template.mjs';
import { TEMPLATES, DEFAULT_TEMPLATE_ID, templateById } from '@/lib/templates/index.mjs';
import { resolveLogoAsset, templateLogoVariants } from '@/lib/templates/logo-assets.mjs';
import { resolveMaskAsset, templateMaskShapes } from '@/lib/templates/mask-assets.mjs';
import { templateMotifAsset } from '@/lib/templates/motif-assets.mjs';
import LibraryPicker from '@/components/LibraryPicker';

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
  pill: { label: 'A short label', hint: 'A few words, like NOW ENROLLING.' },
  attribution: { label: 'Who said it', hint: 'A name, or a name and a role.' },
};

// The plain-English name of a slot, for the swap line (§6.3 rule 2).
const SLOT_NOUN = {
  eyebrow: 'small label', heading: 'headline', body: 'line underneath',
  pill: 'label', attribution: 'attribution',
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

/* ── THE WINDOW-SHAPE THUMBNAIL ───────────────────────────────────────────────
   A plain <img> is the WRONG preview here. Several shape assets ship at
   `fill-opacity="0.4"`, so they render as pale grey chips beside the opaque
   ones, and the picker would show four shapes at four different weights when
   the canvas draws all four identically — the render core saturates a mask's
   alpha before cutting with it.

   So the thumbnail does the SAME thing the core does: draw the silhouette over
   itself until its alpha is solid, then key it to the ink colour. What she sees
   in the picker is what the window will actually be (renderTruth in miniature).
   A shape that fails to load paints nothing and is reported by `onError`. */
function ShapeThumb({ src, ink, size = 34 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const iw = img.naturalWidth || 1;
      const ih = img.naturalHeight || 1;
      const s = Math.min(canvas.width / iw, canvas.height / ih);
      const dw = iw * s;
      const dh = ih * s;
      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;
      for (let i = 0; i < 16; i += 1) ctx.drawImage(img, dx, dy, dw, dh);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = ink;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    };
    img.src = src;
    return () => { alive = false; };
  }, [src, ink, size]);
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, display: 'block' }} />;
}

/** "the body", "the body and the label" — the same joiner, for slot nouns. */
function listWords(words) {
  if (words.length <= 1) return words[0] || '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** "Story", "Story and Square", "Story, Square and Landscape". */
function listNames(ids) {
  const names = ids.map((d) => DIM_SHORT[d] || d);
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function PostComposer() {
  /* ── WHICH TEMPLATE (client ruling 2026-08-18 — template two) ──────────────
     The selector is a REAL switch now. Everything below reads the ACTIVE
     template; nothing is hardcoded to template one any more. */
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const TEMPLATE = useMemo(() => templateById(templateId) || TEMPLATES[0], [templateId]);
  const textSlots = TEMPLATE.paintOrder;
  const logoVariants = useMemo(() => templateLogoVariants(TEMPLATE), [TEMPLATE]);
  const dimOrder = useMemo(() => DIM_ORDER.filter((d) => TEMPLATE.dimensions[d]), [TEMPLATE]);

  /* §6.3 RULE 1 — DEACTIVATING NEVER DELETES. `values` holds the WHOLE closed
     text vocabulary, not just the slots the active template paints. A template
     that does not show her body copy simply does not read that key; swapping
     back finds it exactly where she left it. Silent content loss is precisely
     the surprise class that made her give up (§1). */
  const [values, setValues] = useState(() => {
    const v = {};
    for (const s of TEXT_SLOTS) v[s] = SEED[s] ?? '';
    return v;
  });
  const [colourPairId, setColourPairId] = useState(TEMPLATE.colourPairs[0].id);
  const [logoPosition, setLogoPosition] = useState(TEMPLATE.allowedLogoPositions[0]);
  // null === "whatever the colour class implies" — the default the template has
  // always drawn. An explicit pick is honoured as made, never substituted.
  const [logoVariantId, setLogoVariantId] = useState(null);
  // (client ruling 2026-08-18) WHICH window silhouette. null === the template's
  // own default; an explicit pick out of `allowedMaskShapes` is honoured as made.
  const [maskShapeId, setMaskShapeId] = useState(null);
  /* ── TEXT ON / OFF (client ruling 2026-08-18) ────────────────────────────
     "ideally i should have a deactive text toggle next to the line that
      carries the post."
     A SLOT VALUE, not a rule: which of the template's two authored layouts she
     wants. It is never inferred from whether she has typed anything — a layout
     that flips while she is clearing a line to retype it is exactly the kind of
     surprise this app exists to remove. §6.3 rule 1 holds: turning text OFF
     keeps every word, hidden, and turning it back on returns them untouched. */
  const [showText, setShowText] = useState(true);
  /* ── HER CROP INSIDE THE FIXED WINDOW (client ruling 2026-08-18) ─────────
     "i want to still shift around the image and resize the image. this only
      applies to petal window template."
     The ONE narrow exception to §3's no-pan/zoom, and the line is that this
     moves the PICTURE INSIDE the window, never the window: no template
     geometry changes, so nothing about the layout becomes negotiable. The
     units are the slack the zoom creates (pan ±1, zoom 1–3), so the window can
     never show empty field — see lib/render-core/render-template.mjs.
     ONE transform for all four dimensions: staff crop once, not four times. */
  const [photoTransform, setPhotoTransform] = useState({ x: 0, y: 0, zoom: 1 });
  const panFrom = useRef(null);
  const photoAdjustable = TEMPLATE.slots.photo?.adjustable === true;
  // WHICH templates offer the choice is DATA — a template that declares the
  // second layout gets the toggle, one that does not never shows it.
  const textToggle = templateOffersTextToggle(TEMPLATE);
  const [truths, setTruths] = useState({});
  const [logoImage, setLogoImage] = useState(null);
  const [maskImage, setMaskImage] = useState(null);
  /* ── THE MOTIF (client ruling 2026-08-20 — template three) ────────────────
     A brand shape the TEMPLATE declares and paints into its own field. There
     is deliberately NO state for WHICH one and no picker: the client ruled the
     motif "fixed for now", so this is an asset the surface loads on the
     template's behalf, exactly like the mask — not a choice she makes. When a
     picker is ruled in it arrives as a `motifId` beside `maskShapeId`, and
     nothing else here has to move. */
  const [motifImage, setMotifImage] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  // What each template was last set to, so a swap BACK restores her choices
  // rather than resetting them to the template's defaults.
  const [choiceMemory, setChoiceMemory] = useState({});
  // §6.3 RULE 2 — the swap SAYS what it is doing, in one honest line. No dialog.
  const [swapNote, setSwapNote] = useState(null);

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

  /* THE PAN. A pointer drag ON A PREVIEW, and the only one in this app: it
     writes `photoTransform` and nothing else — no slot value, no template
     geometry, no canvas element. A full-width drag sweeps the whole available
     range, so it feels the same on every preview whatever size it is drawn at.
     Clamping is not done here: the render core expresses the transform in units
     of the slack, so ±1 IS the edge. */
  function startPhotoPan(event) {
    if (!photoAdjustable || !photoImage) return;
    const rect = event.currentTarget.getBoundingClientRect();
    panFrom.current = { px: event.clientX, py: event.clientY, rect, x: photoTransform.x, y: photoTransform.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function movePhotoPan(event) {
    const from = panFrom.current;
    if (!from) return;
    event.preventDefault();
    const nx = from.x - ((event.clientX - from.px) / from.rect.width) * 2;
    const ny = from.y - ((event.clientY - from.py) / from.rect.height) * 2;
    setPhotoTransform((t) => ({ ...t, x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) }));
  }
  function endPhotoPan(event) {
    if (!panFrom.current) return;
    panFrom.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }
  function resetPhotoTransform() { setPhotoTransform({ x: 0, y: 0, zoom: 1 }); }

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
    [TEMPLATE, colourPairId],
  );

  // The mark to draw: the template's sanctioned set, resolved through the
  // contract layer. Real assets only (law 3) — an id with no file is dropped
  // there rather than drawn as a hole.
  const logoChoice = useMemo(
    () => resolveLogoAsset(TEMPLATE, pair.klass, logoVariantId),
    [TEMPLATE, pair, logoVariantId],
  );

  /* ── THE MASK (template two). The silhouette the photo is revealed through.
     WHICH one is hers, out of the template's `allowedMaskShapes` — resolved
     through the contract layer, never by reaching for a file. Law 3: an asset
     that will not load comes back as no image and the render core REFUSES to
     paint rather than showing an unmasked rectangle. */
  const maskShapes = useMemo(() => templateMaskShapes(TEMPLATE), [TEMPLATE]);
  const maskAsset = useMemo(() => resolveMaskAsset(TEMPLATE, maskShapeId), [TEMPLATE, maskShapeId]);
  useEffect(() => {
    let alive = true;
    setMaskImage(null);
    if (!maskAsset?.src) return undefined;
    const img = new Image();
    img.onload = () => { if (alive) setMaskImage(img); };
    img.onerror = () => { if (alive) setMaskImage(null); };
    img.src = maskAsset.src;
    return () => { alive = false; };
  }, [maskAsset?.src]);

  // A shape she picked on one template is meaningless on another, so the pick
  // resets to the new template's own default rather than being carried across.
  useEffect(() => { setMaskShapeId(null); }, [TEMPLATE.id]);

  /* The motif asset, resolved through the contract layer (law 3: an id with no
     usable shape comes back as null and the render core REFUSES to paint
     rather than dropping the watermark silently). A template that declares no
     motif resolves to null and nothing is ever fetched. */
  const motifAsset = useMemo(() => templateMotifAsset(TEMPLATE), [TEMPLATE]);
  useEffect(() => {
    let alive = true;
    setMotifImage(null);
    if (!motifAsset?.src) return undefined;
    const img = new Image();
    img.onload = () => { if (alive) setMotifImage(img); };
    img.onerror = () => { if (alive) setMotifImage(null); };
    img.src = motifAsset.src;
    return () => { alive = false; };
  }, [motifAsset?.src]);

  /* ── THE SWAP (§6.3). Three rules, all here:
       1. deactivating never DELETES — `values` already holds every text slot,
          so nothing is dropped; the new template simply reads fewer keys
       2. the swap SAYS what it is doing, in one line, no dialog
       3. her colour / mark / position choices are REMEMBERED per template, so
          swapping back restores what she had rather than a fresh default   */
  function chooseTemplate(next) {
    setTemplateMenuOpen(false);
    if (!next || next.id === TEMPLATE.id) return;

    setChoiceMemory((m) => ({
      ...m,
      [TEMPLATE.id]: { colourPairId, logoPosition, logoVariantId, showText },
    }));
    const remembered = choiceMemory[next.id];
    const carriedPair = next.colourPairs.some((p) => p.id === colourPairId) ? colourPairId : null;
    const carriedPos = next.allowedLogoPositions.includes(logoPosition) ? logoPosition : null;
    const carriedVariant = (next.allowedLogoAssets || []).includes(logoVariantId) ? logoVariantId : null;

    setColourPairId(remembered?.colourPairId || carriedPair || next.colourPairs[0].id);
    setLogoPosition(remembered?.logoPosition || carriedPos || next.allowedLogoPositions[0]);
    setLogoVariantId(remembered ? remembered.logoVariantId : carriedVariant);
    // Her text on/off choice is remembered per template too — it means nothing
    // on a template with one layout, and everything on one with two.
    setShowText(remembered && typeof remembered.showText === 'boolean' ? remembered.showText : true);

    // The honest line: which of her words this template does not show (kept),
    // and what it needs that she has not given it yet.
    const hidden = TEXT_SLOTS
      .filter((slot) => TEMPLATE.slots[slot]?.present && !next.slots[slot]?.present && String(values[slot] || '').trim())
      .map((slot) => SLOT_NOUN[slot] || slot);
    const parts = [];
    if (hidden.length) parts.push(`This template doesn't show your ${listWords(hidden)} — it'll be kept for later.`);
    if (next.slots.photo?.present && Object.keys(next.dimensions).some((d) => slotConstraint(next, 'photo', d)?.required) && !photo) {
      parts.push('It needs a photo before you can download it.');
    }
    setSwapNote(parts.length ? parts.join(' ') : null);
    setTemplateId(next.id);
  }

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

  // An open listbox must close on Escape. Without it the menu can only be
  // dismissed by the chevron or the invisible backdrop, which is a trap for
  // anyone driving this from the keyboard.
  useEffect(() => {
    if (!templateMenuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setTemplateMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [templateMenuOpen]);

  // ── THE FOUR RENDERS. All four are shown together (§5). ───────────────────
  const paint = useCallback(() => {
    const next = {};
    for (const dimId of dimOrder) {
      const canvas = canvasRefs.current[dimId];
      if (!canvas) continue;
      const dim = DIMENSIONS[dimId];
      if (canvas.width !== dim.w || canvas.height !== dim.h) { canvas.width = dim.w; canvas.height = dim.h; }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      next[dimId] = renderTemplate(ctx, TEMPLATE, dimId, {
        ...values,
        showText,
        photoTransform,
        colourPairId,
        logoPosition,
        logoImage,
        logoInk: logoChoice?.ink || null,
        photoImage,
        maskImage,
        maskShapeId: maskAsset?.id || null,
        motifImage,
      });
    }
    setTruths(next);
  }, [TEMPLATE, dimOrder, values, showText, photoTransform, colourPairId, logoPosition, logoImage, logoChoice, photoImage, maskImage, maskAsset, motifImage]);

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
    const needPhotoDims = [];
    const missingAssetDims = [];
    let unreadable = false;
    for (const dimId of dimOrder) {
      const truth = truths[dimId];
      if (!truth) continue;
      const over = truth.overBudgetSlots || [];
      const failed = truth.contrastFailures || [];
      const missing = truth.missingRequired || [];
      const noAssets = truth.missingAssets || [];
      if (missing.includes('photo')) needPhotoDims.push(dimId);
      if (noAssets.length) missingAssetDims.push(dimId);
      if (over.length) for (const s of over) (perSlot[s] ||= []).push(dimId);
      if (failed.length) {
        contrastDims.push(dimId);
        if (failed.some((s) => s !== 'logo')) contrastTextDims.push(dimId);
        if (failed.includes('logo')) contrastLogoDims.push(dimId);
        const rows = [...Object.values(truth.backdrop?.slots || {}), truth.backdrop?.logo].filter(Boolean);
        if (rows.some((r) => r.unreadable)) unreadable = true;
      }
      if (over.length || failed.length || missing.length || noAssets.length) {
        perDim[dimId] = { breaks: over, contrast: failed, missing, noAssets };
      }
    }
    return {
      perDim, perSlot,
      any: Object.keys(perDim).length > 0,
      breakDims: dimOrder.filter((d) => perDim[d]?.breaks.length),
      contrastDims, contrastTextDims, contrastLogoDims, unreadable,
      needPhotoDims, missingAssetDims,
    };
  }, [truths, dimOrder]);

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
    // A new picture is a new framing decision — her old crop would be a crop of
    // something else.
    resetPhotoTransform();
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
    resetPhotoTransform();
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
    resetPhotoTransform();
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
    for (const dimId of dimOrder) if (!blocked.perDim[dimId]) download(dimId);
  }

  const allBlocked = Object.keys(blocked.perDim).length === dimOrder.length;
  // Does the ACTIVE template insist on a photo? Read off the contract, never
  // hardcoded per template (§3: the surface may only consume the contract).
  const photoRequired = dimOrder.some((d) => slotConstraint(TEMPLATE, 'photo', d)?.required);


  /* ── WHAT A SECTION IS ───────────────────────────────────────────────────
     One entry per id in PANEL_SECTION_IDS. The template says WHICH of these
     it has and in WHAT ORDER (`panelSections`); this table says what each one
     looks like. Nothing here inspects a template id — swap the two templates'
     declarations and the panel rearranges itself with no edit to this file.

     Two of them are the client's 2026-08-18 groupings:
       · `background` — the colour pair AND the photo, one section. On Classic
         both are "what sits behind the words".
       · `window`     — the silhouette AND the photo, one section. On Petal
         Window both are "the picture".
     The photo control itself is ONE piece of JSX used by both: its holds, its
     refusal copy and its required/optional line are unchanged and unmoved in
     behaviour — only which heading it sits under has changed.               */
  const photoControl = (
    <div style={S.subField}>
      <span style={S.subLabel}>{photoRequired ? 'Photo (required)' : 'Photo (optional)'}</span>
      {photo ? (
        <div style={S.photoRow}>
          <img src={photo.src} alt="" style={S.photoThumb} />
          <div style={S.photoMeta}>
            <span style={S.photoName}>{photo.filename}</span>
            <button type="button" onClick={removePhoto} style={S.linkBtn}>Remove photo</button>
          </div>
        </div>
      ) : (
        <p style={photoRequired ? S.warn : S.hint}>
          {photoRequired
            ? 'This design is the photograph — choose one before you can download.'
            : 'No photo — the tile stays a plain colour field.'}
        </p>
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

      {/* ── FRAME THE PICTURE (client ruling 2026-08-18). Offered only where the
          TEMPLATE declares its photo adjustable, and only once there is a photo
          to frame — a slider over nothing is a dead control (M4). */}
      {photoAdjustable && photo && (
        <div style={S.subField}>
          <span style={S.subLabel}>Framing</span>
          <p style={S.hint}>Drag any preview to move the picture inside the shape.</p>
          <div style={S.zoomRow}>
            <label htmlFor="photo-zoom" style={S.zoomLabel}>Size</label>
            <input
              id="photo-zoom"
              type="range"
              min={PHOTO_ZOOM_MIN}
              max={PHOTO_ZOOM_MAX}
              step={0.01}
              value={photoTransform.zoom}
              onChange={(e) => setPhotoTransform((t) => ({ ...t, zoom: Number(e.target.value) }))}
              style={S.zoomInput}
            />
            <button type="button" onClick={resetPhotoTransform} style={S.linkBtn}>Reset</button>
          </div>
        </div>
      )}
    </div>
  );

  /* `data-section` is not styling — it is how the live verification reads the
     ORDER the panel actually rendered, off the DOM, without depending on a
     label string. The declaration and the surface can then be compared to each
     other rather than both to a screenshot. */
  const SECTIONS = {
    words: (
      <div key="words" data-section="words" style={S.sectionStack}>
        {textSlots.map((slot) => {
          const budget = TEMPLATE.slots[slot].charBudget;
          const used = values[slot].length;
          // The surface's default copy, which a template may override for a
          // slot that honestly wants a different name (`slotLabels`).
          const meta = { ...(FIELD_LABELS[slot] || { label: slot, hint: '' }), ...(TEMPLATE.slotLabels?.[slot] || {}) };
          const breaksIn = blocked.perSlot[slot] || [];
          const showImprove = improve.slot === slot;
          return (
            <div key={slot} style={S.field}>
              <div style={S.fieldHead}>
                <label htmlFor={`slot-${slot}`} style={S.label}>{meta.label}</label>
                <div style={S.fieldHeadRight}>
                  {/* THE TEXT TOGGLE. Beside the field it governs, in plain
                      words — she never sees a state name. Only templates that
                      declare a second layout show it at all. */}
                  {textToggle && (
                    <button
                      type="button"
                      onClick={() => setShowText((on) => !on)}
                      aria-pressed={showText}
                      title="Turn the words on this design off or on. Your words are kept either way."
                      style={{ ...S.toggle, ...(showText ? S.toggleOn : null) }}
                    >
                      {showText ? 'Text on' : 'Text off'}
                    </button>
                  )}
                  <span style={{ ...S.counter, color: used >= budget ? 'var(--tw-tangerine, #F6644E)' : 'var(--fg-muted, #6b6f6b)' }}>
                    {used}/{budget}
                  </span>
                </div>
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
              {/* §6.3 rule 2 — the choice SAYS what it is doing, in one line. */}
              {textToggle && !showText && (
                <p role="status" style={S.note}>
                  Text is off, so this design is the picture on its own. Your words are kept and come back when you turn text on.
                </p>
              )}

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
      </div>
    ),
    colour: (
      <div key="colour" data-section="colour" style={S.field}>
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
    ),
    /* "replace the edit colour for Background, and combine photo selection as
       part of the edit section" — the pair picker and the photo, together. */
    background: (
      <div key="background" data-section="background" style={S.field}>
        <span style={S.label}>Background</span>
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
        {TEMPLATE.slots.photo?.present && photoControl}
      </div>
    ),
    /* "Make window shape and photo selection the same section, it should be
       the first section" — FIRST is the template's declaration, not ours. */
    window: (
      <div key="window" data-section="window" style={S.field}>
        <span style={S.label}>The window</span>
        {maskShapes.length > 1 && (
        <div style={S.marks}>
          {maskShapes.map((shape) => (
            <button
              key={shape.id} type="button"
              onClick={() => setMaskShapeId(shape.id)}
              aria-pressed={maskAsset?.id === shape.id}
              title={shape.label}
              style={{ ...S.markTile, ...(maskAsset?.id === shape.id ? S.markTileOn : null) }}
            >
              {/* The src is carried in a data attribute too, so the live
                  verification can read WHICH shape a tile offers without
                  depending on how the thumbnail happens to be painted. */}
              <span data-shape-src={shape.src} aria-hidden="true" style={{ display: 'contents' }}>
                <ShapeThumb src={shape.src} ink={pair.klass === 'dark' ? '#254E48' : 'var(--fg-strong, #254E48)'} />
              </span>
              <span style={S.srOnly}>{shape.label}</span>
            </button>
          ))}
        </div>
        )}
        {maskShapes.length > 1 && <p style={S.hint}>Your photo is cut to this shape.</p>}
        {TEMPLATE.slots.photo?.present && photoControl}
      </div>
    ),
    mark: (
      <div key="mark" data-section="mark" style={S.field}>
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
    ),
    markPosition: (
      <div key="markPosition" data-section="markPosition" style={S.field}>
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
    ),
  };

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
            {/* TEMPLATE SELECTOR. A REAL switch now that there are two: it
                opens, marks the current one, and picking the other one changes
                the design. §6.3 — the swap keeps every word she has written,
                remembers her colour/mark choices per template, and says in one
                line what the new template does not show. */}
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
                            onClick={() => chooseTemplate(t)}
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
              {swapNote && <p role="status" style={S.note}>{swapNote}</p>}
            </div>

            {/* ── THE SECTIONS, IN THE TEMPLATE'S OWN ORDER ─────────────────
                (client ruling 2026-08-18) Section order is TEMPLATE-SPECIFIC:
                Classic leads with the words, Petal Window leads with the
                window. That is DECLARED — `template.panelSections` — and this
                is the whole of the surface's part in it: render the array in
                sequence. There is no branch on a template id anywhere in this
                file, and adding one would put the solver back in UI code.
                What a section IS lives here; WHICH sections and in what order
                lives on the template (lib/templates/template-contract.mjs). */}
            {TEMPLATE.panelSections.map((sectionId) => SECTIONS[sectionId])}
          </div>

          {/* Anchored at the BOTTOM of the panel — never scrolls out of reach. */}
          <div className="wo-panel-foot">
            <button type="button" onClick={downloadAll} disabled={allBlocked} style={{ ...S.primaryBtn, opacity: allBlocked ? 0.5 : 1 }}>
              Download all sizes
            </button>
            {blocked.needPhotoDims.length > 0 && (
              <p role="status" style={S.warn}>
                {listNames(blocked.needPhotoDims)} {blocked.needPhotoDims.length > 1 ? 'are' : 'is'} on hold until you choose a photo — this template needs one.
              </p>
            )}
            {blocked.missingAssetDims.length > 0 && (
              <p role="status" style={S.warn}>
                Part of this design could not be loaded, so it cannot be downloaded. Reload the page and try again.
              </p>
            )}
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
          {[TALL_ROW.filter((d) => TEMPLATE.dimensions[d]), WIDE_ROW.filter((d) => TEMPLATE.dimensions[d])].map((row, i) => (
            <div key={i === 0 ? 'tall' : 'wide'} className={`wo-row ${i === 0 ? 'wo-row-tall' : 'wo-row-wide'}`}>
              {row.map((dimId) => {
                const dim = DIMENSIONS[dimId];
                const isBlocked = !!blocked.perDim[dimId];
                const truth = truths[dimId];
                return (
                  <figure key={dimId} className={`wo-cell wo-cell-${dimId}`}>
                    <div className="wo-cell-frame">
                      {/* The ONE pointer drag on a preview, and it is enabled
                          only where the TEMPLATE declares the photo adjustable
                          (never by a template-id check). touch-action:none is
                          what makes a touch drag a drag instead of a page
                          scroll. It writes photoTransform and nothing else. */}
                      <canvas
                        ref={(el) => { canvasRefs.current[dimId] = el; }}
                        onPointerDown={photoAdjustable && photoImage ? startPhotoPan : undefined}
                        onPointerMove={photoAdjustable && photoImage ? movePhotoPan : undefined}
                        onPointerUp={photoAdjustable && photoImage ? endPhotoPan : undefined}
                        onPointerCancel={photoAdjustable && photoImage ? endPhotoPan : undefined}
                        style={{
                          aspectRatio: `${dim.w} / ${dim.h}`,
                          opacity: isBlocked ? 0.45 : 1,
                          touchAction: photoAdjustable && photoImage ? 'none' : undefined,
                          cursor: photoAdjustable && photoImage ? 'grab' : undefined,
                        }}
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
                          {/* Read off the RENDER TRUTH, not the base contract:
                              an authored state may not paint a heading at all,
                              and reporting a size for type nobody can see would
                              be the narration disagreeing with the canvas. */}
                          {truth.slots.heading ? ` · heading ${truth.slots.heading.paintedPx}px` : ''}
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
  fieldHeadRight: { display: 'flex', alignItems: 'baseline', gap: 10 },
  toggle: { minHeight: 26, padding: '0 10px', borderRadius: 13, border: '1px solid var(--line, rgba(37,78,72,0.18))', background: 'transparent', color: 'var(--fg-muted, #6b6f6b)', fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer' },
  toggleOn: { background: 'var(--fg-strong, #254E48)', color: '#F5F6E7', border: '1px solid var(--fg-strong, #254E48)' },
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
  // A section that holds several fields (the words) keeps the panel's own
  // rhythm, so grouping them changed no spacing.
  sectionStack: { display: 'flex', flexDirection: 'column', gap: 20 },
  // A MERGED section's second half — the photo inside Background / The window.
  // Quieter than a section label, because it is not a section any more.
  subField: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 },
  subLabel: { fontFamily: 'var(--font-syne)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-muted, #6b6f6b)' },
  zoomRow: { display: 'flex', alignItems: 'center', gap: 10 },
  zoomLabel: { fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg-muted, #6b6f6b)' },
  zoomInput: { flex: '1 1 auto', minWidth: 0, accentColor: 'var(--fg-strong, #254E48)' },
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
  // The shapes ship at fill-opacity 0.4; the thumbnail shows the SILHOUETTE, so
  // the same alpha saturation the render core applies is faked here with a
  // brightness/contrast filter rather than eight stacked <img> elements.
  srOnly: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 },

  // Photo
  photoRow: { display: 'flex', gap: 10, alignItems: 'center' },
  photoThumb: { width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line, rgba(37,78,72,0.18))' },
  photoMeta: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  photoName: { fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg-strong, #254E48)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
