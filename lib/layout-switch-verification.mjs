// Layout-switch verification — the solver-verified candidate contract.
//
// (docs/text-elements-spec.md §4 remedy 3, ratified: "Switch to a roomier layout
// (solver-verified candidate only — never offered blind)"; operating-manual M2/M4.)
// Every surface that OFFERS a layout switch — the "Try another layout" chip belt,
// the chat dead-role / logo pendingOffers, the crowding advisory's roomier remedy —
// must offer only a candidate that VERIFIABLY (a) differs from the current render and
// (b) places the design's ACTUAL content: the required heading always paints, nothing
// currently painted goes dead, no placed element is lost. When no candidate qualifies
// the surface says so honestly (complete-or-absent for offers) instead of switching
// blind.
//
// This module is the PURE half: qualification predicates + candidate-walk order over
// render-truth SUMMARIES. The impure half (offscreen renderScene evaluation, the
// firstShotGate scoreCandidate pattern) lives in hooks/useLayoutSwitchVerification.js
// and injects `evaluate(archetypeId) → summary`. No DOM, no React, no brand facts.
//
// A candidate summary (built from one offscreen captureAudit render):
//   {
//     archetypeId,                 // the evaluated archetype
//     renderHash,                  // pixel hash of the offscreen render (null = unknown)
//     heroPainted,                 // the heading painted (fontPx > 0, not dropped)
//     logoPainted,                 // a logo box was drawn
//     fontPx: { headline, subtext, date },   // painted sizes (0 = not painted)
//     droppedFields: [field...],   // content-bearing fields the reflow shed (resolveDroppedContent)
//     blockers,                    // fail-severity blocker findings (firstShotGate id set)
//     placedUids / unplacedUids,   // added-element placement ledger (elementProbe render)
//     whitespaceTarget,            // the archetype's whitespace target (density budget input)
//   }
// The CURRENT design's summary additionally carries `heroExpected` (the design has
// heading copy, so law #57 requires the candidate to paint it).

import { dynamicElementBudget } from "./audit-local.js";

// The chat belt's suited variety rings (moved here from app/api/assistant/route.js so
// the server belt, the client verifier and the distinctness guard share ONE source —
// a ring edit lands everywhere or nowhere). Order is the rotation order; next-after-
// current guarantees repeated asks cycle through every suited composition.
export const LAYOUT_VARIETY_RINGS = Object.freeze({
  photo: Object.freeze(["documentary", "editorial_split", "shape_cutout", "message_pill", "full_bleed_duotone", "floated_card", "portrait_credential"]),
  text: Object.freeze(["manifesto", "quote_margin", "label_headline", "serif_word", "big_number", "motif_field"]),
});

export function layoutVarietyRing(hasImage) {
  return [...(hasImage ? LAYOUT_VARIETY_RINGS.photo : LAYOUT_VARIETY_RINGS.text)];
}

// The honest no-candidate line (M2: an offer surface that cannot execute says so —
// never a blind switch, never a silent no-op). One voice for chip/belt replies.
export const NO_LAYOUT_SWITCH_REPLY =
  "I tried the other layouts against your content just now — none of them can hold everything without losing something, so I kept this one. Trimming the body text or removing an element will open up more layouts.";

// Rotation order: every ring entry after the current archetype, wrapping, current
// excluded. An id not in the ring starts from the ring head (indexOf −1 + 1 → 0).
export function rotationOrderAfter(ring, currentId) {
  const list = Array.isArray(ring) ? ring.filter(id => typeof id === "string" && id) : [];
  if (!list.length) return [];
  const start = list.indexOf(currentId) + 1;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const id = list[(start + i) % list.length];
    if (id !== currentId && !out.includes(id)) out.push(id);
  }
  return out;
}

const arr = value => (Array.isArray(value) ? value : []);
const num = value => (Number.isFinite(value) ? value : 0);

/* The qualification predicate (render-truth, both directions of the law):
   (a) DIFFERS — a different archetypeId AND the pixels actually changed (equal
       hashes = the same-blob collapse; unknown hashes pass — archetype identity plus
       the distinctness guard carry the difference claim).
   (b) PLACES THE CONTENT — the required heading paints (law #57) whenever the design
       carries heading copy; no content-bearing field painted today is shed by the
       candidate; no added element placed today goes unplaced; no NEW blocker-class
       findings appear. Returns { ok, reasons[] } — reasons are machine-checkable
       evidence for reports/tests, never user copy. */
export function qualifyLayoutCandidate(current, candidate) {
  const reasons = [];
  if (!current || !candidate) return { ok: false, reasons: ["missing-summary"] };
  if (candidate.archetypeId === current.archetypeId) reasons.push("same-archetype");
  if (current.renderHash && candidate.renderHash && current.renderHash === candidate.renderHash) {
    reasons.push("identical-render");
  }
  if (current.heroExpected && !candidate.heroPainted) reasons.push("heading-lost");
  const currentDropped = new Set(arr(current.droppedFields));
  for (const field of arr(candidate.droppedFields)) {
    if (!currentDropped.has(field)) { reasons.push(`drops-content:${field}`); break; }
  }
  const currentPlaced = new Set(arr(current.placedUids));
  for (const uid of arr(candidate.unplacedUids)) {
    if (currentPlaced.has(uid)) { reasons.push(`element-lost:${uid}`); break; }
  }
  if (num(candidate.blockers) > num(current.blockers)) reasons.push("adds-blockers");
  return { ok: reasons.length === 0, reasons };
}

