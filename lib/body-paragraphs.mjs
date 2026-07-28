// Body paragraph sectioning — the pure layout half of Amendment 2026-07-27 ruling 3
// (docs/text-unification-spec.md): "Body is NOT repeatable — the single Body element
// supports internal sectioning: multi-paragraph text (line breaks with proper
// paragraph spacing) and a paragraph-flow affordance (stacked vertically or
// side-by-side) within the one element."
//
// This module owns the geometry decisions only — how paragraphs split, how a flow
// mode arranges them, and what box they need — so the canvas painters (the added-
// element body painter and the migrated support-slot painter in Generator.jsx) and
// the unit suite share one set of numbers. The caller supplies `wrap(text, maxWidth)`
// (its own measured word-wrap, e.g. Generator's textLines) so no canvas context is
// needed here. Pure (no React, no DOM, no brand literals).

// Paragraph spacing, as a fraction of the line height: the visible "this is a new
// paragraph" gap the ruling asks for ("proper paragraph spacing, not collapsed").
export const PARAGRAPH_GAP_RATIO = 0.6;
// Column gutter for the side-by-side flow, as a fraction of the font size.
export const COLUMN_GUTTER_RATIO = 1.2;
// A column narrower than this many px cannot hold readable words — the layout
// degrades to fewer columns rather than unreadable slivers.
export const MIN_COLUMN_PX = 56;

/** Split element text into paragraphs on line breaks. Blank-only chunks drop. */
export function splitParagraphs(text) {
  return String(text ?? "").split(/\n+/).map(part => part.trim()).filter(Boolean);
}

/**
 * Lay out paragraphs in the chosen flow inside a max width.
 *   paragraphs — string[] (from splitParagraphs)
 *   flow       — "stacked" | "columns" (unknown → stacked)
 *   maxWidth   — the box/column budget in px
 *   fontSize   — px; lineHeight — px per line
 *   wrap(text, width) — caller's measured word-wrap → string[] lines
 *   measureLine(line) — caller's measured line width in px (optional; stacked
 *                       width tightening only — omit to report maxWidth)
 * Returns { flow, width, height, blocks:[{ lines, x, y, width }] } with x/y as
 * offsets from the element's top-left; the painter adds its own origin.
 */
export function layoutParagraphFlow({ paragraphs, flow, maxWidth, fontSize, lineHeight, wrap, measureLine }) {
  const paras = Array.isArray(paragraphs) ? paragraphs.filter(Boolean) : [];
  const mode = flow === "columns" ? "columns" : "stacked";
  if (!paras.length || typeof wrap !== "function") {
    return { flow: mode, width: 0, height: 0, blocks: [] };
  }
  if (mode === "columns" && paras.length > 1) {
    // Side by side: N equal columns split the width. If the width cannot hold a
    // readable column per paragraph, drop to the widest count that fits (≥1 —
    // which degrades to stacked-equivalent single column geometry).
    const gutter = fontSize * COLUMN_GUTTER_RATIO;
    let count = paras.length;
    while (count > 1 && (maxWidth - gutter * (count - 1)) / count < MIN_COLUMN_PX) count--;
    if (count > 1) {
      const columnWidth = (maxWidth - gutter * (count - 1)) / count;
      const blocks = paras.map((para, index) => {
        const column = Math.min(index, count - 1);
        return { lines: wrap(para, columnWidth), x: column * (columnWidth + gutter), y: 0, width: columnWidth };
      });
      const height = Math.max(...blocks.map(block => block.lines.length * lineHeight));
      return { flow: "columns", width: maxWidth, height, blocks };
    }
  }
  // Stacked (the default): paragraphs run down the box with a paragraph gap that
  // reads as a break, not merely the next line.
  const gap = lineHeight * PARAGRAPH_GAP_RATIO;
  let y = 0;
  let width = 0;
  const blocks = paras.map((para, index) => {
    if (index) y += gap;
    const lines = wrap(para, maxWidth);
    const block = { lines, x: 0, y, width: maxWidth };
    y += lines.length * lineHeight;
    if (typeof measureLine === "function") {
      for (const line of lines) width = Math.max(width, Math.min(maxWidth, measureLine(line)));
    }
    return block;
  });
  return { flow: "stacked", width: typeof measureLine === "function" ? width : maxWidth, height: y, blocks };
}
