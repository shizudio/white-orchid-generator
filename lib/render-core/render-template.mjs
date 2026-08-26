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
import {
  DIMENSIONS, TEXT_SLOTS, SLOTS, slotConstraint, PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX, PHOTO_PAN_RANGE,
} from '../templates/template-contract.mjs';
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
/* ── HER CROP INSIDE A FIXED WINDOW (client ruling 2026-08-18) ───────────────
   Petal Window only, and only because that template DECLARES its photo
   adjustable. The window does not move and the template's geometry does not
   change; this shifts the SOURCE rect — which part of her picture shows.

   WHY EMPTY FIELD CAN NEVER ENTER THE WINDOW: the transform is expressed in
   units of the SLACK the zoom creates, never in pixels. `zoom` shrinks the
   source rect (so the window is always fully covered by construction), and
   `pan` ±1 means "to the edge of what this zoom allows". At zoom 1 a cover fit
   leaves zero slack on one axis, so that axis cannot move at all. There is no
   clamp to get around because there is no unclamped quantity. */
function applyPhotoTransform(r, img, transform) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const zoom = Math.min(PHOTO_ZOOM_MAX, Math.max(PHOTO_ZOOM_MIN, Number(transform?.zoom) || 1));
  const clampPan = (n) => Math.min(PHOTO_PAN_RANGE, Math.max(-PHOTO_PAN_RANGE, Number(n) || 0));
  const px = clampPan(transform?.x);
  const py = clampPan(transform?.y);
  const sw = r.sw / zoom;
  const sh = r.sh / zoom;
  const slackX = Math.max(0, iw - sw);
  const slackY = Math.max(0, ih - sh);
  return {
    ...r,
    sw,
    sh,
    sx: slackX / 2 + px * (slackX / 2),
    sy: slackY / 2 + py * (slackY / 2),
    transform: { x: px, y: py, zoom },
  };
}

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

/* ── WHICH AUTHORED STATE (client ruling 2026-08-18, AMENDED same day) ───────
   "how do i activate the petal window empty state? ideally i should have a
    deactive text toggle next to 'the line that carries the post'"

   THE STATE IS A CHOICE SHE MAKES, NOT SOMETHING THE CORE INFERS. The first
   ruling asked for the second layout when the words were empty; the amendment
   replaces that with an explicit toggle, and it is strictly better:

     · A LAYOUT CAN NEVER JUMP MID-EDIT. Inferring from emptiness meant that
       clearing the line to retype it flipped the whole composition and flipped
       it back — a surprise of exactly the class this app exists to remove.
     · IT STOPS BEING CONTENT-DEPENDENT AT ALL. `showText` is a slot value like
       the colour pair or the logo corner: stored, swap-safe, hers. The core
       inspects no copy to decide what to paint, so nothing here can drift
       toward "if the body is long then…".

   THE WHOLE RULE: a template that declares a `photoOnly` state renders it when
   she has turned text off, and its baked `withHeading` geometry otherwise. It
   reads `template.states`, never a template id — a template with no second
   state returns null and cannot branch at all, which is why template one is
   untouched by construction rather than by exception. There is no third state
   and no interpolation; `assertValidTemplate` refuses one, and that is the line
   at which this would stop being two drawings and become a solver again.

   TEXT OFF DOES NOT DELETE TEXT (§6.3 rule 1). Her words stay in the values and
   come straight back when she turns it on; this only chooses which drawing the
   core paints.                                                              */
export function resolveTemplateState(template, values = {}) {
  if (!template?.states?.photoOnly) return null;
  return values.showText === false ? 'photoOnly' : 'withHeading';
}

/** Does this template offer the text on/off choice at all? Read off the data. */
export function templateOffersTextToggle(template) {
  return !!template?.states?.photoOnly;
}

