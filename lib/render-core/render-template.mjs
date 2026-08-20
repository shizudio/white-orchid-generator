/* ─────────────────────────────────────────────────────────────────────────
   THE RENDER CORE — docs/template-system-spec.md §4.

     "Given a template and slot values, paint a canvas."

   HARD BOUNDARIES (what this file must never grow):
     · no archetype selection            · no placement solving
     · no per-format derive              · no capacity clamps
     · no advisor / audit                · no degradation ladder
     · no user-facing size control       — autofit owns size completely (§7)

   ONE AMENDED BOUNDARY (client ruling 2026-08-18). "No runtime contrast guard"
   held because colour pairs are pre-verified at bake time. A user-chosen PHOTO
   cannot be pre-verified at authoring time, so when — and only when — a photo
   is painted, the core measures the real backdrop under each ink and reports
   it. It still guards nothing: it never recolours, relocates, re-scrims or
   substitutes anything (M3, law 3). It measures; the surface refuses.

   Everything the admin renderer negotiates at runtime is already decided by the
   template, so this function is a painter with no opinions. The ONE measurement
   it reports back is the §7.2 over-budget signal (a hard break can push copy
   past maxLines while still under charBudget); the surface uses it to block
   export for the affected dimension.
   ───────────────────────────────────────────────────────────────────────── */

import { DEFAULT_FONTS } from '../brand-defaults.js';
import { DIMENSIONS, TEXT_SLOTS, SLOTS, slotConstraint } from '../templates/template-contract.mjs';
import { floorPxFor } from './floor.mjs';
import { autofit, autofitTrackedCaps, paintLines, paintTrackedCaps } from './text.mjs';
import { checkInkOnBackdrop, TEXT_MIN_CONTRAST, MARK_MIN_CONTRAST } from './backdrop-contrast.mjs';

const FONT_ROLE = Object.freeze({ title: 'title', subtitle: 'subtitle', body: 'body', quote: 'quote', logo: 'logo' });

/** A box in canvas px from the template's authored fractions. */
function pxBox(frac, w, h) {
  return { x: frac.x * w, y: frac.y * h, w: frac.w * w, h: frac.h * h };
}

/**
 * The source rect that makes `img` fill (`cover`) or sit inside (`contain`) the
 * destination box at its true aspect ratio. Enum in, geometry out — the
 * template chose the enum, this does not decide anything.
 */
function fitRects(img, box, fit) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  if (fit === 'contain') {
    const s = Math.min(box.w / iw, box.h / ih);
    const dw = iw * s;
    const dh = ih * s;
    return { sx: 0, sy: 0, sw: iw, sh: ih, dx: box.x + (box.w - dw) / 2, dy: box.y + (box.h - dh) / 2, dw, dh };
  }
  const s = Math.max(box.w / iw, box.h / ih);
  const sw = box.w / s;
  const sh = box.h / s;
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh, dx: box.x, dy: box.y, dw: box.w, dh: box.h };
}

/* ── THE SCRATCH SURFACE (client ruling 2026-08-18 — template two) ───────────
   A masked photo cannot be painted with a rect clip: the silhouette lives in a
   real brand SVG, so the photo is composited against that asset's ALPHA on a
   scratch canvas and the finished cut-out is stamped onto the real one. The
   scratch surface is obtained from the context that is already painting, so the
   core still owns no document of its own; `options.makeScratchCanvas` lets a
   test hand one in. Nothing is guessed — with no surface to be had, the caller
   is TOLD (truth.missingAssets) instead of a full-bleed photo being painted
   under a masked template's name. */
