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

// (Font Ruling B) The register an element may PIN — the closed set of sanctioned typographic
// voices. MIRRORS lib/typography-config.mjs SANCTIONED_REGISTERS 1:1 (the eleventh mirrored
// surface — run mirror-check.sh after any edit). A pinned register only takes effect when it
// is sanctioned for the element's CLASS (typography-config sanctionedRegistersForClass); the
// set-element-register command and the painter both enforce that. Default null = class default.
export const ELEMENT_REGISTERS = Object.freeze(["serif", "heavySans", "body", "eyebrow", "badge"]);
const ELEMENT_REGISTER_SET = new Set(ELEMENT_REGISTERS);
export const isElementRegister = value => ELEMENT_REGISTER_SET.has(value);

// (spec §2) The ONLY size freedom is the sanctioned S/M/L step within each class's
// register range — never a freeform px. This is the governance enum; the render-side
// step→multiplier table lives in element-placement-solver (ELEMENT_SIZE_STEPS). An
// element with no explicit step renders at the class default ("M").
export const ELEMENT_SIZE_STEP_IDS = Object.freeze(["S", "M", "L"]);
const ELEMENT_SIZE_STEP_SET = new Set(ELEMENT_SIZE_STEP_IDS);
export const isElementSizeStep = value => ELEMENT_SIZE_STEP_SET.has(value);

// (Amendment 2026-07-27 ruling 3 — BODY IS NOT REPEATABLE) The single Body element
// sections INTERNALLY instead: multi-paragraph text with a per-element paragraph-flow
// choice. The closed flow vocabulary — "stacked" (paragraphs run vertically, the
// default) or "columns" (paragraphs sit side by side). The choice rides the element
// property infra (master.flow, per-format via byDim[dim].flow) so it survives
// re-solves and round-trips like every other per-element property.
export const ELEMENT_FLOW_MODES = Object.freeze(["stacked", "columns"]);
const ELEMENT_FLOW_SET = new Set(ELEMENT_FLOW_MODES);
export const isElementFlow = value => ELEMENT_FLOW_SET.has(value);

// (Amendment 2026-07-27 ruling 2 — CLASS-EXCLUSIVE ADDS) One Heading, one Subheading,
// one Body, one Caption, one Button maximum. "In use" counts BOTH filled legacy-role
// projections and genuinely added elements — they are one system (projectTextElements
// is the truth, and content.elements holds exactly that projection). Adds are bounded
// by CLASS UNIQUENESS only, never by space or count otherwise; the crowding advisory
// stays the only voice on density within that bound.
export const ELEMENT_CLASS_PLAIN_LABELS = Object.freeze({
  heading: "Heading", subheading: "Subheading", body: "Body", caption: "Caption", cta: "Button",
});
/** The element classes currently IN USE on a document's content (projections + adds). */
export function elementClassesInUse(content) {
  const elements = Array.isArray(content?.elements) ? content.elements : [];
  return new Set(elements.map(element => element?.class).filter(isElementClass));
}
/**
 * The ratified tap-reason for a refused/greyed class (disabled-affordance pattern:
 * visibly inert + tap explains why). Body's reason ENCOURAGES internal sectioning
 * (ruling 3) instead of a second element. One vocabulary for the UI picker's inert
 * note, the reducer's refusal, and the chat belt's honest reply.
 */
export function classExclusiveReason(elementClass) {
  if (elementClass === "body") {
    return "Your design has a Body — add another paragraph inside it instead.";
  }
  const label = ELEMENT_CLASS_PLAIN_LABELS[elementClass] || "text like this";
  return `This design already has a ${label} — edit it in the list above.`;
}

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
// (Amendment 2026-07-27 ruling 1 — DEFAULT FILLS ARE HEADING + BODY) `subtext` — the
// secondary declared slot — now migrates as BODY, not subheading: a fresh design's two
// default rows present as Heading + Body under the standard class vocabulary. This is
// presentation + slot-fill vocabulary only: migrated roles still paint through their
// archetype slots, so stored documents render identically (the class re-label is
// render-invisible; only labels, class-exclusive counting and hierarchy rank read it).
export const LEGACY_ROLE_ORDER = Object.freeze([
  "headline",
  "subtext",
  "attribution",
  "dateText",
  "microLabel",
  "pillText",
]);
// (Phase B) The fields that BLANK to null rather than "" (nullable content fields).
export const LEGACY_ROLE_NULLABLE = Object.freeze(["microLabel", "pillText"]);
const LEGACY_ROLE_TO_CLASS = Object.freeze({
  headline: "heading",
  subtext: "body",
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
    // (Font Ruling B) The pinned register (null = class default). Junk/unknown → null; the
    // command + painter further gate it to the class's sanctioned registers.
    register: isElementRegister(source.register) ? source.register : null,
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
 * (TEXT UNIFICATION Phase B — FULL MERGE, docs/text-unification-spec.md §Phase B)
 * The legacy-role elements are a LIVE PROJECTION of the fixed content fields, not a
 * stored snapshot of them. Before the merge they were derived once at canonicalization
 * and then drifted: editing `content.headline` left `legacy:headline` holding the old
 * words, so "the element" and "the role" were two things wearing one name. Now the
 * role's storage IS the element's storage — one identity, one undo, one round-trip.
 *
 * Per-element METADATA that only the collection can hold (priority, register, pins,
 * master/byDim placement) is preserved from the stored entry when one exists, so a
 * pin on a migrated role survives the projection (law 5). Only the copy, class and
 * authorship re-derive.
 *
 * Byte-identity: for a canonical document whose fixed fields have not changed since
 * canonicalization, the projection reproduces the stored array exactly — same uids,
 * same legacy-first order, same values.
 */
export function projectTextElements(contentSource, authorship = {}) {
  const stored = Array.isArray(contentSource?.elements) ? normalizeTextElements(contentSource.elements) : [];
  const storedByUid = new Map(stored.map(element => [element.uid, element]));
  const projected = deriveElementsFromLegacyContent(contentSource, authorship).map(derived => {
    const prior = storedByUid.get(derived.uid);
    if (!prior) return derived;
    return {
      ...derived,
      priority: prior.priority,
      register: prior.register,
      master: prior.master,
      byDim: prior.byDim,
      pins: prior.pins,
    };
  });
  // Genuinely ADDED elements keep their stored order after the projected roles.
  const added = stored.filter(element => !element.sourceRole);
  return [...projected, ...added];
}

/**
 * Resolve the element collection for a document being (re)created. Legacy roles are
 * projected live from the fixed fields (see projectTextElements); genuinely added
 * elements are preserved verbatim, so a re-migration is idempotent.
 */
export function resolveTextElements(contentSource, authorship = {}) {
  return projectTextElements(contentSource, authorship);
}
