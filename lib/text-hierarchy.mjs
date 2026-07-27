// Relational type hierarchy — the DLC §12 law "primary hierarchy remains visually
// dominant", made checkable.
//
// docs/text-unification-spec.md §Phase C (RATIFIED 2026-07-26, client ruling 5):
// "When we have multiple text elements on the canvas, you should be assigning
// different weights to them according to design principles and info hierarchy."
//
// Two halves, both pure:
//   · ASSIGNMENT — the class RANK the system uses when it chooses sizes itself.
//     The renderer's per-class base sizes already encode it; `classRank` is the
//     single declaration of the order so the painter and the checker cannot drift.
//   · VERIFICATION — a render-truth check that runs on every solve: given what
//     each text ACTUALLY painted, is a lower-rank class out-shouting a higher-rank
//     one? A user pin that inverts the ranking is RESPECTED (law 5 — the system
//     never reverts an explicit choice) and reported as one advisory naming the
//     inversion, with remedies.
//
// Pure (no React, no DOM, no brand literals).

/* Rank 1 is the loudest. `cta` chrome is deliberately outside the reading ranking:
   a pill is an opaque badge sized by its own chrome, not a voice in the type
   hierarchy, so it neither raises nor suffers an inversion. */
export const TEXT_CLASS_RANK = Object.freeze({
  heading: 1,
  subheading: 2,
  body: 3,
  caption: 4,
});

export const HIERARCHY_RULE_ID = "typography.hierarchy-inverted";

/** The rank of a class, or null when the class sits outside the reading ranking. */
export function classRank(className) {
  const rank = TEXT_CLASS_RANK[className];
  return Number.isFinite(rank) ? rank : null;
}

/* The comparable VISUAL WEIGHT of one painted text. Size leads — it is what a
   reader sees first — with the painted font weight as a fine tiebreak inside the
   same size, scaled small enough that it can never outvote a real size gap. */
export function visualWeight(entry) {
  const px = Number.isFinite(entry?.px) ? entry.px : 0;
  const weight = Number.isFinite(entry?.weight) ? entry.weight : 400;
  return px * (1 + (weight - 400) / 4000);
}

/* The tolerance band. Two texts within 2% of each other read as the same size, so
   a hair's difference is not an inversion — only a visible one is. */
const TIE_BAND = 0.02;

/**
 * Every hierarchy INVERSION among the painted texts: a pair where a lower-ranked
 * class paints visibly heavier than a higher-ranked one.
 *
 * `entries` are render truth — `{ id, class, px, weight, pinned }` — one per text
 * that actually painted. The law is "every heading out-ranks every body", so each
 * class competes with its QUIETEST specimen on the higher side and its LOUDEST on
 * the lower side: that catches a subheading pinned under a body, while five body
 * lines at the same size still yield exactly one pair (one voice, no noise).
 *
 * Returns `[{ higher, lower, higherWeight, lowerWeight, ratio }]`, worst pair first.
 */
export function hierarchyInversions(entries) {
  const byClass = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || classRank(entry.class) == null) continue;
    const weight = visualWeight(entry);
    if (!(weight > 0)) continue;
    const current = byClass.get(entry.class) || { quietest: null, loudest: null };
    if (!current.quietest || weight < current.quietest.weight) current.quietest = { ...entry, weight };
    if (!current.loudest || weight > current.loudest.weight) current.loudest = { ...entry, weight };
    byClass.set(entry.class, current);
  }
  const classes = [...byClass.keys()].sort((a, b) => classRank(a) - classRank(b));
  const out = [];
  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const higher = byClass.get(classes[i]).quietest;
      const lower = byClass.get(classes[j]).loudest;
      if (!higher || !lower) continue;
      const ratio = lower.weight / higher.weight;
      if (ratio <= 1 + TIE_BAND) continue;
      out.push({ higher, lower, higherWeight: higher.weight, lowerWeight: lower.weight, ratio });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

/** True when the painted texts respect the ranking (the law holds). */
export function hierarchyHolds(entries) {
  return hierarchyInversions(entries).length === 0;
}