function makeScratch(ctx, w, h, options) {
  if (typeof options.makeScratchCanvas === 'function') return options.makeScratchCanvas(w, h);
  const doc = ctx?.canvas?.ownerDocument;
  if (doc && typeof doc.createElement === 'function') {
    const c = doc.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  return null;
}

/* THE EMPTY STATE FOR A REQUIRED PHOTO (client ruling 2026-08-18 — template
   two). "A petal window with no photo is not a design." So a template may
   declare its photo `required`, and what she sees until she picks one is an
   OBVIOUS placeholder IN THE SHAPE OF THE WINDOW — not a hole, not a decorative
   blank, and never a stand-in photograph (law 3). Export stays blocked until a
   real photo is chosen, so these pixels can never leave the app.
   This is core behaviour driven by a declared flag, exactly like the scrim: the
   template holds a boolean, never a branch. */
/* ── THE MASK STAMP ──────────────────────────────────────────────────────────
   Two things every silhouette needs before it can cut a photo, and neither is
   the core inventing anything:

   1. ALPHA SATURATION. Some shipped shape assets are authored at
      `fill-opacity="0.4"` (shape-1/2/3 — the documented alpha-saturation saga,
      commits 9d269ab / acf5a8f). Used raw as a mask that yields a 40%-opaque
      photograph — a ghost, not a window. Drawing the SAME asset over itself N
      times with plain source-over drives its alpha to 1 without touching its
      shape: 1 - 0.6^16 = 0.9997, i.e. a fully opaque stamp (8 passes leaves a
      measurable 1.6% ghost, so 8 is not enough). This is the admin painter's
      own technique, and
      it is a NO-OP on an already-opaque silhouette like petal-brand, so the
      two surfaces stay twins.

   2. TRUE PROPORTIONS. A silhouette drawn to fill a box that is not its own
      aspect ratio is a STRETCHED brand shape. The stamp is therefore always
      CONTAINED in the photo box at the asset's own ratio; a shape squarer or
      rounder than the box simply occupies less of it. Template two's boxes are
      authored at the brand petal's ratio, so for that shape the contain is an
      identity and the baked geometry is unchanged. */
const MASK_ALPHA_PASSES = 16;

function maskStamp(ctx, maskImage, box, options) {
  const stamp = makeScratch(ctx, box.w, box.h, options);
  if (!stamp) return null;
  const stx = stamp.getContext('2d');
  stx.clearRect(0, 0, box.w, box.h);
  const r = fitRects(maskImage, { x: 0, y: 0, w: box.w, h: box.h }, 'contain');
  for (let i = 0; i < MASK_ALPHA_PASSES; i += 1) {
    stx.drawImage(maskImage, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
  }
  return stamp;
}

const PLACEHOLDER_LABEL = 'CHOOSE A PHOTO';
const PLACEHOLDER_SHAPE_ALPHA = 0.14;
const PLACEHOLDER_LABEL_ALPHA = 0.75;

/** The logo's placed rect — pure geometry, computed before anything is painted. */
function logoRect(template, logoSlot, values, w, h) {
  const allowed = template.allowedLogoPositions;
  const requested = values.logoPosition;
  const position = Array.isArray(allowed) && allowed.includes(requested) ? requested : (Array.isArray(allowed) ? allowed[0] : null);
  if (!position) return null;
  const img = values.logoImage;
  const pad = (logoSlot.pad ?? 0.05) * w;
  const lw = (logoSlot.widthFrac ?? 0.12) * w;
  const ratio = (img.naturalHeight || img.height || 1) / (img.naturalWidth || img.width || 1);
  const lh = lw * ratio;
  const x = position.endsWith('left') ? pad
    : position.endsWith('center') ? (w - lw) / 2
      : w - pad - lw;
  const y = position.startsWith('top') ? pad : h - pad - lh;
  return { x, y, w: lw, h: lh, position };
}

/** Resolves a template register row to a CSS font-family string via the brand font map. */
function familyFor(role, fonts) {
  return fonts[FONT_ROLE[role] || 'body'] || fonts.body;
}

/** The colour pair the values select, falling back to the template's first pair. */
export function resolveColourPair(template, colourPairId) {
  const pairs = template.colourPairs || [];
  return pairs.find((p) => p.id === colourPairId) || pairs[0] || null;
}

/**
 * Paints one dimension of one template.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} template   a validated template (lib/templates/*)
 * @param {string} dimensionId  one of the four (§5)
 * @param {object} values     { eyebrow, heading, body, pill, attribution,
 *                              colourPairId, logoPosition, logoImage,
 *                              photoImage }  — photoImage absent === no photo,
 *                              which paints nothing and renders byte-identically
 *                              to a template with no photo slot at all.
 * @param {object} [options]  { fonts } — brand font map override (multi-tenancy)
 * @returns {object} renderTruth — what actually landed on the canvas
 */
export function renderTemplate(ctx, template, dimensionId, values = {}, options = {}) {
  const dim = DIMENSIONS[dimensionId];
  if (!dim) throw new Error(`renderTemplate: unknown dimension '${dimensionId}'`);
  if (!template?.dimensions?.[dimensionId]) throw new Error(`renderTemplate: template '${template?.id}' does not support '${dimensionId}'`);

  const fonts = options.fonts || DEFAULT_FONTS;
  const { w, h } = dim;
  const pair = resolveColourPair(template, values.colourPairId);
  const bg = pair?.bg || '#FFFFFF';
  const ink = pair?.ink || '#000000';

  const truth = {
    templateId: template.id,
    templateVersion: template.version,
    dimensionId,
    width: w,
    height: h,
    colourPair: pair ? { id: pair.id, bg, ink, contrast: pair.contrast } : null,
    slots: {},
    logoBox: null,
    overBudgetSlots: [],
    // The photo half of the truth. `photo:null` is the honest statement that
    // nothing was painted — which is exactly what the flat tile reports.
    photo: null,
    // What she sees while a REQUIRED photo is still missing, plus the required
    // slots that are still empty and the declared assets that never arrived.
    // All three are MEASUREMENTS the surface refuses on (§7.2 idiom) — the core
    // still guards nothing itself.
    photoPlaceholder: null,
    missingRequired: [],
    missingAssets: [],
    backdrop: { checked: false, slots: {}, logo: null },
    contrastFailures: [],
  };

  // ── 1. The field. A pre-verified pair; nothing is re-checked here (§10A).
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // ── 1b. THE PHOTO, then the template's declared scrim over it. Both are read
  //       off the table: the box and `fit` per dimension, the scrim colour and
  //       opacity per colour class. The core ALWAYS paints the scrim over a
  //       photo — that is core behaviour, not a template decision — and it
  //       NEVER adapts the opacity to the photo (no ladder, §10A in spirit).
  const photoPer = slotConstraint(template, 'photo', dimensionId);
  // PER-PAIR (client ruling 2026-08-18). Keyed by the pair's OWN id, not its
  // colour class: a sage tile keeps its sage wash behind a photo instead of
  // borrowing ivory's. Still a plain lookup — the core decides nothing.
  const scrimRow = pair?.id ? template.slots?.photo?.scrim?.[pair.id] : null;
  const maskId = template.slots?.photo?.mask || null;
  if (photoPer) {
    const box = pxBox(photoPer.box, w, h);
    // A template that declares a mask CANNOT paint without one. Painting the
    // photo unmasked would be a different design wearing this template's name
    // (M3: nothing is silently substituted), so the render reports the missing
    // asset and paints no photo at all.
    const maskMissing = !!maskId && !values.maskImage;
    if (maskMissing) truth.missingAssets.push('mask');

    if (values.photoImage && !maskMissing) {
      if (maskId) {
        const scratch = makeScratch(ctx, box.w, box.h, options);
        if (!scratch) {
          truth.missingAssets.push('scratch-surface');
        } else {
          const sx = scratch.getContext('2d');
          const local = { x: 0, y: 0, w: box.w, h: box.h };
          const r = fitRects(values.photoImage, local, photoPer.fit);
          sx.clearRect(0, 0, box.w, box.h);
          sx.drawImage(values.photoImage, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
          // The brand silhouette's OWN shape cuts the window, at full alpha and
          // at its true proportions.
          const stamp = maskStamp(ctx, values.maskImage, box, options);
          if (!stamp) {
            truth.missingAssets.push('scratch-surface');
          } else {
            sx.globalCompositeOperation = 'destination-in';
            sx.drawImage(stamp, 0, 0, box.w, box.h);
          }
          // …and the scrim tints only what survived the cut.
          if (scrimRow) {
            sx.globalCompositeOperation = 'source-atop';
            sx.globalAlpha = scrimRow.opacity;
            sx.fillStyle = scrimRow.colour;
            sx.fillRect(0, 0, box.w, box.h);
            sx.globalAlpha = 1;
          }
          sx.globalCompositeOperation = 'source-over';
          ctx.drawImage(scratch, box.x, box.y, box.w, box.h);
          truth.photo = {
            box, fit: photoPer.fit,
            // WHICH silhouette actually cut it — her pick when she made one,
            // the template's default otherwise. Reported, never assumed.
            mask: values.maskShapeId || maskId,
            scrim: scrimRow ? { colour: scrimRow.colour, opacity: scrimRow.opacity } : null,
          };
        }
      } else {
        const r = fitRects(values.photoImage, box, photoPer.fit);
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.drawImage(values.photoImage, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
        ctx.restore();
        if (scrimRow) {
          ctx.save();
          ctx.globalAlpha = scrimRow.opacity;
          ctx.fillStyle = scrimRow.colour;
          ctx.fillRect(box.x, box.y, box.w, box.h);
          ctx.restore();
        }
        truth.photo = {
          box, fit: photoPer.fit, mask: null,
          scrim: scrimRow ? { colour: scrimRow.colour, opacity: scrimRow.opacity } : null,
        };
      }
    } else if (photoPer.required) {
      // THE HONEST EMPTY STATE. Not a hole and not a decorative blank — the
      // window itself, ghosted in the field's own ink, saying what it wants.
      if (values.maskImage) {
        const scratch = maskStamp(ctx, values.maskImage, box, options);
        if (scratch) {
          const sx = scratch.getContext('2d');
          sx.globalCompositeOperation = 'source-in';
          sx.fillStyle = ink;
          sx.fillRect(0, 0, box.w, box.h);
          sx.globalCompositeOperation = 'source-over';
          ctx.save();
          ctx.globalAlpha = PLACEHOLDER_SHAPE_ALPHA;
          ctx.drawImage(scratch, box.x, box.y, box.w, box.h);
          ctx.restore();
        }
      }
      const labelSize = Math.max(14, Math.round(Math.min(box.w, box.h) * 0.055));
      ctx.save();
      ctx.globalAlpha = PLACEHOLDER_LABEL_ALPHA;
      ctx.fillStyle = ink;
      ctx.font = `500 ${labelSize}px ${fonts.subtitle || fonts.body}`;
      ctx.letterSpacing = `${labelSize * 0.09}px`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PLACEHOLDER_LABEL, box.x + box.w / 2, box.y + box.h / 2);
      ctx.letterSpacing = '0px';
      ctx.restore();
      truth.photoPlaceholder = { box, mask: values.maskShapeId || maskId, label: PLACEHOLDER_LABEL };
    }
  }

  // ── 1c. Geometry for every ink, resolved BEFORE anything is painted, so the
  //       backdrop can be measured under each one while it is still bare.
  const textBoxes = [];
  for (const slotName of template.paintOrder || TEXT_SLOTS) {
    if (!TEXT_SLOTS.includes(slotName)) continue;
    const per = slotConstraint(template, slotName, dimensionId);
    if (!per || !template.registers?.[slotName]) continue;
    textBoxes.push({ slotName, per, box: pxBox(per.box, w, h) });
  }
  const logoSlot = slotConstraint(template, 'logo', dimensionId);
  const placedLogo = logoSlot && values.logoImage ? logoRect(template, logoSlot, values, w, h) : null;

  // ── 1d. THE BACKDROP CHECK — only when a photo is actually there (see
  //       backdrop-contrast.mjs for why this amendment is scoped this tightly).
  //       Measured against the ink ACTUALLY USED, on the pixels ACTUALLY
  //       PAINTED. Nothing is fixed here; the surface refuses (§7.2 idiom).
  if (truth.photo) {
    truth.backdrop.checked = true;
    for (const { slotName, box } of textBoxes) {
      if (!String(values[slotName] ?? '').trim()) continue; // an empty slot has no ink to be unreadable
      const r = checkInkOnBackdrop(ctx, box, ink, w, h, TEXT_MIN_CONTRAST);
      truth.backdrop.slots[slotName] = r;
      if (!r.ok) truth.contrastFailures.push(slotName);
    }
  }
  // The MARK is measured whenever the caller names the ink it paints in. That
  // is a second unverifiable-at-bake-time freedom: which brand variant she
  // picked. A pre-verified pair's DEFAULT mark clears this every time (the
  // pairs were baked against it), so the ordinary path stays born-clean; only
  // a swap she made herself, or a photo, can move it.
  if (placedLogo && values.logoInk) {
    truth.backdrop.checked = true;
    const r = checkInkOnBackdrop(ctx, placedLogo, values.logoInk, w, h, MARK_MIN_CONTRAST);
    truth.backdrop.logo = r;
    if (!r.ok) truth.contrastFailures.push('logo');
  }

  // ── 2. Text slots, in the template's declared paint order.
  for (const { slotName, per, box } of textBoxes) {
    const reg = template.registers[slotName];
    const floorPx = floorPxFor(slotName, w, h);
    const text = String(values[slotName] ?? '');
    const family = familyFor(reg.face, fonts);

    let fit;
    if (reg.caps) {
      fit = autofitTrackedCaps(ctx, {
        text, font: family, weight: reg.weight, tracking: reg.tracking ?? 0.08,
        box, maxLines: per.maxLines, floorPx, lineRatio: reg.lineRatio,
      });
      if (fit.lines.length) {
        paintTrackedCaps(ctx, {
          lines: fit.lines, box, size: fit.size, lineHeight: fit.lineHeight,
          font: family, weight: reg.weight, tracking: reg.tracking ?? 0.08,
          align: reg.align || 'left', fill: ink,
        });
      }
    } else {
      const fontFor = (size) => `${reg.italic ? 'italic ' : ''}${reg.weight} ${size}px ${family}`;
      fit = autofit(ctx, { text, fontFor, box, maxLines: per.maxLines, floorPx, lineRatio: reg.lineRatio });
      if (fit.lines.length) {
        paintLines(ctx, {
          lines: fit.lines, box, size: fit.size, lineHeight: fit.lineHeight,
          align: reg.align || 'left', fontFor, fill: ink,
        });
      }
    }

    truth.slots[slotName] = {
      box, chars: text.length, charBudget: per.charBudget, maxLines: per.maxLines,
      floorPx: Math.round(floorPx * 100) / 100,
      paintedPx: fit.size,
      atFloor: fit.atFloor,
      lines: fit.lines.length,
      wrappedLines: fit.wrappedLines,
      overBudget: fit.overBudget,
      overCharBudget: text.length > per.charBudget,
      empty: !text.trim(),
    };
    if (fit.overBudget) truth.overBudgetSlots.push(slotName);
  }

  // ── 2b. REQUIRED SLOTS THAT ARE STILL EMPTY (client ruling 2026-08-18).
  //       `required` has always been in the contract; until template two it had
  //       nothing to refuse with. This MEASURES which required slots are empty —
  //       it does not fill them, substitute them or nag. The surface blocks
  //       export for the affected dimensions, in the §7.2 idiom.
  for (const slotName of SLOTS) {
    const per = slotConstraint(template, slotName, dimensionId);
    if (!per || !per.required) continue;
    if (slotName === 'photo') { if (!truth.photo) truth.missingRequired.push('photo'); continue; }
    if (slotName === 'logo') { if (!truth.logoBox && !(logoSlot && values.logoImage)) truth.missingRequired.push('logo'); continue; }
    if (slotName === 'colourPair') { if (!pair) truth.missingRequired.push('colourPair'); continue; }
    if (slotName === 'motif') { if (!values.motif) truth.missingRequired.push('motif'); continue; }
    if (!String(values[slotName] ?? '').trim()) truth.missingRequired.push(slotName);
  }

  // ── 3. Logo — a slot value (which corner and, since 2026-08-18, WHICH real
  //      brand mark), never a drag. Placement is the template's
  //      `allowedLogoPositions` ∩ the value; size is authored; the asset is the
  //      caller's choice out of `allowedLogoAssets` (lib/templates/logo-assets).
  if (placedLogo) {
    ctx.drawImage(values.logoImage, placedLogo.x, placedLogo.y, placedLogo.w, placedLogo.h);
    truth.logoBox = placedLogo;
  }

  return truth;
}

/** Renders every dimension a template declares. Used by the four-up surface. */
export function renderAllDimensions(makeCtx, template, values, options) {
  const out = {};
  for (const dimensionId of Object.keys(template.dimensions)) {
    const dim = DIMENSIONS[dimensionId];
    const ctx = makeCtx(dimensionId, dim.w, dim.h);
    out[dimensionId] = renderTemplate(ctx, template, dimensionId, values, options);
  }
  return out;
}
