import test from "node:test";
import assert from "node:assert/strict";
import { detectBandRemoval, reconcileEditorLayoutClaim } from "../../lib/assistant-intents.js";

// ── BUG B · legibility-band removal intent ───────────────────────────────────
// The client's exact failing ask, on a full-bleed photo (backdropMode auto → a band
// is showing). It must be RECOGNISED as a band-removal, with a band present to drop.
test("detectBandRemoval recognises 'remove the text band' on a full-bleed photo (band present)", () => {
  const ds = { archetypeId: "documentary", backdropMode: "auto" };
  const r = detectBandRemoval("remove the text band", ds);
  assert.ok(r, "should recognise the band-removal ask");
  assert.equal(r.present, true, "a band is on (backdropMode auto) → there is something to remove");
});

test("detectBandRemoval fires on a bare 'remove the band' on a full-bleed photo (only the scrim can be meant)", () => {
  const r = detectBandRemoval("remove the band", { archetypeId: "full_bleed_duotone", backdropMode: "auto" });
  assert.ok(r, "on a full-bleed photo the only band IS the legibility scrim");
});

test("detectBandRemoval reports the band already off (backdropMode:none) so the reply stays honest", () => {
  const r = detectBandRemoval("get rid of the strip behind the text", { archetypeId: "documentary", backdropMode: "none" });
  assert.ok(r, "still a band-removal ask");
  assert.equal(r.present, false, "no band to remove → an honest 'already' reply, no fabricated change");
});

test("detectBandRemoval does NOT hijack 'remove the green solid' on a split layout (that's the panel → full-image belt)", () => {
  const r = detectBandRemoval("remove the green solid", { archetypeId: "editorial_split", backdropMode: "auto" });
  assert.equal(r, null, "'solid' is not a scrim word → leave it to the panel-removal belt");
});

test("detectBandRemoval stays out of the ambiguous bare 'remove the band' on a split layout", () => {
  const r = detectBandRemoval("remove the band", { archetypeId: "editorial_split", backdropMode: "auto" });
  assert.equal(r, null, "not full-bleed and not named 'behind the text' → the full-image belt owns it");
});

test("detectBandRemoval ignores unrelated asks", () => {
  assert.equal(detectBandRemoval("make it warmer", { archetypeId: "documentary" }), null);
  assert.equal(detectBandRemoval("change the headline to Open House", { archetypeId: "documentary" }), null);
});

// ── BUG A · reply↔patch layout-claim reconcile ───────────────────────────────
// The specimen: the model narrates a layout switch, but the gated patch only tweaked
// copy (or was stripped) — no archetype change. The false claim must be rewritten to
// an honest line BEFORE it reaches the client (no two-bubble contradiction).
test("reconcileEditorLayoutClaim rewrites a false 'changed the layout' claim not backed by an archetype switch", () => {
  const ds = { archetypeId: "documentary" };
  const honest = reconcileEditorLayoutClaim(
    "Changed the layout so the photo fills the whole frame.",
    { headline: "Open House" },
    ds,
  );
  assert.ok(honest, "an unbacked layout claim must be rewritten");
  assert.match(honest, /couldn'?t/i, "the honest reply owns the miss (keeps the client's own honesty check from firing again)");
});

test("reconcileEditorLayoutClaim leaves a GENUINE layout switch alone", () => {
  const honest = reconcileEditorLayoutClaim(
    "Switched to a full-frame photo layout — the photo now fills the whole post.",
    { archetypeId: "documentary" },
    { archetypeId: "editorial_split" },
  );
  assert.equal(honest, null, "the claim is backed by a real archetype change → do not touch it");
});

test("reconcileEditorLayoutClaim ignores replies that make no layout claim", () => {
  assert.equal(reconcileEditorLayoutClaim("Updated the headline to “Open House”.", { headline: "Open House" }, {}), null);
});

test("reconcileEditorLayoutClaim ignores an already-honest inability reply", () => {
  const honest = reconcileEditorLayoutClaim(
    "I can't change the layout for that yet — try the ‘Try another layout’ chip.",
    {},
    { archetypeId: "documentary" },
  );
  assert.equal(honest, null, "an honest 'can't' reply is already coherent → no double-correction");
});

test("reconcileEditorLayoutClaim treats echoing the SAME archetype as no switch (still false)", () => {
  const honest = reconcileEditorLayoutClaim(
    "Changed the layout for you.",
    { archetypeId: "documentary" },
    { archetypeId: "documentary" },
  );
  assert.ok(honest, "patch.archetypeId equal to the current archetype is not a real switch");
});
