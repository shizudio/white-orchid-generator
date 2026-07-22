import test from "node:test";
import assert from "node:assert/strict";
import {
  ELEMENT_CLASSES,
  isElementClass,
  canTransitionClass,
  normalizeTextElement,
  normalizeTextElements,
  deriveElementsFromLegacyContent,
  resolveTextElements,
  DEFAULT_ELEMENT_PRIORITY_BY_CLASS,
} from "../../lib/text-elements.mjs";

test("the element class set is closed at exactly the five sanctioned classes", () => {
  assert.deepEqual([...ELEMENT_CLASSES].sort(), ["body", "caption", "cta", "heading", "subheading"]);
  for (const cls of ELEMENT_CLASSES) assert.equal(isElementClass(cls), true);
  assert.equal(isElementClass("title"), false);
  assert.equal(isElementClass("button"), false);
  assert.equal(isElementClass(""), false);
  assert.equal(isElementClass(null), false);
});

test("class transitions accept only sanctioned targets and reject self / freeform", () => {
  assert.equal(canTransitionClass("heading", "caption"), true);
  assert.equal(canTransitionClass("caption", "cta"), true);
  assert.equal(canTransitionClass("body", "subheading"), true);
  // Never a no-op self-transition.
  assert.equal(canTransitionClass("heading", "heading"), false);
  // Never a freeform / non-enum target or source.
  assert.equal(canTransitionClass("heading", "title"), false);
  assert.equal(canTransitionClass("banner", "heading"), false);
  // Every sanctioned pair (from != to) is currently permitted.
  for (const from of ELEMENT_CLASSES) for (const to of ELEMENT_CLASSES) {
    assert.equal(canTransitionClass(from, to), from !== to, `${from}->${to}`);
  }
});

test("normalizeTextElement fills the canonical shape and clamps an invalid class to body", () => {
  const el = normalizeTextElement({ uid: "el_a", class: "heading", text: "Hi" }, 0);
  assert.deepEqual(el, {
    uid: "el_a",
    class: "heading",
    text: "Hi",
    authorship: "owner",
    required: false,
    priority: DEFAULT_ELEMENT_PRIORITY_BY_CLASS.heading,
    sourceRole: null,
    master: {},
    byDim: {},
    pins: {},
  });
  const junkClass = normalizeTextElement({ class: "shout", text: "x" }, 3);
  assert.equal(junkClass.class, "body");
  assert.equal(junkClass.uid, "el_body_3");
  assert.equal(normalizeTextElement(null), null);
  assert.equal(normalizeTextElement("nope"), null);
});

test("normalizeTextElements drops junk and de-duplicates uids (first wins)", () => {
  const list = normalizeTextElements([
    { uid: "el_1", class: "heading", text: "A" },
    null,
    { uid: "el_1", class: "body", text: "dupe" },
    { uid: "el_2", class: "cta", text: "Go" },
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].text, "A");
  assert.equal(list[1].uid, "el_2");
});

test("migration derives elements from the legacy fixed roles per the spec mapping", () => {
  const content = {
    headline: "Open house",
    subtext: "This Saturday",
    attribution: "The White Orchid",
    dateText: "18 July",
    microLabel: "ENROLLING",
    pillText: "RSVP",
  };
  const elements = deriveElementsFromLegacyContent(content, { headline: "owner", subtext: "ai" });
  const byRole = Object.fromEntries(elements.map(e => [e.sourceRole, e]));
  assert.equal(byRole.headline.class, "heading");
  assert.equal(byRole.headline.required, true);
  assert.equal(byRole.headline.authorship, "owner");
  assert.equal(byRole.headline.uid, "legacy:headline");
  assert.equal(byRole.subtext.class, "subheading");
  assert.equal(byRole.subtext.authorship, "ai");
  assert.equal(byRole.attribution.class, "caption");
  assert.equal(byRole.dateText.class, "caption");
  assert.equal(byRole.microLabel.class, "caption");
  assert.equal(byRole.pillText.class, "cta");
  // Nothing but the hero is required by default.
  assert.equal(byRole.pillText.required, false);
});

test("migration never births an element for an empty or absent legacy role", () => {
  const elements = deriveElementsFromLegacyContent({
    headline: "Only me",
    subtext: "   ",
    attribution: "",
    dateText: "",
    microLabel: null,
    pillText: null,
  });
  assert.deepEqual(elements.map(e => e.sourceRole), ["headline"]);
});

test("resolveTextElements preserves a canonical collection but derives a legacy one", () => {
  const preserved = resolveTextElements({ elements: [{ uid: "el_x", class: "cta", text: "Buy" }] });
  assert.equal(preserved.length, 1);
  assert.equal(preserved[0].class, "cta");
  const derived = resolveTextElements({ headline: "Hero" });
  assert.equal(derived.length, 1);
  assert.equal(derived[0].sourceRole, "headline");
});

test("element derivation is idempotent and JSON-round-trip stable", () => {
  const content = { headline: "H", subtext: "S", pillText: "P" };
  const once = deriveElementsFromLegacyContent(content);
  // Re-resolving the derived collection preserves it byte-for-byte.
  const twice = resolveTextElements({ elements: once });
  assert.equal(JSON.stringify(twice), JSON.stringify(once));
  const roundTrip = resolveTextElements({ elements: JSON.parse(JSON.stringify(once)) });
  assert.equal(JSON.stringify(roundTrip), JSON.stringify(once));
});
