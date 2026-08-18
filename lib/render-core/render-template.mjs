/* ─────────────────────────────────────────────────────────────────────────
   THE RENDER CORE — docs/template-system-spec.md §4.

     "Given a template and slot values, paint a canvas."

   HARD BOUNDARIES (what this file must never grow):
     · no archetype selection            · no placement solving
     · no per-format derive              · no capacity clamps
     · no advisor / audit                · no degradation ladder
     · no runtime contrast guard (colour pairs are pre-verified at bake time)
     · no user-facing size control       — autofit owns size completely (§7)

   Everything the admin renderer negotiates at runtime is already decided by the
   template, so this function is a painter with no opinions. The ONE measurement
   it reports back is the §7.2 over-budget signal (a hard break can push copy
   past maxLines while still under charBudget); the surface uses it to block
   export for the affected dimension.
   ───────────────────────────────────────────────────────────────────────── */

import { DEFAULT_FONTS } from '../brand-defaults.js';
import { DIMENSIONS, TEXT_SLOTS, slotConstraint } from '../templates/template-contract.mjs';
import { floorPxFor } from './floor.mjs';
import { autofit, autofitTrackedCaps, paintLines, paintTrackedCaps } from './text.mjs';

const FONT_ROLE = Object.freeze({ title: 'title', subtitle: 'subtitle', body: 'body', quote: 'quote', logo: 'logo' });

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
 *                              colourPairId, logoPosition, logoImage }
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
  };

  // ── 1. The field. A pre-verified pair; no runtime contrast guard (§10A).
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // ── 2. Text slots, in the template's declared paint order.
  for (const slotName of template.paintOrder || TEXT_SLOTS) {
    if (!TEXT_SLOTS.includes(slotName)) continue;
    const per = slotConstraint(template, slotName, dimensionId);
    if (!per) continue;
    const reg = template.registers?.[slotName];
    if (!reg) continue;

    const box = { x: per.box.x * w, y: per.box.y * h, w: per.box.w * w, h: per.box.h * h };
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

  // ── 3. Logo — a slot value (which corner), never a drag. Placement is the
  //      template's `allowedLogoPositions` ∩ the value; size is authored.
  const logoSlot = slotConstraint(template, 'logo', dimensionId);
  if (logoSlot && values.logoImage) {
    const allowed = template.allowedLogoPositions;
    const requested = values.logoPosition;
    const position = Array.isArray(allowed) && allowed.includes(requested) ? requested : (Array.isArray(allowed) ? allowed[0] : null);
    if (position) {
      const pad = (logoSlot.pad ?? 0.05) * w;
      const target = (logoSlot.widthFrac ?? 0.12) * w;
      const img = values.logoImage;
      const ratio = (img.naturalHeight || img.height || 1) / (img.naturalWidth || img.width || 1);
      const lw = target;
      const lh = target * ratio;
      const x = position.endsWith('left') ? pad
        : position.endsWith('center') ? (w - lw) / 2
        : w - pad - lw;
      const y = position.startsWith('top') ? pad : h - pad - lh;
      ctx.drawImage(img, x, y, lw, lh);
      truth.logoBox = { x, y, w: lw, h: lh, position };
    }
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
