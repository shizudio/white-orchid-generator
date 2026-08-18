import test from "node:test";
import assert from "node:assert/strict";
import {
  isCtaCopy,
  detectMisroutedCtaCopy,
  routeCtaCopyToCtaHome,
  CTA_PILL_MAX,
  CTA_SOURCE_FIELDS,
} from "../../lib/assistant-intents.js";
import { TEXT_CLASS_RANK, classRank } from "../../lib/text-hierarchy.mjs";
import { GLOBAL_STEP_RESPONSE } from "../../lib/type-scale.mjs";

/* ── TASK #72 — CTA COPY MUST LAND IN THE CTA-CLASS HOME ─────────────────────
   Client repro (2026-08-18, landing brief "Term 4 enrolment reminder, register
   now at two.co"): the action line painted at nearly headline size, wrapping
   across three lines under the title. Mechanism: the landing plan had no CTA
   home to reach for, so the copy went into subtext/attribution — both feed
   `supportText` (components/Generator.jsx ~4344), painted at SUPPORT scale
   (`heroSize / heroToSupport`, lib/editorial-typography-solver.mjs ~279).
   The law: `cta` is pill/badge chrome and sits OUTSIDE the reading ranking
   (lib/text-hierarchy.mjs) — so a CTA never paints at support/headline scale. */

test("the client's exact line is recognised as a call to action", () => {
  assert.equal(isCtaCopy("Register now at two.co"), true);
});

test("CTA imperatives and bare URLs are calls to action", () => {
  for (const line of [
    "Register now at two.co",
    "Sign up today",
    "Sign-up today",
    "Visit two.co",
    "Enrol by 30 Nov",
    "Call 6123 4567",
    "Apply now",
    "Book a tour",
    "RSVP by Friday",
    "Learn more at two.co/terms",
    "two.co",
    "www.two.co/enrol",
    "Scan to register",
  ]) {
    assert.equal(isCtaCopy(line), true, `should be a CTA: ${line}`);
  }
});

test("ordinary reading copy is NOT a call to action (no false rehoming)", () => {
  for (const line of [
    "Term 4 begins 6 January",
    "A warm welcome back to every family",
    "White Orchid Learning",
    "Photography by Mei Lin",
    "Our new studio opens this term",
    // mentions an action mid-sentence, but it is a real support line
    "Places are limited this term so families usually register early with us",
    // a domain-looking word that is not a domain
    "Our co-teachers lead every session",
    "",
    "   ",
  ]) {
    assert.equal(isCtaCopy(line), false, `should NOT be a CTA: ${line}`);
  }
});

test("a long paragraph that happens to open with an action verb stays reading copy", () => {
  const long = "Register now to secure a place for your child in our Term 4 enrolment intake";
  assert.equal(isCtaCopy(long), false, "beyond the line bound → not a pill, leave it alone");
});

/* ── THE REPRO, AT THE ROUTING LEVEL ─────────────────────────────────────── */

test("REPRO: the client's plan shape routes the CTA out of subtext into pillText", () => {
  // The plan the model produced for "Term 4 enrolment reminder, register now at two.co".
  const patch = {
    archetypeId: "editorial_split",
    microLabel: "REMINDER",
    headline: "Term 4 Enrolment Is Open",
    subtext: "Register now at two.co",
    attribution: null,
    pillText: null,
  };
  const move = routeCtaCopyToCtaHome(patch);
  assert.deepEqual(move, { field: "subtext", text: "Register now at two.co", home: "pillText" });
  assert.equal(patch.pillText, "Register now at two.co", "the CTA now lives in the CTA-class home");
  assert.equal(patch.subtext, "", "explicit-empty sentinel — the copy is never painted twice");
  assert.equal(patch.headline, "Term 4 Enrolment Is Open", "the headline is untouched");
  assert.equal(patch.microLabel, "REMINDER", "the eyebrow is untouched");
});

test("the attribution fallback path is rescued too (supportText's second source)", () => {
  const patch = { headline: "Term 4 Enrolment Is Open", subtext: null, attribution: "Register now at two.co" };
  const move = routeCtaCopyToCtaHome(patch);
  assert.equal(move.field, "attribution");
  assert.equal(patch.pillText, "Register now at two.co");
  assert.equal(patch.attribution, "");
});

test("subtext is fixed before attribution when both carry copy", () => {
  assert.deepEqual([...CTA_SOURCE_FIELDS], ["subtext", "attribution"]);
  const patch = { subtext: "Register now at two.co", attribution: "White Orchid Learning" };
  routeCtaCopyToCtaHome(patch);
  assert.equal(patch.pillText, "Register now at two.co");
  assert.equal(patch.attribution, "White Orchid Learning", "a genuine sign-off is left alone");
});

test("a CTA line too long for the pill lands as a cta ELEMENT — still badge chrome, still badge scale", () => {
  const long = "Register at two.co/term-four-enrolment";
  assert.ok(long.length > CTA_PILL_MAX);
  const patch = { subtext: long };
  const move = routeCtaCopyToCtaHome(patch);
  assert.equal(move.home, "element");
  assert.deepEqual(patch.addTextElement, { class: "cta", text: long });
  assert.equal(patch.pillText, undefined, "the pill's 30-char grammar bound is never violated");
  assert.equal(patch.subtext, "");
});

test("law 5 — a CTA the plan placed itself is never overwritten", () => {
  const withPill = { subtext: "Register now at two.co", pillText: "LIMITED PLACES" };
  assert.equal(detectMisroutedCtaCopy(withPill), null);
  assert.equal(routeCtaCopyToCtaHome(withPill), null);
  assert.equal(withPill.subtext, "Register now at two.co", "nothing is moved or cleared");

  const withElement = { attribution: "Visit two.co", addTextElement: { class: "cta", text: "ENROL NOW" } };
  assert.equal(routeCtaCopyToCtaHome(withElement), null);
  assert.equal(withElement.attribution, "Visit two.co");
});

test("a plan with no CTA copy is untouched (no silent rewriting of ordinary plans)", () => {
  const patch = { headline: "Welcome Back", subtext: "Term 4 begins 6 January", attribution: "White Orchid" };
  const before = JSON.stringify(patch);
  assert.equal(routeCtaCopyToCtaHome(patch), null);
  assert.equal(JSON.stringify(patch), before);
});

test("the belt never throws on junk input", () => {
  for (const junk of [null, undefined, 0, "", [], { subtext: 12 }, { attribution: {} }]) {
    assert.doesNotThrow(() => detectMisroutedCtaCopy(junk));
  }
});

/* ── THE BINDING THE ROUTING RELIES ON ───────────────────────────────────── */

test("cta sits OUTSIDE the reading ranking, so a rehomed CTA cannot invert hierarchy", () => {
  assert.equal(classRank("cta"), null, "a pill is chrome, not a voice in the type hierarchy");
  assert.equal(TEXT_CLASS_RANK.cta, undefined);
});

test("cta is in the SMALL type tier — it can never out-grow the title", () => {
  assert.deepEqual(GLOBAL_STEP_RESPONSE.cta, GLOBAL_STEP_RESPONSE.body, "cta travels with the small tier");
  assert.ok(GLOBAL_STEP_RESPONSE.cta.grow < GLOBAL_STEP_RESPONSE.heading.grow);
});
