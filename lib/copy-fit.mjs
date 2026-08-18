/* ─────────────────────────────────────────────────────────────────────────
   COPY FIT — the deterministic "make this fit the budget" trim.

   docs/template-system-spec.md §8.1 requirement 1: one-click improve "must write
   within the slot's charBudget. Otherwise it hands back copy that does not fit
   and re-opens overflow through the front door."

   This is the SAME algorithm as `fitCopy` in app/api/assistant/route.js — a
   sentence boundary inside budget when one sits past halfway, else the last
   whole word, then back off dangling function words so the cut never lands on a
   stump ("…a week of creativity and"). No ellipsis: a fresh design reads
   cleanest without one.

   MIRRORED SURFACE (operating-manual §4 / trap M6): three copies of this trim now
   exist — here, the assistant route, and `fitCopyClient` in Generator.jsx.
   scripts/tests/copy-fit.test.mjs text-asserts the assistant route's copy still
   agrees with this one and FAILS CLOSED on drift. Consolidating the other two
   onto this module is a follow-up, deliberately not done in this change because
   it would touch the admin render path.
   ───────────────────────────────────────────────────────────────────────── */

const DANGLES = /\b(?:and|or|but|nor|yet|so|for|of|to|in|on|at|by|as|with|from|into|the|a|an|our|your|their|its|his|her|is|are|was|were|be|been)\s*$/i;

/** Trims `s` to at most `max` characters on an honest boundary. */
export function fitCopy(s, max) {
  const t = String(s || '').trim();
  if (!Number.isFinite(max) || t.length <= max) return t;
  const window = t.slice(0, max + 1);
  const sent = window.match(/^[\s\S]*[.!?](\s|$)/);
  if (sent && sent[0].trim().length >= max * 0.5) return sent[0].trim();
  let cut = t.slice(0, max).replace(/\s+\S*$/, '').trim();
  let guard = 0;
  while (guard++ < 24 && DANGLES.test(cut)) {
    const next = cut.replace(DANGLES, '').replace(/[\s,;:–—-]+$/, '').trim();
    if (!next || next === cut) break;
    cut = next;
  }
  return cut || t.slice(0, max).trim();
}

/**
 * The budgets a template declares for its text slots — §8.1's "computeCopyBudgets
 * already exists for this", now read straight off the baked template instead of
 * recomputed per render (§10B: budget measurement moves to authoring time).
 */
export function templateCopyBudgets(template) {
  const out = {};
  for (const [name, slot] of Object.entries(template?.slots || {})) {
    if (slot?.present && Number.isInteger(slot.charBudget)) out[name] = slot.charBudget;
  }
  return out;
}
