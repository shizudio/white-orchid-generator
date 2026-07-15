import test from "node:test";
import assert from "node:assert/strict";
import { detectBandRemoval, reconcileEditorLayoutClaim } from "../../lib/assistant-intents.js";

// ── BUG B · legibility-band removal intent (client ruling 2026-07-16: auto-promote
// to a genuine band-free LAYOUT, not a backdropMode toggle) ──────────────────────
// The client's exact failing ask, on a full-bleed photo (backdropMode auto → a band
// is showing), headline-only. It must be RECOGNISED as a band-removal and resolve to
// a real band-free archetype switch.
test("detectBandRemoval on a full-bleed photo (headline only) picks a band-free target archetype", () => {
  const ds = { archetypeId: "documentary", backdropMode: "auto", hasImage: true, headline: "Welcome Back to School" };
  const r = detectBandRemoval("remove the text band", ds);
  assert.ok(r, "should recognise the band-removal ask");
  assert.equal(r.present, true, "a band is on (backdropMode auto, full-bleed) → there is something to remove");
  assert.ok(r.targetArchetype, "a band-free layout must be picked for headline-only copy");
  assert.notEqual(r.targetArchetype, "documentary", "the target must differ from the current archetype");
  assert.ok(["editorial_split", "shape_cutout", "portrait_credential"].includes(r.targetArchetype),
    "the target must be one of the live-verified band-free archetypes");
});

test("detectBandRemoval fires on a bare 'remove the band' on a full-bleed photo (only the scrim can be meant)", () => {
  const r = detectBandRemoval("remove the band", { archetypeId: "full_bleed_duotone", backdropMode: "auto", headline: "Open House" });
  assert.ok(r, "on a full-bleed photo the only band IS the legibility scrim");
  assert.ok(r.targetArchetype, "should resolve a band-free target");
});

test("detectBandRemoval prefers shape_cutout when secondary copy (subtext) is present — editorial_split/portrait_credential are the documented drop risk", () => {
  const ds = { archetypeId: "documentary", backdropMode: "auto", headline: "Welcome Back to School", subtext: "Term begins Monday" };
  const r = detectBandRemoval("remove the text band", ds);
  assert.equal(r.targetArchetype, "shape_cutout", "shape_cutout is NOT in HEADLINE_LED_LONG_CAPTION_DROPS — the safe choice with a subtext present");
});

test("detectBandRemoval never picks floated_card (live-verified real overlap risk on Story + subtext)", () => {
  const ds = { archetypeId: "documentary", backdropMode: "auto", headline: "Welcome Back", subtext: "Term begins Monday" };
  const r = detectBandRemoval("remove the text band", ds);
  assert.notEqual(r.targetArchetype, "floated_card");
});

test("detectBandRemoval falls back to the honest tradeoff (band off, no layout switch) when copy is too long for any band-free target — never silently drops content", () => {
  const longCopy = {
    archetypeId: "documentary", backdropMode: "auto",
    headline: "An Extraordinarily Long Headline That Goes Well Beyond Any Reasonable Character Budget For A Hero Role",
    subtext: "A similarly long supporting line that also pushes well past any reasonable per-role budget for a caption",
  };
  const r = detectBandRemoval("remove the text band", longCopy);
  assert.ok(r, "still recognised as a band-removal ask");
  assert.equal(r.present, true, "a band is genuinely active here");
  assert.equal(r.targetArchetype, null, "no candidate fits this copy → the belt must decline the switch, not force an overflow");
});

test("detectBandRemoval reports no band to remove when already shadow-only (backdropMode:none)", () => {
  const r = detectBandRemoval("get rid of the strip behind the text", { archetypeId: "documentary", backdropMode: "none" });
  assert.ok(r, "still a band-removal ask");
  assert.equal(r.present, false, "no band to remove → an honest 'already' reply, no fabricated change");
  assert.equal(r.targetArchetype, undefined);
});

test("detectBandRemoval reports no band to remove when the design is already on a band-free archetype", () => {
  const r = detectBandRemoval("remove the band behind the text", { archetypeId: "editorial_split", backdropMode: "auto" });
  assert.ok(r, "still a band-removal ask (named 'behind the text')");
  assert.equal(r.present, false, "editorial_split is already band-free by construction — nothing to remove");
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

test("detectBandRemoval treats a legacy (no archetypeId) full-bleed photo design the same as documentary/full_bleed_duotone", () => {
  const r = detectBandRemoval("remove the text band", { archetypeId: null, hasImage: true, backdropMode: "auto", headline: "Open House" });
  assert.ok(r);
  assert.equal(r.present, true);
  assert.ok(r.targetArchetype);
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
