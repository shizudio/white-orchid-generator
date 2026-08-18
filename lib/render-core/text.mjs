/* ─────────────────────────────────────────────────────────────────────────
   RENDER-CORE TEXT PRIMITIVES — the painting half of §4 ("template + values →
   canvas. No solving.").

   These are the MINIMAL painting primitives lifted out of the admin renderer:
   the hard-break-aware greedy wrap (Generator.jsx `textLines`), the
   shrink-to-fit loop (`fitText`), and the tracked-caps micro-label painter
   (`drawMicroLabel`). Nothing here selects an archetype, solves a placement,
   de-collides, degrades, clamps capacity, or audits. Every freedom the admin
   renderer negotiates at runtime is already fixed by the template.

   Canvas is a MEASUREMENT ADAPTER: every function takes a 2D context and only
   ever calls measureText / fillText on it.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Hard-break-aware greedy word wrap (Generator.jsx `textLines` semantics).
 * §7.2: Enter inserts a REAL hard break — the text is split on newlines FIRST,
 * then each segment is word-wrapped independently, so a line turns exactly
 * where the writer pressed Enter and still wraps on width beyond that.
 * Blank segments (a double-Enter) collapse — an empty painted line spends
 * vertical budget for no visible gain.
 * Caller must have set ctx.font.
 */
export function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const segment of String(text ?? '').split(/\r?\n/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * AUTOFIT (§7). "Type autofits: short copy renders large and dramatic, longer
 * copy renders smaller, DOWN TO A FLOOR." The box never changes size; the user
 * never sets size.
 *
 * Deterministic: starts at the largest size the box could hold as a single line
 * and steps down by 1px until the wrap satisfies BOTH the line-count cap and
 * the box height, or the floor is reached.
 *
 * @returns {{size:number, lines:string[], lineHeight:number, atFloor:boolean,
 *            overBudget:boolean, wrappedLines:number}}
 *   `overBudget` is the §7.2 second check: at the FLOOR the copy still wraps to
 *   more lines than the box declares. A character count alone cannot see a hard
 *   break, so this is measured, not counted.
 */
export function autofit(ctx, { text, fontFor, box, maxLines, floorPx, lineRatio }) {
  const empty = { size: floorPx, lines: [], lineHeight: floorPx * lineRatio, atFloor: true, overBudget: false, wrappedLines: 0 };
  if (!String(text ?? '').trim()) return empty;

  const ceiling = Math.max(Math.floor(floorPx), Math.floor(box.h / lineRatio));
  let size = ceiling;
  let lines = [];
  const floor = Math.max(1, Math.floor(floorPx));

  while (size >= floor) {
    ctx.font = fontFor(size);
    lines = wrapLines(ctx, text, box.w);
    if (lines.length <= maxLines && lines.length * size * lineRatio <= box.h) break;
    size -= 1;
  }
  if (size < floor) {
    size = floor;
    ctx.font = fontFor(size);
    lines = wrapLines(ctx, text, box.w);
  }
  const wrappedLines = lines.length;
  // The box is fixed at maxLines: never paint past it. Painting the overflow is
  // what produced unclipped spill in the old engine; the honest response is the
  // over-budget state, which blocks export for the affected dimension (§7.2).
  const overBudget = wrappedLines > maxLines;
  return {
    size,
    lines: overBudget ? lines.slice(0, maxLines) : lines,
    lineHeight: size * lineRatio,
    atFloor: size <= floor,
    overBudget,
    wrappedLines,
  };
}

/** Paints already-fitted lines from the box's top-left. Returns the used height. */
export function paintLines(ctx, { lines, box, size, lineHeight, align = 'left', fontFor, fill }) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.font = fontFor(size);
  const tx = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
  // First baseline sits one em below the box top — the same convention the admin
  // eyebrow painter uses (fillText at y + size), so a box top is a true top edge.
  lines.forEach((line, i) => ctx.fillText(line, tx, box.y + size + i * lineHeight));
  ctx.restore();
  return lines.length * lineHeight;
}

/**
 * TRACKED ALL-CAPS micro-label (Generator.jsx `drawMicroLabel` semantics):
 * uppercased, letter-spaced by `tracking` em (+0.01 for the optical caps
 * correction), drawn at y + size. Measurement-consistent with the paint.
 */
export function trackedCapsWidth(ctx, text, { size, font, weight = 400, tracking = 0.08 }) {
  const txt = String(text ?? '').toUpperCase();
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${(tracking + 0.01) * size}px`;
  const w = ctx.measureText(txt).width + tracking * size * Math.max(0, txt.length - 1);
  ctx.letterSpacing = '0px';
  ctx.restore();
  return w;
}

/**
 * Autofit for the tracked-caps register. Same contract as `autofit` but every
 * measurement runs through the tracked width so the fit matches the paint.
 */
export function autofitTrackedCaps(ctx, { text, font, weight, tracking, box, maxLines, floorPx, lineRatio }) {
  const upper = String(text ?? '').toUpperCase();
  const fontFor = (size) => `${weight} ${size}px ${font}`;
  const empty = { size: floorPx, lines: [], lineHeight: floorPx * lineRatio, atFloor: true, overBudget: false, wrappedLines: 0 };
  if (!upper.trim()) return empty;

  const ceiling = Math.max(Math.floor(floorPx), Math.floor(box.h / lineRatio));
  const floor = Math.max(1, Math.floor(floorPx));
  let size = ceiling;
  let lines = [];
  const wrapTracked = (sz) => {
    const out = [];
    for (const segment of upper.split(/\r?\n/)) {
      const words = segment.trim().split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (line && trackedCapsWidth(ctx, test, { size: sz, font, weight, tracking }) > box.w) { out.push(line); line = word; }
        else line = test;
      }
      if (line) out.push(line);
    }
    return out;
  };
  while (size >= floor) {
    lines = wrapTracked(size);
    if (lines.length <= maxLines && lines.length * size * lineRatio <= box.h) break;
    size -= 1;
  }
  if (size < floor) { size = floor; lines = wrapTracked(size); }
  const wrappedLines = lines.length;
  const overBudget = wrappedLines > maxLines;
  return {
    size, lines: overBudget ? lines.slice(0, maxLines) : lines,
    lineHeight: size * lineRatio, atFloor: size <= floor, overBudget, wrappedLines,
  };
}

/** Paints tracked all-caps lines. Returns the used height. */
export function paintTrackedCaps(ctx, { lines, box, size, lineHeight, font, weight, tracking, align = 'left', fill }) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${(tracking + 0.01) * size}px`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const tx = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
  lines.forEach((line, i) => ctx.fillText(line, tx, box.y + size + i * lineHeight));
  ctx.letterSpacing = '0px';
  ctx.restore();
  return lines.length * lineHeight;
}
