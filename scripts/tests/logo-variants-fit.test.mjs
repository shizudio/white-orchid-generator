/* Every sanctioned mark must FIT its corner, in every template and dimension.
   The mark is sized by height (client ruling 2026-09-14), so a wide lockup
   needs proportionally more width — this is the guard that keeps the offered
   list honest, rather than shipping a mark that cannot be placed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SANCTIONED_LOGO_ASSETS } from '../../lib/templates/logo-selection.mjs';
import { logoVariantById } from '../../lib/templates/logo-assets.mjs';
import { DIMENSIONS } from '../../lib/templates/template-contract.mjs';
import { TEMPLATE_CAPTION_BAND, TEMPLATE_LABEL_HEADLINE, TEMPLATE_PETAL_WINDOW } from '../../lib/templates/index.mjs';

const TEMPLATES = [TEMPLATE_CAPTION_BAND, TEMPLATE_LABEL_HEADLINE, TEMPLATE_PETAL_WINDOW];

/** The asset's own aspect, read off the shipped SVG — no guessing. */
function aspectOf(id) {
  const v = logoVariantById(id);
  assert.ok(v, `${id}: the brand has no such asset`);
  const svg = readFileSync(`public${v.src}`, 'utf8');
  const vb = (svg.match(/viewBox=["']([^"']+)["']/) || [])[1];
  assert.ok(vb, `${id}: the asset declares no viewBox, so it cannot be sized`);
  const [, , w, h] = vb.trim().split(/[\s,]+/).map(Number);
  return w / h;
}

test('every sanctioned mark fits its corner in every template and dimension', () => {
  for (const tpl of TEMPLATES) {
    const slot = tpl.slots.logo;
    if (!slot) continue;
    for (const dimId of Object.keys(DIMENSIONS)) {
      const d = slot.dimensions[dimId];
      if (!d || !d.present) continue;
      const heightFrac = d.heightFrac ?? (d.widthFrac ?? 0.12) * 0.87;
      const pad = d.pad ?? 0.05;
      // The column the mark may occupy: its declared box, or the frame less its margins.
      const room = d.box ? d.box.w : 1 - 2 * pad;
      for (const id of SANCTIONED_LOGO_ASSETS) {
        const width = heightFrac * aspectOf(id);
        assert.ok(width <= room + 1e-9,
          `${tpl.id}/${dimId}/${id}: needs ${width.toFixed(3)} of the width at a readable height, but the column is ${room.toFixed(3)}`);
      }
    }
  }
});