/* What a qualifying switch would IMPROVE — the "roomier" evidence. Pure comparison of
   the two summaries; the crowding advisory / over-capacity / unplaced-element findings
   each require the gain that answers THEIR need before attaching the remedy (a switch
   that only helps crowding is never sold as fixing an over-long headline). Roles in
   growsRoles use the audit's role names (hero/support/date). */
export function layoutSwitchGains(current, candidate) {
  const placedAfter = new Set(arr(candidate && candidate.placedUids));
  const placesElements = arr(current && current.unplacedUids).filter(uid => placedAfter.has(uid));
  const droppedAfter = new Set(arr(candidate && candidate.droppedFields));
  const restoresFields = arr(current && current.droppedFields).filter(field => !droppedAfter.has(field));
  const growsRoles = [];
  const px = key => num(((candidate || {}).fontPx || {})[key]);
  const pxNow = key => num(((current || {}).fontPx || {})[key]);
  if (pxNow("headline") > 0 && px("headline") > pxNow("headline") + 0.5) growsRoles.push("hero");
  if (pxNow("subtext") > 0 && px("subtext") > pxNow("subtext") + 0.5) growsRoles.push("support");
  if (pxNow("date") > 0 && px("date") > pxNow("date") + 0.5) growsRoles.push("date");
  const budgetGrows = dynamicElementBudget(candidate ? candidate.whitespaceTarget : null)
    > dynamicElementBudget(current ? current.whitespaceTarget : null);
  return {
    placesElements,
    restoresFields,
    growsRoles,
    budgetGrows,
    any: !!(placesElements.length || restoresFields.length || growsRoles.length || budgetGrows),
  };
}

/* Walk candidates (preferred seeds first, then the ring in rotation order after the
   current archetype) and return the FIRST solver-verified one — or null, honestly,
   when none qualifies. `evaluate(id)` is the injected impure half (one offscreen
   render); a null/throwing evaluation skips the candidate (fail closed: an
   unverifiable candidate is never offered). `require(candidate, gains)` optionally
   narrows further (e.g. the roomier remedies demand a need-matching gain). */
export function pickVerifiedLayoutCandidate({ current, ring, evaluate, preferred = [], require = null } = {}) {
  if (!current || typeof evaluate !== "function") return null;
  const order = [];
  for (const id of [...arr(preferred), ...rotationOrderAfter(ring, current.archetypeId)]) {
    if (typeof id === "string" && id && id !== current.archetypeId && !order.includes(id)) order.push(id);
  }
  for (const id of order) {
    let candidate = null;
    try { candidate = evaluate(id); } catch { candidate = null; }
    if (!candidate) continue;
    if (!qualifyLayoutCandidate(current, candidate).ok) continue;
    const gains = layoutSwitchGains(current, candidate);
    if (typeof require === "function" && !require(candidate, gains)) continue;
    return { archetypeId: id, evaluation: candidate, gains };
  }
  return null;
}

/* Which findings make the deferred roomier verification worth running (born-clean:
   a fresh design has none of these, so the verifier never runs and costs nothing).
   Returns the need set or null. Pure — the hook reads the live findings ledger. */
export function roomierNeedsFromFindings(findings) {
  const needs = { crowding: false, unplacedUids: [], overCapacityRoles: [], atFloor: false };
  for (const finding of arr(findings)) {
    if (!finding || !finding.id) continue;
    if (finding.id === "crowding-advisory") needs.crowding = true;
    else if (String(finding.id).startsWith("element-unplaced:") && finding.unplacedElement?.uid) {
      needs.unplacedUids.push(finding.unplacedElement.uid);
    } else if (finding.id === "copy-over-capacity") {
      needs.overCapacityRoles.push(finding.field === "headline" ? "hero" : "support");
    } else if (finding.id === "type-size-floor") needs.atFloor = true;
  }
  return (needs.crowding || needs.unplacedUids.length || needs.overCapacityRoles.length || needs.atFloor)
    ? needs
    : null;
}

/* The roomier remedies' require-clause: the candidate must answer at least one of the
   CURRENT needs — a higher density budget or a newly-placed element for crowding /
   unplaced, a larger painted size for over-capacity / at-floor copy. */
export function roomierGainMatchesNeeds(gains, needs) {
  if (!gains || !needs) return false;
  if ((needs.crowding || needs.unplacedUids.length) && (gains.budgetGrows || gains.placesElements.length)) return true;
  if (needs.unplacedUids.some(uid => gains.placesElements.includes(uid))) return true;
  if ((needs.overCapacityRoles.length || needs.atFloor) && gains.growsRoles.length) return true;
  if (gains.restoresFields.length) return true;
  return false;
}
