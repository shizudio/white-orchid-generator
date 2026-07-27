// Slot fill — the FULL MERGE of added text elements and declared archetype roles.
//
// docs/text-unification-spec.md §Phase B (RATIFIED 2026-07-26, client ruling 3):
// "heading-element-fills-the-title-slot — adding an element whose class matches an
// empty slot BECOMES that slot's role. One system in truth, not just in UI."
//
// This module is the pure decision half. It answers ONE question: for the document
// as it stands, which DECLARED legacy content role (if any) should an added element
// of class C become? The answer is a role + its content field; the reducer then
// compiles the add into a write of that field, so the element and the role are the
// SAME stored thing — no dual painting, no phantom reservation, one undo step, and
// persistence round-trips as one identity because there is only one storage.
//
// Pure (no React, no DOM, no brand literals).

/* ── The declared content roles of a post type ────────────────────────────────
   Mirrors components/ContentFieldsPanel.jsx field-by-field — the fields a post type
   actually offers ARE its declared content slots. `hero` is universal (every post
   type has a headline); `support` is universal but reads a different field on a
   quote (whose support line IS the attribution); `date` is offered everywhere the
   panel offers a date field. `eyebrow` is conditional on the layout declaring a
   microLabel zone, so it is resolved from the document, not from this table.

   Deliberately ABSENT from the caption family: the bare `attribution` field on
   text_post. In the renderer, support text resolves as `subtext || attribution`
   (the supportText precedence), so writing attribution while subtext is blank
   would silently paint a SUPPORT line, not a caption — the merge must never make
   a caption read as a subheading. */
export const POST_TYPE_DECLARED_ROLES = Object.freeze({
  quote:        Object.freeze(["hero", "support"]),
  event:        Object.freeze(["hero", "support", "date"]),
  text_post:    Object.freeze(["hero", "support", "date"]),
  texture_text: Object.freeze(["hero", "support", "date"]),
  photo_logo:   Object.freeze(["hero", "support", "date"]),
});

/** The content field a declared role stores its copy in. */
export function contentFieldForRole(role, postType) {
  if (role === "hero") return "headline";
  // A quote's support line IS its attribution (ContentFieldsPanel binds it there).
  if (role === "support") return postType === "quote" ? "attribution" : "subtext";
  if (role === "date") return "dateText";
  if (role === "eyebrow") return "microLabel";
  if (role === "pill") return "pillText";
  return null;
}

/* ── class → the declared roles it may BECOME, in preference order ────────────
   Per the ratified mapping: heading→hero; subheading→support; caption→the
   caption/edge family (the eyebrow micro-label, then the date line — exactly the
   two registers the `caption` element class already renders in); cta→pill.
   `body` maps to nothing: it is a free reading block with no legacy fixed role,
   so a body element is always a genuine element. */
export const SLOT_FILL_ROLES_BY_CLASS = Object.freeze({
  heading:    Object.freeze(["hero"]),
  subheading: Object.freeze(["support"]),
  body:       Object.freeze([]),
  caption:    Object.freeze(["eyebrow", "date"]),
  cta:        Object.freeze(["pill"]),
});

const isBlank = value => !String(value ?? "").trim();

/**
 * The declared roles this DOCUMENT offers, resolved from the post type plus the
 * layout's own zones. A layout that declares a microLabel zone offers `eyebrow`;
 * a document already carrying a microLabel offers it too (the field is live).
 * `pill` is offered only when the document already carries a pillText field value
 * (null = the layout declares no badge) — the badge itself is archetype furniture,
 * which the canonical document does not mirror.
 */
export function declaredRolesForDocument(document) {
  const postType = document?.composition?.postType || "photo_logo";
  const roles = [...(POST_TYPE_DECLARED_ROLES[postType] || POST_TYPE_DECLARED_ROLES.photo_logo)];
  const layouts = document?.typography || {};
  const master = layouts.masterLayouts?.[postType] || {};
  const declaresMicroLabel = Object.values(layouts.formatLayouts || {})
    .some(byPostType => byPostType?.[postType]?.roles?.microLabel)
    || !!master.roles?.microLabel;
  if (declaresMicroLabel || document?.content?.microLabel != null) roles.push("eyebrow");
  if (document?.content?.pillText != null) roles.push("pill");
  return roles;
}

/**
 * The EMPTY declared slot an added element of `className` should become, or null
 * when there is none (every candidate role is either undeclared or already filled)
 * — in which case the add stays a genuine element and the placement solver seats it.
 * Returns { role, field }.
 */
export function slotFillTargetForClass(document, className) {
  const candidates = SLOT_FILL_ROLES_BY_CLASS[className] || [];
  if (!candidates.length) return null;
  // No document → no slots to fill (never guess a role onto nothing).
  if (!document || typeof document !== "object" || !document.content) return null;
  const declared = new Set(declaredRolesForDocument(document));
  const postType = document?.composition?.postType || "photo_logo";
  for (const role of candidates) {
    if (!declared.has(role)) continue;
    const field = contentFieldForRole(role, postType);
    if (!field) continue;
    if (!isBlank(document?.content?.[field])) continue;   // filled → not a free slot
    return { role, field };
  }
  return null;
}

/* ── The reverse map: a migrated element's `legacy:<field>` uid → the RENDER role
   whose row owns it. Used by the editor to focus the right row after a slot-fill
   add, so "+ Add text → Heading" visibly lands in the title row. Mirrors
   contentFieldForRole; `attribution` is the support line on a quote and the
   caption-ish credit elsewhere, and both live in the support row. */
export const LEGACY_FIELD_TO_ROLE = Object.freeze({
  headline: "hero",
  subtext: "support",
  attribution: "support",
  dateText: "date",
  microLabel: "eyebrow",
  pillText: "pill",
});