export function renderTemplate(ctx, template, dimensionId, values = {}, options = {}) {
  const dim = DIMENSIONS[dimensionId];
  if (!dim) throw new Error(`renderTemplate: unknown dimension '${dimensionId}'`);
  if (!template?.dimensions?.[dimensionId]) throw new Error(`renderTemplate: template '${template?.id}' does not support '${dimensionId}'`);

  const fonts = options.fonts || DEFAULT_FONTS;
  const { w, h } = dim;
  // WHICH AUTHORED STATE this render is in — from her own on/off choice, never
  // from the copy. `null` for every template that declares only one layout, and
  // then every lookup below is byte-for-byte the lookup it always was.
  const state = resolveTemplateState(template, values);
  const pair = resolveColourPair(template, values.colourPairId);
  const bg = pair?.bg || '#FFFFFF';
  const ink = pair?.ink || '#000000';

  const truth = {
    templateId: template.id,
    templateVersion: template.version,
    dimensionId,
    // Which authored state painted this — reported, never inferred by a caller.
    state,
    width: w,
    height: h,
    colourPair: pair ? { id: pair.id, bg, ink, contrast: pair.contrast } : null,
    slots: {},
    logoBox: null,
    // The plate the template declared behind the mark, as it was really
    // painted — or null where none is declared. Reported so the surface and
    // the verification can see the field the mark was measured against.
    logoPlate: null,
    overBudgetSlots: [],
    // The photo half of the truth. `photo:null` is the honest statement that
    // nothing was painted — which is exactly what the flat tile reports.
    photo: null,
    // The motif half of the truth. `motif:null` is the honest statement that
    // no watermark was painted — which is what every template that declares
    // none reports, and what a template that declares one reports when its
    // asset never arrived (see `missingAssets` below).
    motif: null,
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
  const photoPer = slotConstraint(template, 'photo', dimensionId, state);
  // PER-PAIR (client ruling 2026-08-18). Keyed by the pair's OWN id, not its
  // colour class: a sage tile keeps its sage wash behind a photo instead of
  // borrowing ivory's. Still a plain lookup — the core decides nothing.
  const scrimRow = pair?.id ? template.slots?.photo?.scrim?.[pair.id] : null;
  const maskId = template.slots?.photo?.mask || null;
  // WHOSE photo may be cropped — declared per template, never an id check.
  const adjustable = template.slots?.photo?.adjustable === true;
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
          const r = adjustable
            ? applyPhotoTransform(fitRects(values.photoImage, local, photoPer.fit), values.photoImage, values.photoTransform)
            : fitRects(values.photoImage, local, photoPer.fit);
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
            // HER CROP, as it was actually applied (already clamped) — or null
            // where the template does not offer one.
            transform: r.transform || null,
            // WHICH silhouette actually cut it — her pick when she made one,
            // the template's default otherwise. Reported, never assumed.
            mask: values.maskShapeId || maskId,
            scrim: scrimRow ? { colour: scrimRow.colour, opacity: scrimRow.opacity } : null,
          };
        }
      } else {
        const r = adjustable
          ? applyPhotoTransform(fitRects(values.photoImage, box, photoPer.fit), values.photoImage, values.photoTransform)
          : fitRects(values.photoImage, box, photoPer.fit);
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
          box, fit: photoPer.fit, mask: null, transform: r.transform || null,
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

  /* ── 1b-ii. THE MOTIF — §9's "slot, not layer", at its narrowest ───────────
     A brand shape STAMPED into the field in the pair's own ink, at a declared
     box and a declared opacity, per dimension. It is painted HERE — after the
     photograph and its scrim, before one character of type — for one reason
     that is not cosmetic: the backdrop check below samples the pixels that are
     really under the ink, so a watermark that sits beneath the words has to be
     on the canvas before they are measured. Paint it after the text and the
     check would be measuring a field that no longer exists (M4).

     WHAT IS *NOT* HERE, and cannot be: no treatment mode, no art-class
     detection, no ink-sensitivity, no structure order, no obstacle set, no
     drag. §9 retires every one of those, and none of them has a name in the
     contract to arrive under. The whole of this is: contain the silhouette at
     its true proportions, key it to the ink, and lay it in at the declared
     alpha.

     A DECLARED MOTIF THAT DID NOT ARRIVE IS A REFUSAL, not a quiet omission —
     the same rule the mask already follows. Painting the design without it
     would be a different design wearing this template's name (M3), so the core
     reports the missing asset and the surface blocks the export. */
  const motifPer = slotConstraint(template, 'motif', dimensionId, state);
  const motifAsset = template.slots?.motif?.asset || null;
  if (motifPer && motifAsset) {
    if (!values.motifImage) {
      truth.missingAssets.push('motif');
    } else {
      const box = pxBox(motifPer.box, w, h);
      // The SAME stamp the mask cuts with: contained at the asset's own ratio
      // (never stretched) and alpha-saturated, so a shape authored at partial
      // fill-opacity on disk still keys cleanly to the ink.
      const stamp = maskStamp(ctx, values.motifImage, box, options);
      if (!stamp) {
        truth.missingAssets.push('scratch-surface');
      } else {
        const sx = stamp.getContext('2d');
        sx.globalCompositeOperation = 'source-in';
        sx.fillStyle = ink;
        sx.fillRect(0, 0, box.w, box.h);
        sx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalAlpha = motifPer.opacity;
        ctx.drawImage(stamp, box.x, box.y, box.w, box.h);
        ctx.restore();
        truth.motif = { box, asset: motifAsset, opacity: motifPer.opacity, colour: ink };
      }
    }
  }

  // ── 1c. Geometry for every ink, resolved BEFORE anything is painted, so the
  //       backdrop can be measured under each one while it is still bare.
  const textBoxes = [];
  for (const slotName of template.paintOrder || TEXT_SLOTS) {
    if (!TEXT_SLOTS.includes(slotName)) continue;
    const per = slotConstraint(template, slotName, dimensionId, state);
    if (!per || !template.registers?.[slotName]) continue;
    textBoxes.push({ slotName, per, box: pxBox(per.box, w, h) });
  }
  const logoSlot = slotConstraint(template, 'logo', dimensionId, state);
  const placedLogo = logoSlot && values.logoImage ? logoRect(template, logoSlot, values, w, h) : null;

  /* ── 1c-ii. THE MARK PLATE (client ruling 2026-08-20 — template three) ────
     Template three is the first to put the brand mark ON an unknown
     photograph, and the library sweep that forced
     (scripts/tools/scan-mark-on-photo.mjs) says it cannot be done bare: the
     mark fails its 3.0 floor on 58% of photo/dimension combinations at scrim 0,
     and the lowest wash that clears the whole library takes 64-74% of the
     picture. So a template may DECLARE a plate behind the mark.

     IT IS NOT A GUARD, AND THE DIFFERENCE IS THE WHOLE POINT. Law 3 retired
     auto-backings (b30fc8e) — backings a checker FABRICATED at runtime when a
     measurement came back bad. This one is painted on EVERY render, in the same
     place, at the same opacity, whether the photograph needed it or not; it
     never reads a measurement and there is no code path in which it does not
     appear. It is a drawn element the designer put there, exactly like the
     photo scrim under it.

     PAINTED HERE, before 1d, ON PURPOSE: the backdrop check must sample what is
     really under the mark. A plate painted after the check would be the render
     claiming a verdict about pixels it then replaced (M4). */
  const plate = template.slots?.logo?.plate || null;
  if (placedLogo && plate) {
    const row = pair?.id ? plate.fill?.[pair.id] : null;
    if (row) {
      const padPx = (plate.pad ?? 0) * placedLogo.w;
      const px = placedLogo.x - padPx;
      const py = placedLogo.y - padPx;
      const pw = placedLogo.w + padPx * 2;
      const ph = placedLogo.h + padPx * 2;
      const r = (plate.radius ?? 0) * Math.min(pw, ph);
      ctx.save();
      ctx.globalAlpha = row.opacity;
      ctx.fillStyle = row.colour;
      ctx.beginPath();
      // roundRect is the honest shape; a context that does not have it (a test
      // double) gets the square corner rather than a thrown render.
      if (r > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(px, py, pw, ph, r);
      else ctx.rect(px, py, pw, ph);
      ctx.fill();
      ctx.restore();
      truth.logoPlate = { box: { x: px, y: py, w: pw, h: ph }, radius: r, colour: row.colour, opacity: row.opacity };
    }
  }

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
    const ceilingPx = Number.isFinite(reg.ceilingScale) ? floorPx * reg.ceilingScale : Infinity;

    let fit;
    if (reg.caps) {
      fit = autofitTrackedCaps(ctx, {
        text, font: family, weight: reg.weight, tracking: reg.tracking ?? 0.08,
        box, maxLines: per.maxLines, floorPx, lineRatio: reg.lineRatio, ceilingPx,
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
      fit = autofit(ctx, { text, fontFor, box, maxLines: per.maxLines, floorPx, lineRatio: reg.lineRatio, ceilingPx });
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
    const per = slotConstraint(template, slotName, dimensionId, state);
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
