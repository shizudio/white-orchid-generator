// Text Elements — the closed, brand-governed set of user-addable content roles.
//
// docs/text-elements-spec.md (RATIFIED 2026-07-21). This is the document-model half
// of DLC §10-§12 made real: "any secondary content role may exist when the layout
// solver can place it cleanly." The client's ruling is law — element classes are a
// CLOSED set of FIVE (`heading | subheading | body | caption | cta`). No freeform
// font/size picker: unlimited elements, unlimited words, only brand-sanctioned ways
// for text to look. New classes are added to the brand profile by governed decision,
// never by a user dropdown.
//
// This module is pure (no React, no DOM). It owns the class enum, the sanctioned
// class-transition policy, element normalization, and the load-time migration that
// derives elements from the legacy fixed content roles. Rendering/placement of the
// elements is Slice 2 — in Slice 1 the collection is additive and the renderer never
// reads it, so old sessions render pixel-identical (guard battery D fingerprint).

export const ELEMENT_CLASSES = Object.freeze(["heading", "subheading", "body", "caption", "cta"]);
const ELEMENT_CLASS_SET = new Set(ELEMENT_CLASSES);
export const isElementClass = value => ELEMENT_CLASS_SET.has(value);

// (spec §2) The ONLY size freedom is the sanctioned S/M/L step within each class's
// register range — never a freeform px. This is the governance enum; the render-side
// step→multiplier table lives in element-placement-solver (ELEMENT_SIZE_STEPS). An
// element with no explicit step renders at the class default ("M").
export const ELEMENT_SIZE_STEP_IDS = Object.freeze(["S", "M", "L"]);
const ELEMENT_SIZE_STEP_SET = new Set(ELEMENT_SIZE_STEP_IDS);
export const isElementSizeStep = value => ELEMENT_SIZE_STEP_SET.has(value);

// (spec §3) Default drop priority per class — LOWER drops first under adaptation.
// Migrated legacy roles and user adds seed from this table; the owner may override.
export const DEFAULT_ELEMENT_PRIORITY_BY_CLASS = Object.freeze({
  heading: 100,
  subheading: 80,
  body: 60,
  cta: 50,
  caption: 40,
});
// A user-added element defaults optional and drops before core migrated content.
export const DEFAULT_ADDED_ELEMENT_PRIORITY = 30;

// (spec §1) `content/set-element-class` — "allowed transitions only." The closed
// enum IS the governance boundary: a class may only become another SANCTIONED class,
// never a freeform value, and never itself (a no-op). This table is the single place
// a brand profile can further restrict inter-class transitions in the future; today
// every sanctioned class may become any other sanctioned class.
export const ALLOWED_CLASS_TRANSITIONS = Object.freeze({
  heading: Object.freeze(["subheading", "body", "caption", "cta"]),
  subheading: Object.freeze(["heading", "body", "caption", "cta"]),
  body: Object.freeze(["heading", "subheading", "caption", "cta"]),
  caption: Object.freeze(["heading", "subheading", "body", "cta"]),
  cta: Object.freeze(["heading", "subheading", "body", "caption"]),
});
export function canTransitionClass(from, to) {
  if (!isElementClass(from) || !isElementClass(to) || from === to) return false;
  return ALLOWED_CLASS_TRANSITIONS[from]?.includes(to) === true;
}

// (spec §1) Legacy fixed-role → element-class migration mapping. `caption` covers the
// date/eyebrow/attribution "edge" roles (spec §3 caption anchoring); `cta` generalizes
// the pill. The order fixes deterministic array order + uid stability across migrations.
const LEGACY_ROLE_ORDER = Object.freeze([
  "headline",
  "subtext",
  "attribution",
  "dateText",
  "microLabel",
  "pillText",
]);
const LEGACY_ROLE_TO_CLASS = Object.freeze({
  headline: "heading",
  subtext: "subheading",
  attribution: "caption",
  dateText: "caption",
  microLabel: "caption",
  pillText: "cta",
});
// The hero headline is the one migrated role treated as required content.
const LEGACY_ROLE_REQUIRED = Object.freeze({ headline: true });

const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const clone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));

/** Normalize one element to the canonical shape (spec §1). Returns null for junk. */
export function normalizeTextElement(source, index = 0) {
  if (!isObject(source)) return null;
  const elementClass = isElementClass(source.class) ? source.class : "body";
  const uid = String(source.uid || `el_${elementClass}_${index}`);
  const priority = Number.isFinite(source.priority)
    ? source.priority
    : (DEFAULT_ELEMENT_PRIORITY_BY_CLASS[elementClass] ?? DEFAULT_ADDED_ELEMENT_PRIORITY);
  return {
    uid,
    class: elementClass,
    text: typeof source.text === "string" ? source.text : "",
    authorship: source.authorship === "ai" ? "ai" : "owner",
    required: source.required === true,
    priority,
    // Back-reference to the legacy fixed role this element migrated from (null for a
    // genuinely added element). Lets Slice 2 reconcile a migrated element with the
    // archetype's authored slot without guessing from class alone.
    sourceRole: typeof source.sourceRole === "string" ? source.sourceRole : null,
    master: isObject(source.master) ? clone(source.master) : {},
    byDim: isObject(source.byDim) ? clone(source.byDim) : {},
    pins: isObject(source.pins) ? clone(source.pins) : {},
  };
}

/** Normalize a collection, dropping malformed entries and duplicate uids (first wins). */
export function normalizeTextElements(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  value.forEach((element, index) => {
    const normalized = normalizeTextElement(element, index);
    if (!normalized || seen.has(normalized.uid)) return;
    seen.add(normalized.uid);
    out.push(normalized);
  });
  return out;
}

/**
 * Derive elements from the legacy fixed content roles (spec §1 migration mapping).
 * Only NON-EMPTY roles become elements — an absent legacy role does not birth an
 * empty element (born-clean; complete-or-absent). Deterministic uids (`legacy:<role>`)
 * keep the derivation idempotent and round-trip stable.
 */
export function deriveElementsFromLegacyContent(content, authorship = {}) {
  const out = [];
  LEGACY_ROLE_ORDER.forEach((role, index) => {
    const raw = content?.[role];
    const value = typeof raw === "string" ? raw : "";
    if (!value.trim()) return;
    const elementClass = LEGACY_ROLE_TO_CLASS[role];
    out.push(normalizeTextElement({
      uid: `legacy:${role}`,
      class: elementClass,
      text: value,
      authorship: authorship?.[role] === "ai" ? "ai" : "owner",
      required: LEGACY_ROLE_REQUIRED[role] === true,
      priority: DEFAULT_ELEMENT_PRIORITY_BY_CLASS[elementClass],
      sourceRole: role,
    }, index));
  });
  return out;
}

/**
 * Resolve the element collection for a document being (re)created. A canonical
 * document that already carries `content.elements` PRESERVES them (idempotent, so a
 * user's added/edited elements survive re-migration); a legacy document DERIVES them
 * from its fixed roles.
 */
export function resolveTextElements(contentSource, authorship = {}) {
  if (Array.isArray(contentSource?.elements)) return normalizeTextElements(contentSource.elements);
  return deriveElementsFromLegacyContent(contentSource, authorship);
}
