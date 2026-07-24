// Single source of truth for the CLIENT-FACING name of each text role, per post
// type. One vocabulary drives the on-canvas selection chip (EditorChrome), the
// contextual-inspector header, and the copy-field labels in ContentFieldsPanel —
// so a role is never called two different things across those surfaces. This
// closes the "CAPTION on the canvas chip vs a different field labelled Caption in
// the panel" collision (docs/ux-architecture.md §"Role-specific text selection").
//
// The names mirror ContentFieldsPanel's field labels, per (postType, role):
//   photo_logo/texture_text hero IS the caption/overlay (not a "title"); their
//   support line is "Support". quote's support is the "Attribution"; event's is
//   the "Details" line. hero elsewhere is the Title/Headline/Quote.
//
// postType-keyed: a NEW post type without an entry falls back to the generic
// Title/Text names (fails safe, never silently wrong). Keep in sync with the
// ContentFieldsPanel field labels when a post type's copy fields change.
const ROLE_LABELS_BY_POSTTYPE = Object.freeze({
  quote:        { hero: "Quote",    support: "Attribution" },
  event:        { hero: "Title",    support: "Details" },
  text_post:    { hero: "Headline", support: "Caption" },
  texture_text: { hero: "Overlay",  support: "Support" },
  photo_logo:   { hero: "Caption",  support: "Support" },
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
