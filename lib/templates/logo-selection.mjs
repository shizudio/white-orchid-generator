/* ─────────────────────────────────────────────────────────────────────────
   THE SANCTIONED MARK SET — one list, shared by every template.

   (client ruling 2026-09-14) Shina asked for a single selection rather than a
   per-template one: staff should see the same picker wherever they are, and a
   change to the brand's offering should be one edit, not three.

   WHY THESE NINE AND NOT ALL FOURTEEN is measured, not taste. The mark is sized
   by HEIGHT (see logoRect in lib/render-core/render-template.mjs), so a lockup's
   aspect decides how much WIDTH it needs at a readable height:

     stacked p3      0.6:1  — narrowest
     square  s1/p4   1.15:1
     s2              1.42:1
     p1 / p-central  ~2.2:1 — the widest that still fits a corner column
     p2              7.9-8.9:1

   p2-green and p2-ivory are EXCLUDED, and that is geometry: at a height that
   keeps their wordmark legible they need ~92% of the frame width. They are a
   footer lockup, not a corner mark, and offering them would mean offering a
   mark that cannot be placed. p3f-green, p4 and p-bg are simply not asked for
   yet — adding them is a one-line change here and needs no layout work.

   Every id in this list is asserted to FIT, in every template and dimension, by
   scripts/tests/logo-variants-fit.test.mjs.
   ───────────────────────────────────────────────────────────────────────── */

export const SANCTIONED_LOGO_ASSETS = [
  // compact lockups
  's1-green', 's1-ivory',
  'p3-green', 'p3-ivory',
  'p-circle',
  // horizontal wordmarks (client ruling 2026-09-14)
  'p1-green', 'p1-ivory',
  'p-central',
  's2-green',
];
