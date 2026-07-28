// Single source of truth for the CLIENT-FACING name of each text role, per post
// type. One vocabulary drives the on-canvas selection chip (EditorChrome), the
// contextual-inspector header, and the copy-field labels in ContentFieldsPanel —
// so a role is never called two different things across those surfaces. This
// closes the "CAPTION on the canvas chip vs a different field labelled Caption in
// the panel" collision (docs/ux-architecture.md §"Role-specific text selection").
//
// The names mirror ContentFieldsPanel's field labels, per (postType, role).
//
// (Amendment 2026-07-27 ruling 1 — DEFAULT FILLS ARE HEADING + BODY, ratified) The
// legacy "Caption"/"Support" labels are RETIRED from the default presentation: a
// fresh design's default rows present under the standard class vocabulary — the
// primary slot is HEADING, the secondary is BODY. Post types whose slots carry a
// deliberate archetype voice keep it (quote's "Quote"/"Attribution", event's
// "Title"/"Details", texture_text's "Overlay") — only the caption/support
// vocabulary retires. Presentation only: stored documents render identically.
//
// postType-keyed: a NEW post type without an entry falls back to the generic
// Title/Text names (fails safe, never silently wrong). Keep in sync with the
// ContentFieldsPanel field labels when a post type's copy fields change.
const ROLE_LABELS_BY_POSTTYPE = Object.freeze({
  quote:        { hero: "Quote",    support: "Attribution" },
  event:        { hero: "Title",    support: "Details" },
  text_post:    { hero: "Headline", support: "Body" },
  texture_text: { hero: "Overlay",  support: "Body" },
  photo_logo:   { hero: "Heading",  support: "Body" },
});

// Roles whose name is the same in every post type.
const COMMON_ROLE_LABELS = Object.freeze({
  date: "Date",
  eyebrow: "Label",
  pill: "Button",
});

/**
 * Client-facing Title-Case label for a selected text role. Used verbatim by the
 * inspector header and UPPER-cased by the on-canvas selection chip.
 * Unknown/added-element roles (`el:<uid>`) return the generic "Text".
 */
export function textRoleLabel(postType, role) {
  if (COMMON_ROLE_LABELS[role]) return COMMON_ROLE_LABELS[role];
  const perType = ROLE_LABELS_BY_POSTTYPE[postType];
  if (perType && perType[role]) return perType[role];
  return role === "hero" ? "Title" : "Text";
}
